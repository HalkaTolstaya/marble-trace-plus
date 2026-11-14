//! Converts a full-rate [`RefLap`] into Marble's distance-bucketed
//! [`ReferenceLapData`], which the coach, the delta and the Input Trace
//! reference overlay read. The brake cue keeps the full-rate lap.

use mt_model::computed::reference_lap::{
    ReferenceLapData, ReferenceLapSample, TrackCondition, REFERENCE_LAP_BUCKET_COUNT,
};

use crate::lap::RefLap;

/// Resamples `lap` at the centre of each bucket, `(i + 0.5) / N`.
pub fn to_reference_data(
    lap: &RefLap,
    track_id: i32,
    car_screen_name: &str,
    condition: TrackCondition,
) -> ReferenceLapData {
    let samples = if lap.is_empty() || lap.hz <= 0.0 {
        Vec::new()
    } else {
        (0..REFERENCE_LAP_BUCKET_COUNT)
            .map(|bucket| {
                let centre = (bucket as f64 + 0.5) / REFERENCE_LAP_BUCKET_COUNT as f64;
                let index = lap.index_at_pct(centre);
                let speed = lap
                    .speed
                    .as_deref()
                    .map_or(0.0, |speed| RefLap::sample(speed, index));
                let time = (index / lap.hz).clamp(0.0, lap.lap_time);

                ReferenceLapSample {
                    speed: finite(speed),
                    throttle: finite(RefLap::sample(&lap.throttle, index)).clamp(0.0, 1.0),
                    brake: finite(RefLap::sample(&lap.brake, index)).clamp(0.0, 1.0),
                    lat_accel: None,
                    long_accel: None,
                    steering_wheel_angle: 0.0,
                    time_into_lap: time.is_finite().then_some(time as f32),
                }
            })
            .collect()
    };

    ReferenceLapData {
        track_id,
        car_screen_name: car_screen_name.to_owned(),
        lap_time: if lap.lap_time.is_finite() {
            lap.lap_time as f32
        } else {
            0.0
        },
        samples,
        condition,
        recorded_wetness: None,
        recorded_tire_wear: None,
        recorded_fuel_level: None,
    }
}

/// Payloads are finite (`docs/rules/backend.md`).
fn finite(value: f32) -> f32 {
    if value.is_finite() {
        value
    } else {
        0.0
    }
}
