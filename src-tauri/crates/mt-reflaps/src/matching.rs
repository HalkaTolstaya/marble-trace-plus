//! Does an imported lap (no IDs, only names and a measured length) belong to
//! the session? Garage 61 laps fetched through the API carry iRacing IDs and
//! do not need this.
//!
//! Derived from Input Telemetry Overlay `src/matching.rs` (v0.1.7),
//! Copyright (c) 2026 Mitch Warrenburg, MIT licence. Simplified: no GPS check
//! (the session snapshot carries no coordinates).

use serde::Serialize;

/// Relative difference in lap length still taken for the same layout.
const LENGTH_TOLERANCE: f64 = 0.015;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum MatchStatus {
    /// Same track/layout and car.
    Match,
    /// Same track/layout, another car: still drawn, with a note.
    DifferentCar,
    /// Another track or layout: distances would not line up, so not used.
    DifferentTrack,
    /// Not enough information to tell.
    Unknown,
}

impl MatchStatus {
    pub fn aligns(self) -> bool {
        matches!(self, Self::Match | Self::DifferentCar)
    }
}

/// What the session says.
#[derive(Debug, Clone, PartialEq)]
pub struct SessionKey {
    pub track_id: i32,
    pub car_id: i32,
    pub track_name: String,
    pub track_config: String,
    pub car_name: String,
    pub track_length_m: f64,
}

/// Lower-case alphanumerics only, words kept apart.
fn normalize(text: &str) -> String {
    text.chars()
        .map(|ch| {
            if ch.is_alphanumeric() {
                ch.to_ascii_lowercase()
            } else {
                ' '
            }
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// "Dallara P217" and "Dallara P217 LMP2" are the same car; so are
/// "Porsche 911 GT3 R (992)" and "Porsche 911 GT3 R".
pub fn same_car(left: &str, right: &str) -> bool {
    let (left, right) = (normalize(left), normalize(right));

    if left.is_empty() || right.is_empty() {
        return false;
    }

    left == right
        || left.starts_with(&format!("{right} "))
        || right.starts_with(&format!("{left} "))
}

pub fn same_length(lap_length_m: f64, session_length_m: f64) -> bool {
    lap_length_m.is_finite()
        && session_length_m.is_finite()
        && session_length_m > 0.0
        && ((lap_length_m - session_length_m).abs() / session_length_m) <= LENGTH_TOLERANCE
}

/// Track names agree when every word of the shorter one appears in the longer.
fn same_track_name(lap_track: &str, session: &SessionKey) -> bool {
    let lap_words = normalize(lap_track);
    let session_words = normalize(&format!("{} {}", session.track_name, session.track_config));

    if lap_words.is_empty() || session_words.is_empty() {
        return false;
    }

    let session_set: Vec<&str> = session_words.split(' ').collect();

    normalize(&session.track_name)
        .split(' ')
        .all(|word| lap_words.split(' ').any(|candidate| candidate == word))
        || lap_words.split(' ').all(|word| session_set.contains(&word))
}

/// Status of an imported lap against the session.
pub fn status(
    lap_track: Option<&str>,
    lap_car: Option<&str>,
    lap_length_m: Option<f64>,
    session: Option<&SessionKey>,
) -> MatchStatus {
    let Some(session) = session else {
        return MatchStatus::Unknown;
    };
    let track_ok = match (lap_length_m, lap_track) {
        (Some(length), _) => same_length(length, session.track_length_m),
        (None, Some(track)) => same_track_name(track, session),
        (None, None) => return MatchStatus::Unknown,
    };

    if !track_ok {
        return MatchStatus::DifferentTrack;
    }

    match lap_car {
        Some(car) if same_car(car, &session.car_name) => MatchStatus::Match,
        Some(_) => MatchStatus::DifferentCar,
        None => MatchStatus::DifferentCar,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn session() -> SessionKey {
        SessionKey {
            track_id: 341,
            car_id: 173,
            track_name: "Silverstone Circuit".into(),
            track_config: "Arena Grand Prix".into(),
            car_name: "Ferrari 296 GT3".into(),
            track_length_m: 5891.0,
        }
    }

    #[test]
    fn car_suffixes_still_match() {
        assert!(same_car("Dallara P217", "Dallara P217 LMP2"));
        assert!(same_car("Porsche 911 GT3 R (992)", "porsche 911 gt3 r"));
        assert!(!same_car("Ferrari 296 GT3", "Ferrari 499P"));
        assert!(!same_car("", "x"));
    }

    #[test]
    fn length_decides_the_layout() {
        let session = session();

        assert_eq!(
            status(None, Some("Ferrari 296 GT3"), Some(5900.0), Some(&session)),
            MatchStatus::Match
        );
        assert_eq!(
            status(None, Some("BMW M4 GT3"), Some(5900.0), Some(&session)),
            MatchStatus::DifferentCar
        );
        assert_eq!(
            status(None, Some("Ferrari 296 GT3"), Some(3600.0), Some(&session)),
            MatchStatus::DifferentTrack
        );
        assert_eq!(
            status(None, None, None, Some(&session)),
            MatchStatus::Unknown
        );
        assert_eq!(status(None, None, Some(1.0), None), MatchStatus::Unknown);
    }

    #[test]
    fn names_are_the_fallback() {
        let session = session();

        assert_eq!(
            status(
                Some("Silverstone Circuit (Grand Prix)"),
                Some("Ferrari 296 GT3"),
                None,
                Some(&session)
            ),
            MatchStatus::Match
        );
        assert_eq!(
            status(Some("Monza"), Some("Ferrari 296 GT3"), None, Some(&session)),
            MatchStatus::DifferentTrack
        );
    }
}
