//! Reference laps that do not come from the player's own driving: Garage 61
//! laps fetched for the session (ADR-0013) or imported from CSV, kept in one
//! local library, plus the brake-point countdown that grades the player
//! against the active one (ADR-0014).
//!
//! Parts of this crate are derived from Input Telemetry Overlay
//! (<https://github.com/mitchwarrenburg/input-telemetry-overlay>, v0.1.7),
//! Copyright (c) 2026 Mitch Warrenburg, used under the MIT licence; each such
//! file says so in its header. See `THIRD_PARTY_NOTICES.md`.

pub mod buckets;
pub mod cue;
pub mod garage61;
pub mod inbox;
pub mod lap;
pub mod library;
pub mod matching;
pub mod net;
pub mod service;
pub mod token;
