//! The brake cue fed arbitrary telemetry (jumps, resets, NaN, odd settings)
//! against an arbitrary reference: no panic, and every frame serializes.
#![no_main]

use arbitrary::Arbitrary;
use libfuzzer_sys::fuzz_target;
use mt_reflaps::cue::{BrakeCue, CueConfig, CueInput};
use mt_reflaps::lap::{find_zones, LapMeta, RefLap};

#[derive(Arbitrary, Debug)]
struct Tick {
    time: f64,
    pct: f64,
    brake: f32,
    track_length: f64,
}

#[derive(Arbitrary, Debug)]
struct Input {
    brake: Vec<u8>,
    lap_time: f64,
    lead: f64,
    tol: f64,
    ticks: Vec<Tick>,
}

fuzz_target!(|input: Input| {
    let count = input.brake.len().clamp(2, 4000);
    let brake: Vec<f32> = (0..count)
        .map(|index| f32::from(*input.brake.get(index).unwrap_or(&0)) / 255.0)
        .collect();
    let lap = RefLap {
        meta: LapMeta::default(),
        hz: 60.0,
        lap_time: input.lap_time,
        track_length_est: None,
        pct: (0..count).map(|index| index as f64 / count as f64).collect(),
        throttle: vec![0.0; count],
        zones: find_zones(&brake),
        brake,
        speed: None,
    };
    let config = CueConfig {
        lead: input.lead,
        tol: input.tol,
        ..CueConfig::default()
    };
    let mut cue = BrakeCue::default();

    for tick in input.ticks.iter().take(2000) {
        let frame = cue.update(
            Some(CueInput {
                session_time: tick.time,
                lap_dist_pct: tick.pct,
                brake: tick.brake,
                track_length_m: tick.track_length,
            }),
            Some(&lap),
            &config,
        );

        assert!(serde_json::to_string(&frame).is_ok());
    }
});
