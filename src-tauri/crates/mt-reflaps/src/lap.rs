//! The lap model and the Garage 61 CSV parser.
//!
//! Derived from Input Telemetry Overlay `src/lap.rs` (v0.1.7),
//! Copyright (c) 2026 Mitch Warrenburg, MIT licence. Changes: input size,
//! row and column limits; no panics on malformed input; a compact CSV form for
//! the library.
//!
//! A lap is a list of samples taken at a fixed rate. `LapDistPct` (0..1) is
//! the key that lines a reference sample up with the live car, so laps of any
//! pace compare corner for corner.

use std::fmt;
use std::ops::Range;

/// A brake event starts when the pedal goes above this…
pub const BRAKE_ON: f32 = 0.05;
/// …and ends when it drops below this (hysteresis).
pub const BRAKE_OFF: f32 = 0.02;
/// iRacing's telemetry rate, and the rate Garage 61 exports at.
pub const TELEMETRY_HZ: f64 = 60.0;
/// Columns a reference file must have.
pub const REQUIRED_COLUMNS: [&str; 3] = ["LapDistPct", "Brake", "Throttle"];

/// Largest CSV accepted, in bytes. A 60 Hz Garage 61 export of a 9-minute
/// Nordschleife lap with every column is about 6 MiB.
pub const MAX_CSV_BYTES: usize = 32 * 1024 * 1024;
/// Most data rows read (an hour at 60 Hz). The rest is ignored.
pub const MAX_ROWS: usize = 216_000;
/// Most header columns accepted.
pub const MAX_COLUMNS: usize = 512;
/// A lap shorter than this many seconds is not a lap.
const MIN_LAP_SECONDS: f64 = 10.0;

/// Without a Gear column: a throttle pulse this short that jumps up from and
/// falls back to [`BLIP_FLOOR`] is taken for an auto-blip.
const BLIP_MAX_S: f64 = 0.2;
const BLIP_FLOOR: f32 = 0.05;
/// A blip's first sample jumps at least this much; a foot rises far slower.
const BLIP_JUMP: f32 = 0.15;
/// While a blip is building, each sample rises at least this much.
const BLIP_RISE: f32 = 0.05;
/// Samples before the gear reads neutral that a blip may already have started.
const BLIP_LEAD: usize = 2;
/// Seconds after the new gear engages that a blip may take to die away.
const BLIP_DECAY_S: f64 = 0.2;

/// What the Garage 61 file name tells us about a lap.
#[derive(Debug, Clone, Default, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LapMeta {
    /// File name without directory or `.csv`.
    pub file_name: String,
    /// `Some("Garage 61")` when the name follows Garage 61's export pattern.
    pub source: Option<String>,
    pub driver: Option<String>,
    pub car: Option<String>,
    pub track: Option<String>,
    /// Seconds.
    pub lap_time: Option<f64>,
}

/// One braking zone: sample range and the highest pedal value inside it.
#[derive(Debug, Clone, Copy, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrakeZone {
    pub start: usize,
    pub end: usize,
    pub peak_idx: usize,
    pub peak: f32,
}

#[derive(Debug, Clone, PartialEq)]
pub struct RefLap {
    pub meta: LapMeta,
    /// Samples per second.
    pub hz: f64,
    /// Seconds.
    pub lap_time: f64,
    /// Metres, from integrating the Speed column (`None` without one).
    pub track_length_est: Option<f64>,
    /// Lap fraction per sample, non-decreasing.
    pub pct: Vec<f64>,
    pub brake: Vec<f32>,
    pub throttle: Vec<f32>,
    /// m/s, when the file has a Speed column.
    pub speed: Option<Vec<f32>>,
    pub zones: Vec<BrakeZone>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum LapError {
    TooLarge,
    TooManyColumns,
    MissingColumns(Vec<&'static str>),
    TooShort,
}

impl fmt::Display for LapError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::TooLarge => write!(formatter, "the file is larger than {MAX_CSV_BYTES} bytes"),
            Self::TooManyColumns => {
                write!(formatter, "the file has more than {MAX_COLUMNS} columns")
            }
            Self::MissingColumns(columns) => {
                write!(formatter, "missing columns: {}", columns.join(", "))
            }
            Self::TooShort => write!(formatter, "less than 10 seconds of driving"),
        }
    }
}

impl std::error::Error for LapError {}

