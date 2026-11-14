//! The Garage 61 personal access token. It lives in the OS credential store
//! (Windows Credential Manager), never in `settings.json`, never in the
//! webview, never in a log line (ADR-0015).

use std::fmt;
use std::sync::Mutex;

use keyring::Entry;
use tracing::warn;

const SERVICE: &str = "trailbrake";
const ACCOUNT: &str = "garage61-personal-access-token";
/// Longest token accepted from the settings field.
pub const MAX_TOKEN_LEN: usize = 512;

/// A token that prints as `Token(***)`.
#[derive(Clone, PartialEq, Eq)]
pub struct Token(String);

impl Token {
    /// Validates a token typed by the user: printable ASCII without spaces,
    /// 8..=512 characters.
    pub fn parse(raw: &str) -> Option<Self> {
        let trimmed = raw.trim();
        let printable = trimmed.bytes().all(|byte| byte.is_ascii_graphic());

        (printable && (8..=MAX_TOKEN_LEN).contains(&trimmed.len()))
            .then(|| Self(trimmed.to_owned()))
    }

    pub fn expose(&self) -> &str {
        &self.0
    }
}

impl fmt::Debug for Token {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("Token(***)")
    }
}

pub trait TokenStore: Send + Sync {
    fn load(&self) -> Option<Token>;
    fn save(&self, token: &Token) -> bool;
    fn clear(&self);

    fn has_token(&self) -> bool {
        self.load().is_some()
    }
}

/// Windows Credential Manager (or the platform's store elsewhere).
#[derive(Debug, Default, Clone, Copy)]
pub struct KeyringTokenStore;

impl KeyringTokenStore {
    fn entry() -> Option<Entry> {
        match Entry::new(SERVICE, ACCOUNT) {
            Ok(entry) => Some(entry),
            Err(error) => {
                warn!("credential store unavailable: {error}");

                None
            }
        }
    }
}

impl TokenStore for KeyringTokenStore {
    fn load(&self) -> Option<Token> {
        match Self::entry()?.get_password() {
            Ok(value) => Token::parse(&value),
            Err(keyring::Error::NoEntry) => None,
            Err(error) => {
                warn!("failed to read the Garage 61 token: {error}");

                None
            }
        }
    }

    fn save(&self, token: &Token) -> bool {
        let Some(entry) = Self::entry() else {
            return false;
        };

        match entry.set_password(token.expose()) {
            Ok(()) => true,
            Err(error) => {
                warn!("failed to store the Garage 61 token: {error}");

                false
            }
        }
    }

    fn clear(&self) {
        let Some(entry) = Self::entry() else {
            return;
        };

        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => {}
            Err(error) => warn!("failed to clear the Garage 61 token: {error}"),
        }
    }
}

/// In-memory store for tests and for builds without a credential store.
#[derive(Debug, Default)]
pub struct MemoryTokenStore {
    token: Mutex<Option<Token>>,
}

impl MemoryTokenStore {
    pub fn with(token: &str) -> Self {
        Self {
            token: Mutex::new(Token::parse(token)),
        }
    }
}

impl TokenStore for MemoryTokenStore {
    fn load(&self) -> Option<Token> {
        self.token.lock().ok().and_then(|token| token.clone())
    }

    fn save(&self, token: &Token) -> bool {
        match self.token.lock() {
            Ok(mut slot) => {
                *slot = Some(token.clone());

                true
            }
            Err(_) => false,
        }
    }

    fn clear(&self) {
        if let Ok(mut slot) = self.token.lock() {
            *slot = None;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn debug_never_prints_the_token() {
        let token = Token::parse("g61_abcdefgh12345").unwrap();

        assert_eq!(format!("{token:?}"), "Token(***)");
        assert!(!format!("{:?}", Some(token)).contains("abcdef"));
    }

    #[test]
    fn rejects_malformed_tokens() {
        assert!(Token::parse("short").is_none());
        assert!(Token::parse("has a space inside").is_none());
        assert!(Token::parse(&"x".repeat(MAX_TOKEN_LEN + 1)).is_none());
        assert!(Token::parse("line\nbreak12345").is_none());
        assert_eq!(
            Token::parse("  trimmed-token  ").unwrap().expose(),
            "trimmed-token"
        );
    }

    #[test]
    fn memory_store_round_trips() {
        let store = MemoryTokenStore::default();

        assert!(!store.has_token());
        assert!(store.save(&Token::parse("abcdefgh").unwrap()));
        assert!(store.has_token());
        store.clear();
        assert!(!store.has_token());
    }
}
