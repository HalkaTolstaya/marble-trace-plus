//! Converts a full-rate [`RefLap`] into Marble's distance-bucketed
//! [`ReferenceLapData`], which the coach, the delta and the Input Trace
//! reference overlay read. The brake cue keeps the full-rate lap.

use mt_model::computed::reference_lap::{
    ReferenceLapData, ReferenceLapSample, TrackCondition, REFERENCE_LAP_BUCKET_COUNT,
};

use crate::lap::{find_zones, LapMeta, RefLap, TELEMETRY_HZ};

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

/// The other way round, for the brake cue on a personal best: the buckets are
/// even in distance, the cue's clock needs samples even in time, so the lap
/// is resampled at 60 Hz from each bucket's `time_into_lap`. `None` when the
/// lap has no clock (recorded before the field existed) or is degenerate.
pub fn from_reference_data(data: &ReferenceLapData) -> Option<RefLap> {
    let count = data.samples.len();
    let lap_time = f64::from(data.lap_time);

    if count < 2 || !lap_time.is_finite() || lap_time <= 0.0 {
        return None;
    }

    // (time, pct, sample) per bucket centre; times must rise.
    let mut points = Vec::with_capacity(count);

    for (bucket, sample) in data.samples.iter().enumerate() {
        let time = f64::from(sample.time_into_lap?);
        let pct = (bucket as f64 + 0.5) / count as f64;

        if !time.is_finite() || points.last().is_some_and(|&(last, _, _)| time <= last) {
            continue;
        }

        points.push((time, pct, *sample));
    }

    if points.len() < 2 {
        return None;
    }

    let ticks = (lap_time * TELEMETRY_HZ).floor() as usize;
    let mut pct = Vec::with_capacity(ticks);
    let mut brake = Vec::with_capacity(ticks);
    let mut throttle = Vec::with_capacity(ticks);
    let mut speed = Vec::with_capacity(ticks);
    let mut cursor = 0;

    for tick in 0..ticks {
        let time = tick as f64 / TELEMETRY_HZ;

        while cursor + 2 < points.len() && points[cursor + 1].0 <= time {
            cursor += 1;
        }

        let (t0, p0, s0) = points[cursor];
        let (t1, p1, s1) = points[cursor + 1];
        let weight = ((time - t0) / (t1 - t0)).clamp(0.0, 1.0);
        let mix = |left: f32, right: f32| left + (right - left) * weight as f32;

        pct.push((p0 + (p1 - p0) * weight).clamp(0.0, 1.0));
        brake.push(mix(s0.brake, s1.brake).clamp(0.0, 1.0));
        throttle.push(mix(s0.throttle, s1.throttle).clamp(0.0, 1.0));
        speed.push(mix(s0.speed, s1.speed).max(0.0));
    }

    if pct.len() < 2 {
        return None;
    }

    Some(RefLap {
        zones: find_zones(&brake),
        meta: LapMeta {
            file_name: String::from("personal-best"),
            car: Some(data.car_screen_name.clone()),
            lap_time: Some(lap_time),
            ..LapMeta::default()
        },
        hz: TELEMETRY_HZ,
        lap_time,
        track_length_est: Some(
            speed
                .iter()
                .map(|&value| f64::from(value) / TELEMETRY_HZ)
                .sum(),
        ),
        pct,
        brake,
        throttle,
        speed: Some(speed),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_lap_without_a_clock_gives_no_cue_lap() {
        let mut data = to_reference_data(
            &RefLap {
                meta: LapMeta::default(),
                hz: 60.0,
                lap_time: 60.0,
                track_length_est: None,
                pct: (0..3600).map(|index| index as f64 / 3600.0).collect(),
                brake: vec![0.0; 3600],
                throttle: vec![1.0; 3600],
                speed: None,
                zones: Vec::new(),
            },
            1,
            "car",
            TrackCondition::Dry,
        );

        assert!(from_reference_data(&data).is_some());

        for sample in &mut data.samples {
            sample.time_into_lap = None;
        }

        assert!(from_reference_data(&data).is_none());
    }
}