/// Parses Garage 61 export names:
/// `Garage 61 - Driver - Car - Track (Layout) - 01.55.992 - ULID.csv`, the
/// older `Garage_61__Driver__Car__Track__01.55.992__ULID.csv`, and either with
/// a browser's `(1)` re-download suffix.
pub fn parse_file_name(file_name: &str) -> LapMeta {
    let base = file_name.rsplit(['/', '\\']).next().unwrap_or(file_name);
    let base = strip_download_suffix(strip_csv_ext(base));
    let mut meta = LapMeta {
        file_name: base.to_string(),
        ..LapMeta::default()
    };
    let parts: Vec<String> = if base.starts_with("Garage 61 - ") {
        base.split(" - ")
            .map(|part| part.trim().to_string())
            .collect()
    } else if base.starts_with("Garage_61__") {
        base.split("__")
            .map(|part| part.replace('_', " ").trim().to_string())
            .collect()
    } else {
        return meta;
    };
    let time_index = parts
        .iter()
        .position(|part| parse_g61_time(part).is_some())
        .filter(|&index| index >= 4);

    if let Some(time_index) = time_index {
        meta.source = Some("Garage 61".into());
        meta.driver = parts.get(1).cloned();
        meta.car = parts.get(2).cloned();
        meta.track = parts.get(3..time_index).map(|track| track.join(" - "));
        meta.lap_time = parts.get(time_index).and_then(|time| parse_g61_time(time));
    }

    meta
}

fn strip_csv_ext(name: &str) -> &str {
    match name.len().checked_sub(4) {
        Some(cut) if name.is_char_boundary(cut) && name[cut..].eq_ignore_ascii_case(".csv") => {
            &name[..cut]
        }
        _ => name,
    }
}

/// `name(1)` → `name` (browsers add this, with no space, on a re-download).
fn strip_download_suffix(name: &str) -> &str {
    let Some(open) = name.strip_suffix(')').and_then(|rest| rest.rfind('(')) else {
        return name;
    };
    let inner = &name[open + 1..name.len() - 1];
    let digits = !inner.is_empty() && inner.chars().all(|ch| ch.is_ascii_digit());

    if digits && !name[..open].ends_with(' ') {
        &name[..open]
    } else {
        name
    }
}

/// `01.55.992` → 115.992 s.
pub fn parse_g61_time(text: &str) -> Option<f64> {
    let mut parts = text.trim().split('.');
    let (minutes, seconds, millis) = (parts.next()?, parts.next()?, parts.next()?);
    let shaped = parts.next().is_none()
        && (1..=2).contains(&minutes.len())
        && seconds.len() == 2
        && millis.len() == 3
        && minutes
            .chars()
            .chain(seconds.chars())
            .chain(millis.chars())
            .all(|ch| ch.is_ascii_digit());

    if !shaped {
        return None;
    }

    Some(
        minutes.parse::<f64>().ok()? * 60.0
            + seconds.parse::<f64>().ok()?
            + millis.parse::<f64>().ok()? / 1000.0,
    )
}

/// `115.992` → `1:55.992`.
pub fn format_lap_time(seconds: f64) -> String {
    if !seconds.is_finite() || seconds < 0.0 {
        return "–".into();
    }

    let total_ms = (seconds * 1000.0).round() as u64;
    let (minutes, rest) = (total_ms / 60_000, total_ms % 60_000);

    format!("{}:{:02}.{:03}", minutes, rest / 1000, rest % 1000)
}

/// Flattens the auto-blips in a throttle trace. Garage 61 exports iRacing's
/// `Throttle`, where the car opens the throttle itself on every downshift; the
/// live overlay reads the pedal, which does not show them. Returns how many
/// were removed.
pub fn remove_blips(throttle: &mut [f32], gear: Option<&[i32]>, hz: f64) -> usize {
    match gear {
        Some(gear) if gear.len() == throttle.len() && gear.contains(&0) => {
            remove_downshift_blips(throttle, gear, hz)
        }
        _ => remove_short_pulses(throttle, hz),
    }
}

fn remove_downshift_blips(throttle: &mut [f32], gear: &[i32], hz: f64) -> usize {
    let count = throttle.len();
    let decay = (BLIP_DECAY_S * hz).round() as usize;
    let mut removed = 0;
    let mut index = 1;

    while index < count {
        if gear[index] != 0 || gear[index - 1] <= 0 {
            index += 1;
            continue;
        }

        let neutral = index;

        while index < count && gear[index] == 0 {
            index += 1;
        }

        let engaged = index;

        if engaged == count || gear[engaged] <= 0 || gear[engaged] >= gear[neutral - 1] {
            continue;
        }

        let mut start = neutral;

        while start > 1
            && neutral - start < BLIP_LEAD
            && throttle[start - 1] > throttle[start - 2] + BLIP_RISE
        {
            start -= 1;
        }

        let mut end = engaged;

        while end + 1 < count && end < engaged + decay && throttle[end + 1] < throttle[end] - 0.01 {
            end += 1;
        }

        let before = throttle[start - 1];

        if throttle[start..end]
            .iter()
            .all(|&value| value <= before + 0.02)
        {
            continue;
        }

        bridge(throttle, start - 1, end);
        removed += 1;
    }

    removed
}

