//! Parser, bucket conversion and brake cue against the bundled Garage 61
//! sample lap (an anonymised export shipped with ITO, MIT).

// Test helpers outside `#[test]` fns are not covered by clippy.toml's
// allow-*-in-tests; a panic in a helper is still how a test fails.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use mt_model::computed::reference_lap::{TrackCondition, REFERENCE_LAP_BUCKET_COUNT};
use mt_reflaps::buckets::to_reference_data;
use mt_reflaps::cue::{BrakeCue, CueConfig, CueInput, CueMode, Grade};
use mt_reflaps::lap::{
    find_zones, format_lap_time, parse_file_name, parse_garage61_csv, parse_stored_csv,
    remove_blips, LapError, RefLap,
};
use proptest::prelude::*;

const SAMPLE: &str = include_str!("fixtures/silverstone-gp-ferrari-296-gt3.csv");
const NAME: &str =
    "Garage 61 - Sample Lap - Ferrari 296 GT3 - Silverstone Circuit (Grand Prix) - 01.55.992 - SAMPLE.csv";
const TRACK_LENGTH: f64 = 5891.0;

fn sample() -> RefLap {
    parse_garage61_csv(SAMPLE, NAME).expect("sample parses")
}

#[derive(serde::Serialize)]
struct Summary {
    samples: usize,
    hz: String,
    lap_time: String,
    track_length_est: String,
    zones: usize,
    strong_zones: usize,
    first_zone_start_pct: String,
    meta: mt_reflaps::lap::LapMeta,
}

#[test]
fn sample_lap_summary_is_stable() {
    let lap = sample();
    let summary = Summary {
        samples: lap.len(),
        hz: format!("{:.3}", lap.hz),
        lap_time: format_lap_time(lap.lap_time),
        track_length_est: format!("{:.0}", lap.track_length_est.unwrap_or_default()),
        zones: lap.zones.len(),
        strong_zones: lap.zones.iter().filter(|zone| zone.peak >= 0.15).count(),
        first_zone_start_pct: format!("{:.4}", lap.pct[lap.zones[0].start]),
        meta: lap.meta.clone(),
    };

    insta::assert_json_snapshot!(summary);
}

#[test]
fn the_compact_copy_reads_back_identically() {
    let lap = sample();
    let stored = parse_stored_csv(&lap.to_compact_csv(), lap.meta.clone()).unwrap();

    assert_eq!(stored.len(), lap.len());
    assert_eq!(stored.zones.len(), lap.zones.len());
    assert!((stored.lap_time - lap.lap_time).abs() < 1e-9);

    for index in (0..lap.len()).step_by(97) {
        assert!((stored.brake[index] - lap.brake[index]).abs() < 1e-3);
        assert!((stored.throttle[index] - lap.throttle[index]).abs() < 1e-3);
    }
}

#[test]
fn missing_columns_and_short_files_are_rejected() {
    assert_eq!(
        parse_garage61_csv("Speed,Brake\n1,0\n", "x.csv").unwrap_err(),
        LapError::MissingColumns(vec!["LapDistPct", "Throttle"])
    );

    let short: String = std::iter::once("LapDistPct,Brake,Throttle".to_string())
        .chain((0..100).map(|index| format!("{},0,1", index as f64 / 100.0)))
        .collect::<Vec<_>>()
        .join("\n");

    assert_eq!(
        parse_garage61_csv(&short, "x.csv").unwrap_err(),
        LapError::TooShort
    );
}

#[test]
fn oversized_input_is_refused_without_parsing() {
    let huge = "a".repeat(mt_reflaps::lap::MAX_CSV_BYTES + 1);

    assert_eq!(
        parse_garage61_csv(&huge, "x.csv").unwrap_err(),
        LapError::TooLarge
    );
}

#[test]
fn file_names_parse_like_ito() {
    let meta = parse_file_name(&format!("C:\\laps\\{NAME}"));

    assert_eq!(meta.car.as_deref(), Some("Ferrari 296 GT3"));
    assert_eq!(
        meta.track.as_deref(),
        Some("Silverstone Circuit (Grand Prix)")
    );
    assert!((meta.lap_time.unwrap() - 115.992).abs() < 1e-9);

    let dashes =
        parse_file_name("Garage 61 - A B - Car X - Road - America - Full - 02.01.500 - ID.CSV");

    assert_eq!(dashes.track.as_deref(), Some("Road - America - Full"));
    assert_eq!(parse_file_name("my lap.csv").source, None);
    assert_eq!(parse_file_name("é.csv").file_name, "é");
}

