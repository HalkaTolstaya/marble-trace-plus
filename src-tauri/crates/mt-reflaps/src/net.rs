//! Outbound HTTP for reference laps: one allowlist, HTTPS with rustls only, no
//! redirects, bounded bodies, timeouts, and retries with backoff (ADR-0015).
//!
//! The transport is a trait so the Garage 61 client is tested against a local
//! mock server without touching the network.

use std::future::Future;
use std::time::Duration;

use reqwest::{redirect, StatusCode, Url};
use tracing::{debug, warn};

/// Hosts the app may call for reference laps.
pub const GARAGE61_HOST: &str = "garage61.net";

const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
/// Attempts per request, the first included.
const MAX_ATTEMPTS: u32 = 4;
const BACKOFF_BASE_MS: u64 = 500;
/// A `Retry-After` longer than this is not waited for.
const MAX_RETRY_AFTER: Duration = Duration::from_secs(30);
const USER_AGENT: &str = concat!("marble-trace-plus/", env!("CARGO_PKG_VERSION"));

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum NetError {
    /// The URL is not on the allowlist or not HTTPS.
    Blocked(String),
    Unauthorized,
    NotFound,
    RateLimited,
    Status(u16),
    TooLarge,
    Transport(String),
}

impl std::fmt::Display for NetError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Blocked(url) => write!(formatter, "request blocked by the allowlist: {url}"),
            Self::Unauthorized => write!(formatter, "the Garage 61 token was rejected"),
            Self::NotFound => write!(formatter, "not found"),
            Self::RateLimited => write!(formatter, "rate limited by the server"),
            Self::Status(code) => write!(formatter, "server answered {code}"),
            Self::TooLarge => write!(formatter, "the response is too large"),
            Self::Transport(detail) => write!(formatter, "network error: {detail}"),
        }
    }
}

impl std::error::Error for NetError {}

/// Which origins may be called.
#[derive(Debug, Clone)]
pub struct Allowlist {
    hosts: Vec<String>,
    require_https: bool,
}

impl Allowlist {
    /// The production list: Garage 61 over HTTPS, nothing else.
    pub fn production() -> Self {
        Self {
            hosts: vec![GARAGE61_HOST.to_owned()],
            require_https: true,
        }
    }

    /// A list for tests against a local mock server.
    pub fn for_tests(host: &str) -> Self {
        Self {
            hosts: vec![host.to_owned()],
            require_https: false,
        }
    }

    pub fn check(&self, url: &str) -> Result<Url, NetError> {
        let parsed = Url::parse(url).map_err(|_| NetError::Blocked(url.to_owned()))?;
        let scheme_ok =
            parsed.scheme() == "https" || (!self.require_https && parsed.scheme() == "http");
        let host_ok = parsed.host_str().is_some_and(|host| {
            self.hosts
                .iter()
                .any(|allowed| allowed.eq_ignore_ascii_case(host))
        });
        let no_userinfo = parsed.username().is_empty() && parsed.password().is_none();

        if scheme_ok && host_ok && no_userinfo {
            Ok(parsed)
        } else {
            Err(NetError::Blocked(url.to_owned()))
        }
    }
}

/// One GET with a bearer token, body capped at `max_bytes`.
pub trait HttpTransport: Send + Sync {
    fn get(
        &self,
        url: &str,
        bearer: &str,
        max_bytes: usize,
    ) -> impl Future<Output = Result<Vec<u8>, NetError>> + Send;
}

/// The real transport: reqwest over rustls, allowlisted.
#[derive(Debug, Clone)]
pub struct ReqwestTransport {
    client: reqwest::Client,
    allowlist: Allowlist,
}

impl ReqwestTransport {
    pub fn new(allowlist: Allowlist) -> Result<Self, NetError> {
        let client = reqwest::Client::builder()
            .redirect(redirect::Policy::none())
            .https_only(allowlist.require_https)
            .connect_timeout(CONNECT_TIMEOUT)
            .timeout(REQUEST_TIMEOUT)
            .user_agent(USER_AGENT)
            .build()
            .map_err(|error| NetError::Transport(error.to_string()))?;

        Ok(Self { client, allowlist })
    }