fn remove_short_pulses(throttle: &mut [f32], hz: f64) -> usize {
    let longest = (BLIP_MAX_S * hz).round().max(1.0) as usize;
    let mut removed = 0;
    let mut index = 1;

    while index < throttle.len() {
        if throttle[index] > BLIP_FLOOR && throttle[index - 1] <= BLIP_FLOOR {
            let Some(end) = (index..throttle.len()).find(|&probe| throttle[probe] <= BLIP_FLOOR)
            else {
                break;
            };

            if end - index <= longest && throttle[index] - throttle[index - 1] >= BLIP_JUMP {
                bridge(throttle, index - 1, end);
                removed += 1;
            }

            index = end;
        }

        index += 1;
    }

    removed
}

/// A straight line from sample `from` to sample `to`, replacing those between.
fn bridge(values: &mut [f32], from: usize, to: usize) {
    let (first, last) = (values[from], values[to]);
    let span = (to - from) as f32;

    for (offset, value) in values[from + 1..to].iter_mut().enumerate() {
        *value = first + (last - first) * (offset + 1) as f32 / span;
    }
}

/// Brake zones with hysteresis ([`BRAKE_ON`] / [`BRAKE_OFF`]).
pub fn find_zones(brake: &[f32]) -> Vec<BrakeZone> {
    let mut zones = Vec::new();
    let mut current: Option<BrakeZone> = None;

    for (index, &value) in brake.iter().enumerate() {
        match current.as_mut() {
            None => {
                if value > BRAKE_ON {
                    current = Some(BrakeZone {
                        start: index,
                        end: index,
                        peak_idx: index,
                        peak: value,
                    });
                }
            }
            Some(zone) => {
                if value > zone.peak {
                    zone.peak = value;
                    zone.peak_idx = index;
                }

                if value < BRAKE_OFF {
                    zone.end = index;
                    zones.push(*zone);
                    current = None;
                }
            }
        }
    }

    if let Some(mut zone) = current {
        zone.end = brake.len().saturating_sub(1);
        zones.push(zone);
    }

    zones
}

/// Parses a Garage 61 lap export (any CSV with `LapDistPct`, `Brake` and
/// `Throttle` columns). Never panics; rejects oversized input.
pub fn parse_garage61_csv(text: &str, file_name: &str) -> Result<RefLap, LapError> {
    parse_csv(text, parse_file_name(file_name), true)
}

/// Re-reads a lap the library stored with [`RefLap::to_compact_csv`]: the
/// metadata comes from the library index and the blips are already gone.
pub fn parse_stored_csv(text: &str, meta: LapMeta) -> Result<RefLap, LapError> {
    parse_csv(text, meta, false)
}

