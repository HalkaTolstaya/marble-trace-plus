//! Untrusted JSON from the Garage 61 API: the lap search answer and the
//! track/car catalogue must deserialize or fail, never panic, and the
//! selection over whatever came back must not panic either.
#![no_main]

use libfuzzer_sys::fuzz_target;
use mt_reflaps::garage61::{find_car, find_track, pick_best, CarInfo, LapSummary, TrackInfo};

#[derive(serde::Deserialize)]
struct Items<T> {
    items: Vec<T>,
}

fuzz_target!(|data: &[u8]| {
    if let Ok(laps) = serde_json::from_slice::<Items<LapSummary>>(data) {
        let _ = pick_best(&laps.items, false);
        let _ = pick_best(&laps.items, true);
    }

    if let Ok(tracks) = serde_json::from_slice::<Items<TrackInfo>>(data) {
        let _ = find_track(&tracks.items, 341);
    }

    if let Ok(cars) = serde_json::from_slice::<Items<CarInfo>>(data) {
        let _ = find_car(&cars.items, 173);
    }
});