#[test]
fn downshift_blips_are_flattened() {
    let hz = 60.0;
    let mut throttle = vec![0.0f32; 40];
    let mut gear = vec![4; 40];

    for value in gear.iter_mut().take(20).skip(10) {
        *value = 0;
    }

    for value in gear.iter_mut().skip(20) {
        *value = 3;
    }

    for (index, value) in throttle.iter_mut().enumerate().take(20).skip(10) {
        *value = 0.6 - (index as f32 - 10.0) * 0.01;
    }

    assert_eq!(remove_blips(&mut throttle, Some(&gear), hz), 1);
    assert!(throttle.iter().all(|&value| value < 0.05));
}

#[test]
fn buckets_cover_the_lap_with_finite_values() {
    let lap = sample();
    let data = to_reference_data(&lap, 341, "Ferrari 296 GT3", TrackCondition::Dry);

    assert_eq!(data.samples.len(), REFERENCE_LAP_BUCKET_COUNT);
    assert!((data.lap_time - 115.992).abs() < 1e-3);

    let times: Vec<f32> = data
        .samples
        .iter()
        .filter_map(|sample| sample.time_into_lap)
        .collect();

    assert_eq!(times.len(), REFERENCE_LAP_BUCKET_COUNT);
    assert!(times.windows(2).all(|pair| pair[1] >= pair[0]));
    assert!(data
        .samples
        .iter()
        .all(|sample| sample.speed.is_finite() && (0.0..=1.0).contains(&sample.brake)));
}

/// Drives the reference lap back through the cue at 60 Hz with the brake
/// shifted by `offset_s`, and returns the grades given.
fn drive(offset_s: f64, laps: usize) -> Vec<Grade> {
    let lap = sample();
    let mut cue = BrakeCue::default();
    let config = CueConfig::default();
    let mut grades = Vec::new();
    let total = (lap.len() * laps) as i64;
    let shift = (offset_s * lap.hz).round() as i64;

    for tick in 0..total {
        let index = (tick as usize) % lap.len();
        let brake_index = (tick - shift).rem_euclid(lap.len() as i64) as usize;
        let input = CueInput {
            session_time: tick as f64 / lap.hz,
            lap_dist_pct: lap.pct[index],
            brake: lap.brake[brake_index],
            track_length_m: TRACK_LENGTH,
        };
        let frame = cue.update(Some(input), Some(&lap), &config);

        if let Some(flash) = frame.flash {
            if grades.last() != Some(&flash.grade) || frame.mode != CueMode::Braking {
                grades.push(flash.grade);
            }
        }
    }

    grades
}

#[test]
fn braking_on_the_reference_point_is_perfect() {
    let grades = drive(0.0, 2);

    assert!(!grades.is_empty());
    assert!(
        grades.iter().all(|&grade| grade == Grade::Perfect),
        "{grades:?}"
    );
}

#[test]
fn braking_late_is_graded_late() {
    let grades = drive(0.15, 2);

    assert!(grades.contains(&Grade::Late), "{grades:?}");
    assert!(!grades.contains(&Grade::Perfect));
}

#[test]
fn the_countdown_counts_three_two_one_before_a_zone() {
    let lap = sample();
    let mut cue = BrakeCue::default();
    let config = CueConfig::default();
    let mut beats = Vec::new();

    for index in 0..lap.len() {
        let frame = cue.update(
            Some(CueInput {
                session_time: index as f64 / lap.hz,
                lap_dist_pct: lap.pct[index],
                brake: 0.0,
                track_length_m: TRACK_LENGTH,
            }),
            Some(&lap),
            &config,
        );

        if frame.mode == CueMode::Countdown && beats.last() != Some(&frame.beat) {
            beats.push(frame.beat);
        }
    }

    let joined: String = beats.iter().map(u8::to_string).collect();

    assert!(joined.contains("321"), "{joined}");
}

#[test]
fn no_reference_and_no_car_are_reported() {
    let lap = sample();
    let mut cue = BrakeCue::default();
    let config = CueConfig::default();

    assert_eq!(cue.update(None, None, &config).mode, CueMode::NoReference);
    assert_eq!(cue.update(None, Some(&lap), &config).mode, CueMode::NoCar);

    let flat = RefLap {
        zones: Vec::new(),
        ..lap.clone()
    };
    let input = CueInput {
        session_time: 1.0,
        lap_dist_pct: 0.5,
        brake: 0.0,
        track_length_m: TRACK_LENGTH,
    };

    assert_eq!(
        cue.update(Some(input), Some(&flat), &config).mode,
        CueMode::NoZones
    );
}