fn parse_csv(text: &str, meta: LapMeta, flatten_blips: bool) -> Result<RefLap, LapError> {
    if text.len() > MAX_CSV_BYTES {
        return Err(LapError::TooLarge);
    }

    let text = text.strip_prefix('\u{feff}').unwrap_or(text);
    let mut lines = text.lines();
    let header: Vec<&str> = lines
        .next()
        .unwrap_or("")
        .split(',')
        .map(str::trim)
        .collect();

    if header.len() > MAX_COLUMNS {
        return Err(LapError::TooManyColumns);
    }

    let column = |name: &str| {
        header
            .iter()
            .position(|head| head.eq_ignore_ascii_case(name))
    };
    let missing: Vec<&'static str> = REQUIRED_COLUMNS
        .iter()
        .copied()
        .filter(|name| column(name).is_none())
        .collect();
    let (Some(pct_col), Some(brake_col), Some(throttle_col)) =
        (column("LapDistPct"), column("Brake"), column("Throttle"))
    else {
        return Err(LapError::MissingColumns(missing));
    };
    let speed_col = column("Speed");
    let gear_col = column("Gear");

    let mut pct = Vec::new();
    let mut brake = Vec::new();
    let mut throttle = Vec::new();
    let mut speed = Vec::new();
    let mut gear: Vec<i32> = Vec::new();

    for line in lines.filter(|line| !line.is_empty()).take(MAX_ROWS) {
        let fields: Vec<&str> = line.split(',').take(MAX_COLUMNS).collect();
        let number = |index: usize| {
            fields
                .get(index)
                .and_then(|value| value.trim().parse::<f64>().ok())
                .filter(|value| value.is_finite())
        };
        let (Some(position), Some(brake_value), Some(throttle_value)) =
            (number(pct_col), number(brake_col), number(throttle_col))
        else {
            continue;
        };

        if !(0.0..=1.0 + 1e-6).contains(&position) {
            continue;
        }

        pct.push(position);
        brake.push(brake_value.clamp(0.0, 1.0) as f32);
        throttle.push(throttle_value.clamp(0.0, 1.0) as f32);
        speed.push(speed_col.and_then(number).unwrap_or(0.0).max(0.0) as f32);
        gear.push(gear_col.and_then(number).map_or(-1, |value| value as i32));
    }

    // Exports often carry a sample or two from the neighbouring lap: keep the
    // longest run between start/finish wraps (the later one on a tie).
    let mut keep = 0..0;
    let mut start = 0;

    for index in 1..=pct.len() {
        if index == pct.len() || pct[index] < pct[index - 1] - 0.5 {
            if index - start >= keep.len() {
                keep = start..index;
            }

            start = index;
        }
    }

    keep_range(&mut pct, &keep);
    keep_range(&mut brake, &keep);
    keep_range(&mut throttle, &keep);
    keep_range(&mut speed, &keep);
    keep_range(&mut gear, &keep);

    if (pct.len() as f64) < TELEMETRY_HZ * MIN_LAP_SECONDS {
        return Err(LapError::TooShort);
    }

    for index in 1..pct.len() {
        if pct[index] < pct[index - 1] {
            pct[index] = pct[index - 1];
        }
    }

    let samples = pct.len();
    let mut hz = meta
        .lap_time
        .map_or(TELEMETRY_HZ, |lap_time| samples as f64 / lap_time);

    if !(20.0..=400.0).contains(&hz) {
        hz = TELEMETRY_HZ;
    }

    let lap_time = meta.lap_time.unwrap_or(samples as f64 / hz);
    let track_length_est = speed_col.map(|_| {
        speed
            .iter()
            .map(|&value| f64::from(value) / hz)
            .sum::<f64>()
    });

    if flatten_blips {
        remove_blips(&mut throttle, gear_col.map(|_| gear.as_slice()), hz);
    }

    Ok(RefLap {
        zones: find_zones(&brake),
        meta,
        hz,
        lap_time,
        track_length_est,
        pct,
        brake,
        throttle,
        speed: speed_col.map(|_| speed),
    })
}

fn keep_range<T>(values: &mut Vec<T>, range: &Range<usize>) {
    values.truncate(range.end);
    values.drain(..range.start.min(values.len()));
}

impl RefLap {
    pub fn len(&self) -> usize {
        self.pct.len()
    }

    pub fn is_empty(&self) -> bool {
        self.pct.is_empty()
    }

    /// Fractional sample index at a lap fraction. Values before the first
    /// sample resolve against the previous lap's tail (negative index) and
    /// values after the last against the next lap's head, so the result is
    /// continuous across start/finish.
    pub fn index_at_pct(&self, position: f64) -> f64 {
        let values = &self.pct;
        let (Some(&first), Some(&last)) = (values.first(), values.last()) else {
            return 0.0;
        };
        let count = values.len();

        if position < first {
            let previous = last - 1.0;

            return -1.0 + (position - previous) / (first - previous).max(1e-9);
        }

        if position >= last {
            let next = first + 1.0;

            return (count - 1) as f64 + (position - last) / (next - last).max(1e-9);
        }

        let low = values
            .partition_point(|&value| value <= position)
            .saturating_sub(1);
        let high = (low + 1).min(count - 1);

        low as f64 + (position - values[low]) / (values[high] - values[low]).max(1e-9)
    }

    /// Value of `series` at a fractional sample index, linearly interpolated,
    /// wrapping around the lap.
    pub fn sample(series: &[f32], index: f64) -> f32 {
        let count = series.len();

        if count == 0 || !index.is_finite() {
            return 0.0;
        }

        let floor = index.floor();
        let fraction = (index - floor) as f32;
        let wrap = |value: f64| (value.rem_euclid(count as f64)) as usize % count;
        let (low, high) = (series[wrap(floor)], series[wrap(floor + 1.0)]);

        low + (high - low) * fraction
    }

    /// Four-column CSV copy of the lap: what the library stores.
    pub fn to_compact_csv(&self) -> String {
        let mut out = String::with_capacity(self.len() * 32 + 40);

        out.push_str("LapDistPct,Brake,Throttle,Speed\n");

        for index in 0..self.len() {
            let speed = self
                .speed
                .as_ref()
                .and_then(|speed| speed.get(index))
                .copied()
                .unwrap_or(0.0);

            out.push_str(&format!(
                "{:.7},{:.4},{:.4},{:.2}\n",
                self.pct[index], self.brake[index], self.throttle[index], speed
            ));
        }

        out
    }
}