    async fn attempt(&self, url: &Url, bearer: &str, max_bytes: usize) -> Attempt {
        let response = match self
            .client
            .get(url.clone())
            .bearer_auth(bearer)
            .send()
            .await
        {
            Ok(response) => response,
            Err(error) => {
                return Attempt::Retry(NetError::Transport(error.without_url().to_string()), None)
            }
        };
        let status = response.status();

        if status == StatusCode::TOO_MANY_REQUESTS {
            let wait = response
                .headers()
                .get(reqwest::header::RETRY_AFTER)
                .and_then(|value| value.to_str().ok())
                .and_then(|value| value.trim().parse::<u64>().ok())
                .map(Duration::from_secs);

            return Attempt::Retry(NetError::RateLimited, wait);
        }

        if status.is_server_error() {
            return Attempt::Retry(NetError::Status(status.as_u16()), None);
        }

        if status == StatusCode::UNAUTHORIZED || status == StatusCode::FORBIDDEN {
            return Attempt::Fail(NetError::Unauthorized);
        }

        if status == StatusCode::NOT_FOUND {
            return Attempt::Fail(NetError::NotFound);
        }

        if !status.is_success() {
            return Attempt::Fail(NetError::Status(status.as_u16()));
        }

        if response
            .content_length()
            .is_some_and(|length| length > max_bytes as u64)
        {
            return Attempt::Fail(NetError::TooLarge);
        }

        let mut response = response;
        let mut body = Vec::new();

        loop {
            match response.chunk().await {
                Ok(Some(chunk)) => {
                    if body.len() + chunk.len() > max_bytes {
                        return Attempt::Fail(NetError::TooLarge);
                    }

                    body.extend_from_slice(&chunk);
                }
                Ok(None) => return Attempt::Done(body),
                Err(error) => {
                    return Attempt::Retry(
                        NetError::Transport(error.without_url().to_string()),
                        None,
                    )
                }
            }
        }
    }
}

enum Attempt {
    Done(Vec<u8>),
    Retry(NetError, Option<Duration>),
    Fail(NetError),
}

/// Exponential backoff with jitter: 0.5 s, 1 s, 2 s … plus up to 50 %.
pub fn backoff(attempt: u32) -> Duration {
    let base = BACKOFF_BASE_MS.saturating_mul(1 << attempt.min(6));
    let jitter = fastrand::u64(0..=base / 2);

    Duration::from_millis(base + jitter)
}

impl HttpTransport for ReqwestTransport {
    async fn get(&self, url: &str, bearer: &str, max_bytes: usize) -> Result<Vec<u8>, NetError> {
        let parsed = self.allowlist.check(url)?;
        let mut last_error = NetError::Transport("no attempt made".into());

        for attempt in 0..MAX_ATTEMPTS {
            match self.attempt(&parsed, bearer, max_bytes).await {
                Attempt::Done(body) => return Ok(body),
                Attempt::Fail(error) => return Err(error),
                Attempt::Retry(error, retry_after) => {
                    debug!(attempt, %error, path = parsed.path(), "garage61 request will be retried");
                    last_error = error;

                    if attempt + 1 == MAX_ATTEMPTS {
                        break;
                    }

                    let wait = match retry_after {
                        Some(wait) if wait <= MAX_RETRY_AFTER => wait,
                        Some(_) => break,
                        None => backoff(attempt),
                    };

                    tokio::time::sleep(wait).await;
                }
            }
        }

        warn!(error = %last_error, path = parsed.path(), "garage61 request failed");

        Err(last_error)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn production_allows_only_https_garage61() {
        let list = Allowlist::production();

        assert!(list.check("https://garage61.net/api/v1/laps").is_ok());
        assert!(list.check("http://garage61.net/api/v1/laps").is_err());
        assert!(list.check("https://evil.example/api").is_err());
        assert!(list.check("https://garage61.net.evil.example/").is_err());
        assert!(list.check("https://user:pw@garage61.net/").is_err());
        assert!(list.check("file:///etc/passwd").is_err());
        assert!(list.check("not a url").is_err());
    }

    #[test]
    fn backoff_grows_and_stays_bounded() {
        assert!(backoff(0) >= Duration::from_millis(500));
        assert!(backoff(0) <= Duration::from_millis(750));
        assert!(backoff(2) >= Duration::from_millis(2000));
        assert!(backoff(60) <= Duration::from_millis(500 * 64 * 3 / 2));
    }
}