#[test]
fn grade_thresholds() {
    assert_eq!(Grade::of(None, 0.08, 0.03), Grade::NoBrake);
    assert_eq!(Grade::of(Some(0.02), 0.08, 0.03), Grade::Perfect);
    assert_eq!(Grade::of(Some(-0.05), 0.08, 0.03), Grade::Good);
    assert_eq!(Grade::of(Some(-0.2), 0.08, 0.03), Grade::Early);
    assert_eq!(Grade::of(Some(0.2), 0.08, 0.03), Grade::Late);
    assert_eq!(Grade::of(Some(-0.3), 0.08, 0.03), Grade::VeryEarly);
    assert_eq!(Grade::of(Some(0.3), 0.08, 0.03), Grade::VeryLate);
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(256))]

    /// Untrusted CSV: any text either parses or errors, never panics.
    #[test]
    fn parser_never_panics(text in ".{0,4000}", name in ".{0,80}") {
        let _ = parse_garage61_csv(&text, &name);
        let _ = parse_file_name(&name);
    }

    /// Rows of random numbers under a valid header still never panic, and a
    /// parsed lap has a non-decreasing position and in-range pedals.
    #[test]
    fn parsed_laps_are_well_formed(rows in prop::collection::vec((any::<f64>(), any::<f64>(), any::<f64>(), 0i32..8), 0..1500)) {
        let mut text = String::from("LapDistPct,Brake,Throttle,Gear\n");

        for (pct, brake, throttle, gear) in &rows {
            text.push_str(&format!("{pct},{brake},{throttle},{gear}\n"));
        }

        if let Ok(lap) = parse_garage61_csv(&text, "x.csv") {
            prop_assert!(lap.pct.windows(2).all(|pair| pair[1] >= pair[0]));
            prop_assert!(lap.brake.iter().chain(&lap.throttle).all(|value| (0.0..=1.0).contains(value)));
            prop_assert!(lap.hz.is_finite() && lap.hz > 0.0);
        }
    }

    /// Lining up by lap distance is monotonic: further round the lap is never
    /// earlier on the reference clock.
    #[test]
    fn alignment_is_monotonic(a in 0.0f64..1.0, b in 0.0f64..1.0) {
        let lap = sample();
        let (low, high) = if a <= b { (a, b) } else { (b, a) };

        prop_assert!(lap.index_at_pct(low) <= lap.index_at_pct(high) + 1e-9);
        prop_assert!(lap.index_at_pct(low).is_finite());
    }

    /// Zones never overlap and their peak lies inside them.
    #[test]
    fn zones_are_ordered(brake in prop::collection::vec(0.0f32..1.0, 0..600)) {
        let zones = find_zones(&brake);

        for zone in &zones {
            prop_assert!(zone.start <= zone.peak_idx && zone.peak_idx <= zone.end);
        }

        prop_assert!(zones.windows(2).all(|pair| pair[0].end < pair[1].start));
    }

    /// Random telemetry (jumps, tows, resets, odd configs) never panics the
    /// cue and every number it emits is finite.
    #[test]
    fn cue_survives_random_input(
        ticks in prop::collection::vec((0.0f64..1.0, 0.0f32..1.0, -1.0f64..2.0), 1..300),
        lead in -5.0f64..20.0,
        tol in -1.0f64..2.0,
    ) {
        let lap = sample();
        let mut cue = BrakeCue::default();
        let config = CueConfig { lead, tol, ..CueConfig::default() };
        let mut time = 0.0;

        for (pct, brake, step) in ticks {
            time += step;
            let frame = cue.update(
                Some(CueInput { session_time: time, lap_dist_pct: pct, brake, track_length_m: TRACK_LENGTH }),
                Some(&lap),
                &config,
            );

            prop_assert!(frame.fill.is_finite() && frame.join.is_finite() && frame.dist.is_finite());
            prop_assert!(frame.until_brake.is_none_or(f32::is_finite));
            prop_assert!(serde_json::to_string(&frame).is_ok());
        }
    }
}

#[test]
fn a_bucketed_lap_round_trips_into_a_cue_lap() {
    let lap = sample();
    let data = to_reference_data(&lap, 341, "Ferrari 296 GT3", TrackCondition::Dry);
    let back = mt_reflaps::buckets::from_reference_data(&data).unwrap();

    assert!((back.lap_time - lap.lap_time).abs() < 1e-3);
    assert_eq!(back.zones.len(), lap.zones.len());

    // Brake points land within a tenth of a second of the original's.
    for (original, resampled) in lap.zones.iter().zip(&back.zones) {
        let original_t = original.start as f64 / lap.hz;
        let resampled_t = resampled.start as f64 / back.hz;

        assert!(
            (original_t - resampled_t).abs() < 0.1,
            "{original_t} vs {resampled_t}"
        );
    }
}
