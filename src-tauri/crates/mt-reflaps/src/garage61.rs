//! Garage 61 REST client (`https://garage61.net/api/v1`, OpenAPI v1).
//!
//! Only the four read endpoints the reference-lap flow needs: `/tracks`,
//! `/cars` (to map iRacing IDs to Garage 61 IDs through `platform_id`),
//! `/laps` (search) and `/laps/{id}/csv` (telemetry). See ADR-0013.

use serde::{Deserialize, Serialize};

use crate::net::{HttpTransport, NetError};
use crate::token::Token;

pub const PRODUCTION_BASE: &str = "https://garage61.net/api/v1";
/// The platform string Garage 61 uses for iRacing.
pub const IRACING_PLATFORM: &str = "iracing";

/// JSON responses larger than this are refused (the 1000-lap maximum page is
/// about 2 MiB).
pub const MAX_JSON_BYTES: usize = 4 * 1024 * 1024;
/// CSV telemetry larger than this is refused.
pub const MAX_CSV_BYTES: usize = crate::lap::MAX_CSV_BYTES;
/// Laps requested per search (the API's maximum).
const LAPS_PAGE: u32 = 1000;
/// `age=-1` is the API's "current season".
const CURRENT_SEASON: i64 = -1;
/// `lapTypes=1`: normal (full) laps only.
const NORMAL_LAPS: i64 = 1;
/// Longest lap id accepted into a URL path.
const MAX_LAP_ID_LEN: usize = 64;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TrackInfo {
    pub id: i64,
    pub name: String,
    #[serde(default)]
    pub variant: String,
    pub platform: String,
    #[serde(default)]
    pub platform_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CarInfo {
    pub id: i64,
    pub name: String,
    pub platform: String,
    #[serde(default)]
    pub platform_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct Items<T> {
    items: Vec<T>,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct UserInfo {
    #[serde(rename = "firstName", default)]
    pub first_name: String,
    #[serde(rename = "lastName", default)]
    pub last_name: String,
}

/// The fields of a `Lap` search result the selection reads.
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LapSummary {
    pub id: String,
    #[serde(default)]
    pub driver: Option<UserInfo>,
    pub lap_time: f64,
    #[serde(default)]
    pub clean: bool,
    #[serde(default)]
    pub incomplete: bool,
    #[serde(default)]
    pub missing: bool,
    #[serde(default)]
    pub discontinuity: bool,
    #[serde(default)]
    pub offtrack: bool,
    #[serde(default)]
    pub pitlane: bool,
    #[serde(default)]
    pub can_view_telemetry: bool,
    #[serde(default)]
    pub track_wetness: Option<f64>,
    #[serde(default)]
    pub start_time: Option<String>,
}

impl LapSummary {
    pub fn driver_name(&self) -> Option<String> {
        self.driver
            .as_ref()
            .map(|driver| {
                format!("{} {}", driver.first_name, driver.last_name)
                    .trim()
                    .to_owned()
            })
            .filter(|name| !name.is_empty())
    }

    /// A lap worth driving against: complete, clean, on track, with telemetry.
    pub fn usable(&self) -> bool {
        self.clean
            && !self.incomplete
            && !self.missing
            && !self.discontinuity
            && !self.offtrack
            && !self.pitlane
            && self.can_view_telemetry
            && self.lap_time.is_finite()
            && self.lap_time > 0.0
    }
}

/// The fastest usable lap; ties go to the first in the response.
pub fn pick_best(laps: &[LapSummary], wet: bool) -> Option<&LapSummary> {
    const WET_FROM_PERCENT: f64 = 30.0;

    let matches_condition = |lap: &&LapSummary| match lap.track_wetness {
        Some(wetness) if wet => wetness >= WET_FROM_PERCENT,
        Some(wetness) => wetness < WET_FROM_PERCENT,
        None => !wet,
    };

    laps.iter()
        .filter(|lap| lap.usable())
        .filter(matches_condition)
        .min_by(|left, right| left.lap_time.total_cmp(&right.lap_time))
}

/// The Garage 61 ID of the iRacing track or car with this numeric ID.
pub fn find_track(tracks: &[TrackInfo], iracing_track_id: i32) -> Option<&TrackInfo> {
    let wanted = iracing_track_id.to_string();

    tracks.iter().find(|track| {
        track.platform.eq_ignore_ascii_case(IRACING_PLATFORM)
            && track.platform_id.as_deref() == Some(wanted.as_str())
    })
}

pub fn find_car(cars: &[CarInfo], iracing_car_id: i32) -> Option<&CarInfo> {
    let wanted = iracing_car_id.to_string();

    cars.iter().find(|car| {
        car.platform.eq_ignore_ascii_case(IRACING_PLATFORM)
            && car.platform_id.as_deref() == Some(wanted.as_str())
    })
}

/// Lap ids go into a URL path: only `[A-Za-z0-9_-]`.
pub fn valid_lap_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= MAX_LAP_ID_LEN
        && id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
}

#[derive(Debug, Clone)]
pub struct Garage61Client<T> {
    transport: T,
    base: String,
}

impl<T: HttpTransport> Garage61Client<T> {
    pub fn new(transport: T, base: &str) -> Self {
        Self {
            transport,
            base: base.trim_end_matches('/').to_owned(),
        }
    }

    async fn json<R: for<'de> Deserialize<'de>>(
        &self,
        path: &str,
        token: &Token,
    ) -> Result<R, NetError> {
        let url = format!("{}{}", self.base, path);
        let body = self
            .transport
            .get(&url, token.expose(), MAX_JSON_BYTES)
            .await?;

        serde_json::from_slice(&body)
            .map_err(|error| NetError::Transport(format!("bad JSON: {error}")))
    }

    pub async fn tracks(&self, token: &Token) -> Result<Vec<TrackInfo>, NetError> {
        Ok(self.json::<Items<TrackInfo>>("/tracks", token).await?.items)
    }

    pub async fn cars(&self, token: &Token) -> Result<Vec<CarInfo>, NetError> {
        Ok(self.json::<Items<CarInfo>>("/cars", token).await?.items)
    }

    /// Laps of this track and car driven in the current season, ungrouped.
    pub async fn current_season_laps(
        &self,
        token: &Token,
        g61_track_id: i64,
        g61_car_id: i64,
    ) -> Result<Vec<LapSummary>, NetError> {
        let path = format!(
            "/laps?tracks={g61_track_id}&cars={g61_car_id}&age={CURRENT_SEASON}&group=none&lapTypes={NORMAL_LAPS}&limit={LAPS_PAGE}"
        );

        Ok(self.json::<Items<LapSummary>>(&path, token).await?.items)
    }

    pub async fn lap_csv(&self, token: &Token, lap_id: &str) -> Result<String, NetError> {
        if !valid_lap_id(lap_id) {
            return Err(NetError::Blocked(format!("lap id {lap_id:?}")));
        }

        let url = format!("{}/laps/{lap_id}/csv", self.base);
        let body = self
            .transport
            .get(&url, token.expose(), MAX_CSV_BYTES)
            .await?;

        String::from_utf8(body).map_err(|_| NetError::Transport("CSV is not UTF-8".into()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn lap(id: &str, time: f64) -> LapSummary {
        LapSummary {
            id: id.into(),
            driver: None,
            lap_time: time,
            clean: true,
            incomplete: false,
            missing: false,
            discontinuity: false,
            offtrack: false,
            pitlane: false,
            can_view_telemetry: true,
            track_wetness: Some(0.0),
            start_time: None,
        }
    }

    #[test]
    fn picks_the_fastest_usable_lap() {
        let mut dirty = lap("dirty", 100.0);
        dirty.clean = false;
        let mut hidden = lap("hidden", 101.0);
        hidden.can_view_telemetry = false;
        let laps = vec![
            lap("slow", 120.0),
            dirty,
            hidden,
            lap("best", 115.5),
            lap("mid", 118.0),
        ];

        assert_eq!(
            pick_best(&laps, false).map(|lap| lap.id.as_str()),
            Some("best")
        );
        assert!(pick_best(&laps, true).is_none());
    }

    #[test]
    fn wet_sessions_take_wet_laps() {
        let mut wet = lap("wet", 130.0);
        wet.track_wetness = Some(60.0);
        let laps = vec![lap("dry", 115.0), wet];

        assert_eq!(
            pick_best(&laps, true).map(|lap| lap.id.as_str()),
            Some("wet")
        );
        assert_eq!(
            pick_best(&laps, false).map(|lap| lap.id.as_str()),
            Some("dry")
        );
    }

    #[test]
    fn maps_iracing_ids_through_platform_id() {
        let tracks = vec![
            TrackInfo {
                id: 7,
                name: "Silverstone".into(),
                variant: "GP".into(),
                platform: "iracing".into(),
                platform_id: Some("341".into()),
            },
            TrackInfo {
                id: 8,
                name: "Silverstone".into(),
                variant: "GP".into(),
                platform: "acc".into(),
                platform_id: Some("341".into()),
            },
        ];

        assert_eq!(find_track(&tracks, 341).map(|track| track.id), Some(7));
        assert!(find_track(&tracks, 999).is_none());
    }

    #[test]
    fn lap_ids_cannot_escape_the_path() {
        assert!(valid_lap_id("01K5AAAAAAAAAAAAAAAAAAAAAA"));
        assert!(!valid_lap_id("../me"));
        assert!(!valid_lap_id("a/b"));
        assert!(!valid_lap_id("a?x=1"));
        assert!(!valid_lap_id(""));
    }
}
