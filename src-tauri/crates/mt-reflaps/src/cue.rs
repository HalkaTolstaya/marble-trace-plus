//! The brake point countdown: counts 3-2-1-BRAKE into each of the reference
//! lap's brake points, shows that zone's target peak, and grades when the
//! player's brake went on.
//!
//! Derived from Input Telemetry Overlay `src/cue.rs` and the brake events of
//! `src/trace.rs` (v0.1.7), Copyright (c) 2026 Mitch Warrenburg, MIT licence.
//! Changes: the brake-event tracker is folded in ([`BrakeTracker`]), the state
//! is a serialisable frame with finite values only, and no panics.
//!
//! Everything runs on the reference lap's clock (sample index ÷ Hz at the
//! car's lap position), which needs only the lap fraction from the sim. A
//! slower straight stretches the counts, but BRAKE always lands on the
//! reference brake point.

use std::collections::{HashMap, VecDeque};

use serde::Serialize;

use crate::lap::{RefLap, BRAKE_OFF, BRAKE_ON};

/// "Very" early or late: past this many times the good window.
const VERY: f64 = 3.0;
/// Seconds the bar shows the grade's colour after the brake goes on…
pub const FLASH_HOLD: f64 = 0.8;
/// …then fades out over this.
pub const FLASH_DRAIN: f64 = 0.3;
/// Seconds the final pressure stays shown after release.
pub const FINAL_HOLD: f64 = 3.0;
/// A brake-on this many seconds before a brake point still counts as that zone's.
const MATCH_BEFORE: f64 = 4.0;
/// Results kept (about eight laps of a twelve-zone track).
const MAX_RESULTS: usize = 120;
/// Brake events kept by the tracker.
const MAX_EVENTS: usize = 64;
/// The car moving back on the reference clock by more than this is a new
/// trace (a tow, a reset, a new session).
const BACKWARDS_S: f64 = 1.0;

/// How the brake-on compared with the reference's.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Grade {
    VeryEarly,
    Early,
    Good,
    Perfect,
    Late,
    VeryLate,
    NoBrake,
}

impl Grade {
    /// `dt`: the brake-on minus the reference's, reference seconds (`None`:
    /// no brake-on). `tol`: the ± good window; `perfect`: the ± perfect window.
    pub fn of(dt: Option<f64>, tol: f64, perfect: f64) -> Self {
        let Some(dt) = dt else {
            return Self::NoBrake;
        };
        let magnitude = dt.abs();

        if magnitude <= perfect {
            Self::Perfect
        } else if magnitude <= tol {
            Self::Good
        } else if magnitude <= VERY * tol {
            if dt < 0.0 {
                Self::Early
            } else {
                Self::Late
            }
        } else if dt < 0.0 {
            Self::VeryEarly
        } else {
            Self::VeryLate
        }
    }
}

/// The countdown's settings.
#[derive(Debug, Clone, Copy, PartialEq, serde::Deserialize, Serialize)]
#[serde(rename_all = "camelCase", default)]
pub struct CueConfig {
    /// Seconds for the three counts.
    pub lead: f64,
    /// Show BRAKE this many seconds before the reference brake point.
    pub early: f64,
    /// Zones whose reference peak is below this (0..1) get no countdown.
    pub min_peak: f32,
    /// ± seconds of the good window.
    pub tol: f64,
    /// ± seconds of the perfect window, inside the good one.
    pub perfect: f64,
}

impl Default for CueConfig {
    fn default() -> Self {
        Self {
            lead: 3.0,
            early: 0.0,
            min_peak: 0.15,
            tol: 0.08,
            perfect: 0.03,
        }
    }
}

impl CueConfig {
    /// Keeps every field inside a range the state machine handles.
    pub fn sanitized(self) -> Self {
        let clamp = |value: f64, low: f64, high: f64, fallback: f64| {
            if value.is_finite() {
                value.clamp(low, high)
            } else {
                fallback
            }
        };
        let defaults = Self::default();
        let tol = clamp(self.tol, 0.01, 1.0, defaults.tol);

        Self {
            lead: clamp(self.lead, 0.5, 10.0, defaults.lead),
            early: clamp(self.early, 0.0, 1.0, defaults.early),
            min_peak: if self.min_peak.is_finite() {
                self.min_peak.clamp(0.0, 1.0)
            } else {
                defaults.min_peak
            },
            tol,
            perfect: clamp(self.perfect, 0.0, tol, defaults.perfect),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum CueMode {
    NoReference,
    NoZones,
    NoCar,
    Idle,
    Countdown,
    Brake,
    Braking,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Flash {
    pub grade: Grade,
    pub alpha: f32,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FinalPeak {
    pub peak: f32,
    pub target: f32,
    pub age: f32,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Verdict {
    /// 1-based, in lap order among the counted zones.
    pub zone_no: usize,
    pub grade: Grade,
    /// The brake-on minus the reference's: seconds and metres.
    pub dt: Option<f32>,
    pub dm: Option<f32>,
    /// Past the brake point and not braking yet: `dt` is counting up.
    pub pending: bool,
    pub current: bool,
    pub peak: Option<f32>,
    pub target: f32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Pip {
    pub grade: Option<Grade>,
    /// From last lap.
    pub stale: bool,
    pub current: bool,
}

/// What the brake-point widget draws, one per overlay tick.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CueFrame {
    pub mode: CueMode,
    /// 3, 2 or 1 while counting; 0 otherwise.
    pub beat: u8,
    /// How much of the bar is filled, 0..1.
    pub fill: f32,
    /// How much of it a short straight skipped, 0..1.
    pub join: f32,
    pub zone_no: usize,
    pub zone_count: usize,
    /// Seconds to the moment BRAKE shows (negative once it has).
    pub until_brake: Option<f32>,
    /// Metres to the zone's brake point.
    pub dist: f32,
    pub target: Option<f32>,
    /// The brake pedal now, 0..1.
    pub live: f32,
    pub peak: Option<f32>,
    pub flash: Option<Flash>,
    pub final_peak: Option<FinalPeak>,
    pub verdict: Option<Verdict>,
    pub pips: Vec<Pip>,
}

impl CueFrame {
    pub fn empty(mode: CueMode) -> Self {
        Self {
            mode,
            beat: 0,
            fill: 0.0,
            join: 0.0,
            zone_no: 0,
            zone_count: 0,
            until_brake: None,
            dist: 0.0,
            target: None,
            live: 0.0,
            peak: None,
            flash: None,
            final_peak: None,
            verdict: None,
            pips: Vec::new(),
        }
    }
}

/// One brake application.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct BrakeEvent {
    pub peak: f32,
    pub active: bool,
    /// Where the brake went on: session seconds, cumulative metres.
    pub on_t: f64,
    pub on_d: f64,
    pub off_t: Option<f64>,
}

/// One telemetry tick, as the cue needs it.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct CueInput {
    /// Session seconds.
    pub session_time: f64,
    /// 0..1.
    pub lap_dist_pct: f64,
    /// Brake pedal 0..1.
    pub brake: f32,
    /// Track length in metres from the session.
    pub track_length_m: f64,
}

/// Follows the lap fraction across start/finish into a cumulative position
/// (laps since the trace started + fraction) and cuts brake events out of the
/// pedal with hysteresis.
#[derive(Debug, Default, Clone)]
pub struct BrakeTracker {
    laps: i64,
    last_pct: Option<f64>,
    events: VecDeque<BrakeEvent>,
}

impl BrakeTracker {
    pub fn reset(&mut self) {
        *self = Self::default();
    }

    /// Returns the cumulative lap position after this tick.
    pub fn push(&mut self, input: &CueInput) -> f64 {
        let pct = input.lap_dist_pct;

        if let Some(last) = self.last_pct {
            if pct < last - 0.5 {
                self.laps += 1;
            } else if pct > last + 0.5 {
                self.laps -= 1;
            }
        }

        self.last_pct = Some(pct);

        let position = self.laps as f64 + pct;
        let distance = position * input.track_length_m;
        let brake = input.brake;

        match self.events.back_mut() {
            Some(event) if event.active => {
                if brake > event.peak {
                    event.peak = brake;
                }

                if brake < BRAKE_OFF {
                    event.active = false;
                    event.off_t = Some(input.session_time);
                }
            }
            _ => {
                if brake > BRAKE_ON {
                    self.events.push_back(BrakeEvent {
                        peak: brake,
                        active: true,
                        on_t: input.session_time,
                        on_d: distance,
                        off_t: None,
                    });

                    while self.events.len() > MAX_EVENTS {
                        self.events.pop_front();
                    }
                }
            }
        }

        position
    }

    pub fn events(&self) -> impl Iterator<Item = &BrakeEvent> {
        self.events.iter()
    }
}

#[derive(Debug, Clone, Copy)]
struct Occurrence {
    lap: i64,
    zone: usize,
    start: f64,
    end: f64,
}

impl Occurrence {
    fn key(&self) -> (i64, usize) {
        (self.lap, self.zone)
    }
}

#[derive(Debug, Clone)]
struct Graded {
    lap: i64,
    zone: usize,
    dt: Option<f64>,
    dm: Option<f64>,
    event: Option<BrakeEvent>,
}

/// Grades brake-ons and works out what the widget shows. Resets itself when
/// the reference or the trace changes.
#[derive(Debug)]
pub struct BrakeCue {
    tracker: BrakeTracker,
    results: HashMap<(i64, usize), Graded>,
    order: VecDeque<(i64, usize)>,
    seen_to: f64,
    start: Option<f64>,
    last_clock: f64,
    last_t: f64,
    /// Lap time and track length the results are for.
    key: Option<(u64, u64, usize)>,
}

impl Default for BrakeCue {
    fn default() -> Self {
        Self {
            tracker: BrakeTracker::default(),
            results: HashMap::new(),
            order: VecDeque::new(),
            seen_to: f64::NEG_INFINITY,
            start: None,
            last_clock: 0.0,
            last_t: f64::NEG_INFINITY,
            key: None,
        }
    }
}

impl BrakeCue {
    pub fn reset(&mut self) {
        *self = Self::default();
    }

    /// Feeds one tick and returns the frame to draw. `lap`: the active
    /// reference (`None` without one); `input`: `None` while the car is not on
    /// track.
    pub fn update(
        &mut self,
        input: Option<CueInput>,
        lap: Option<&RefLap>,
        config: &CueConfig,
    ) -> CueFrame {
        let config = config.sanitized();
        let Some(lap) = lap.filter(|lap| lap.len() >= 2 && lap.hz > 0.0 && lap.lap_time > 0.0)
        else {
            return CueFrame::empty(CueMode::NoReference);
        };
        let Some(input) = input.filter(|input| {
            input.session_time.is_finite()
                && input.lap_dist_pct.is_finite()
                && (0.0..=1.0).contains(&input.lap_dist_pct)
                && input.track_length_m.is_finite()
        }) else {
            return CueFrame::empty(CueMode::NoCar);
        };
        let track_length = input.track_length_m;
        let key = (lap.lap_time.to_bits(), track_length.to_bits(), lap.len());

        if self.key != Some(key) {
            self.reset();
            self.key = Some(key);
        }

        let cue_zones: Vec<usize> = (0..lap.zones.len())
            .filter(|&zone| lap.zones[zone].peak >= config.min_peak)
            .collect();

        if cue_zones.is_empty() || track_length <= 0.0 {
            return CueFrame::empty(CueMode::NoZones);
        }

        if input.session_time < self.last_t {
            // A new session (or a replay restarting): nothing before applies.
            self.reset();
            self.key = Some(key);
        }

        let position = self.tracker.push(&input);
        let clock = Clock { lap };
        let now = clock.at(position);

        if now < self.last_clock - BACKWARDS_S {
            // A tow or reset: what was graded before does not apply, and the
            // brake-ons already seen must not be graded again.
            let tracker = std::mem::take(&mut self.tracker);
            let seen_to = tracker
                .events()
                .last()
                .map_or(f64::NEG_INFINITY, |event| event.on_t);

            self.reset();
            self.key = Some(key);
            self.tracker = tracker;
            self.seen_to = seen_to;
        }

        self.last_clock = now;
        self.last_t = input.session_time;

        let start = *self.start.get_or_insert(now);

        self.grade_new_brake_ons(&clock, &cue_zones, track_length);
        self.record_zones_without_braking(&clock, &cue_zones, now, start);

        self.frame(
            &input,
            position,
            now,
            &clock,
            &cue_zones,
            track_length,
            &config,
        )
    }

    fn grade_new_brake_ons(&mut self, clock: &Clock, cue_zones: &[usize], track_length: f64) {
        let by_on_t: HashMap<u64, BrakeEvent> = self
            .tracker
            .events()
            .map(|event| (event.on_t.to_bits(), *event))
            .collect();

        for result in self.results.values_mut() {
            if let Some(event) = result.event.as_mut() {
                if let Some(latest) = by_on_t.get(&event.on_t.to_bits()) {
                    *event = *latest;
                }
            }
        }

        let all: Vec<usize> = (0..clock.lap.zones.len()).collect();
        let fresh: Vec<BrakeEvent> = self
            .tracker
            .events()
            .filter(|event| event.on_t > self.seen_to)
            .copied()
            .collect();

        for event in fresh {
            self.seen_to = event.on_t;

            let position = event.on_d / track_length;
            let clock_at = clock.at(position);
            let Some(occurrence) = clock.matching(clock_at, &all) else {
                continue;
            };

            if !cue_zones.contains(&occurrence.zone) || self.results.contains_key(&occurrence.key())
            {
                continue;
            }

            let zone_start = clock.lap.zones[occurrence.zone].start;
            let reference_pct = clock.lap.pct.get(zone_start).copied().unwrap_or(0.0);
            let dm = (position - (occurrence.lap as f64 + reference_pct)) * track_length;

            self.record(Graded {
                lap: occurrence.lap,
                zone: occurrence.zone,
                dt: Some(clock_at - occurrence.start),
                dm: Some(dm),
                event: Some(event),
            });
        }
    }

    fn record_zones_without_braking(
        &mut self,
        clock: &Clock,
        cue_zones: &[usize],
        now: f64,
        start: f64,
    ) {
        let lap_now = (now / clock.lap.lap_time).floor() as i64;

        for lap in lap_now - 1..=lap_now {
            for &zone in cue_zones {
                let occurrence = clock.occurrence(lap, zone);

                if occurrence.end < now
                    && occurrence.start >= start
                    && !self.results.contains_key(&occurrence.key())
                {
                    self.record(Graded {
                        lap,
                        zone,
                        dt: None,
                        dm: None,
                        event: None,
                    });
                }
            }
        }
    }

    fn record(&mut self, graded: Graded) {
        let key = (graded.lap, graded.zone);

        self.results.insert(key, graded);
        self.order.push_back(key);

        while self.order.len() > MAX_RESULTS {
            if let Some(old) = self.order.pop_front() {
                self.results.remove(&old);
            }
        }
    }

    #[allow(clippy::too_many_arguments)] // one call site; a struct would only rename the list
    fn frame(
        &self,
        input: &CueInput,
        position: f64,
        now: f64,
        clock: &Clock,
        cue_zones: &[usize],
        track_length: f64,
        config: &CueConfig,
    ) -> CueFrame {
        let lap = clock.lap;
        let lead = config.lead.max(0.1);
        let grade = |dt: Option<f64>| Grade::of(dt, config.tol, config.perfect.min(config.tol));
        let lap_now = (now / lap.lap_time).floor() as i64;
        let session_time = input.session_time;
        let current = (lap_now - 1..=lap_now + 1)
            .flat_map(|copy| cue_zones.iter().map(move |&zone| (copy, zone)))
            .map(|(copy, zone)| clock.occurrence(copy, zone))
            .find(|occurrence| match self.results.get(&occurrence.key()) {
                Some(result) => result.event.is_some_and(|event| {
                    event.active || session_time - event.on_t < FLASH_HOLD + FLASH_DRAIN
                }),
                None => now <= occurrence.end,
            });
        let Some(current) = current else {
            return CueFrame::empty(CueMode::Idle);
        };
        let zone = lap.zones[current.zone];
        let result = self.results.get(&current.key());
        let cue_at = current.start - config.early;
        let arm_at = cue_at - lead;
        let join_at = arm_at.max(clock.previous_end(current.lap, current.zone, cue_zones));
        let zone_pct = lap.pct.get(zone.start).copied().unwrap_or(0.0);
        let dist = (current.lap as f64 + zone_pct - position) * track_length;
        let fraction = |at: f64| ((at - arm_at) / lead).clamp(0.0, 1.0) as f32;
        let zone_no = |index: usize| {
            cue_zones
                .iter()
                .position(|&candidate| candidate == index)
                .map_or(0, |found| found + 1)
        };

        let mut frame = CueFrame {
            mode: CueMode::Idle,
            join: fraction(join_at),
            zone_no: zone_no(current.zone),
            zone_count: cue_zones.len(),
            until_brake: finite32(cue_at - now),
            dist: finite32(dist).unwrap_or(0.0),
            target: Some(zone.peak),
            live: input.brake.clamp(0.0, 1.0),
            ..CueFrame::empty(CueMode::Idle)
        };

        if let Some(result) = result {
            frame.mode = CueMode::Braking;
            frame.fill = frame
                .join
                .max(fraction(current.start + result.dt.unwrap_or(0.0)));

            if let Some(event) = result.event {
                frame.peak = Some(event.peak);

                let since = session_time - event.on_t;

                if since < FLASH_HOLD + FLASH_DRAIN {
                    let alpha = if since < FLASH_HOLD {
                        1.0
                    } else {
                        1.0 - (since - FLASH_HOLD) / FLASH_DRAIN
                    };

                    frame.flash = Some(Flash {
                        grade: grade(result.dt),
                        alpha: alpha.clamp(0.0, 1.0) as f32,
                    });
                }
            }
        } else if now < join_at {
            frame.mode = CueMode::Idle;
        } else if now < cue_at {
            frame.mode = CueMode::Countdown;
            frame.fill = fraction(now);
            frame.beat = (((cue_at - now) / lead) * 3.0).ceil().clamp(1.0, 3.0) as u8;
        } else {
            frame.mode = CueMode::Brake;
            frame.fill = 1.0;
        }

        let verdict_of = |graded: &Graded, pending: bool| Verdict {
            zone_no: zone_no(graded.zone),
            grade: grade(graded.dt),
            dt: graded.dt.and_then(finite32),
            dm: graded.dm.and_then(finite32),
            pending,
            current: (graded.lap, graded.zone) == current.key(),
            peak: graded.event.map(|event| event.peak),
            target: lap.zones[graded.zone].peak,
        };
        let last_graded = self.order.back().and_then(|key| self.results.get(key));

        frame.verdict = if frame.mode == CueMode::Brake && now > current.start {
            let pending = Graded {
                lap: current.lap,
                zone: current.zone,
                dt: Some(now - current.start),
                dm: Some(-dist),
                event: None,
            };

            Some(verdict_of(&pending, true))
        } else if let Some(result) = result {
            Some(verdict_of(result, false))
        } else {
            last_graded.map(|graded| verdict_of(graded, false))
        };

        if frame.mode == CueMode::Idle {
            if let Some((graded, event, off)) = last_graded.and_then(|graded| {
                let event = graded.event?;

                Some((graded, event, event.off_t?))
            }) {
                if !event.active && session_time - off <= FINAL_HOLD {
                    frame.final_peak = Some(FinalPeak {
                        peak: event.peak,
                        target: lap.zones[graded.zone].peak,
                        age: (session_time - off) as f32,
                    });
                }
            }
        }

        frame.pips = cue_zones
            .iter()
            .map(|&zone| {
                let this_lap = self.results.get(&(current.lap, zone));
                let shown = this_lap.or_else(|| self.results.get(&(current.lap - 1, zone)));

                Pip {
                    grade: shown.map(|graded| grade(graded.dt)),
                    stale: this_lap.is_none(),
                    current: zone == current.zone,
                }
            })
            .collect();

        frame
    }
}

fn finite32(value: f64) -> Option<f32> {
    let narrowed = value as f32;

    narrowed.is_finite().then_some(narrowed)
}

/// The reference lap's clock: seconds into it, plus one lap time per lap.
struct Clock<'a> {
    lap: &'a RefLap,
}

impl Clock<'_> {
    fn at(&self, position: f64) -> f64 {
        let laps = position.floor();

        laps * self.lap.lap_time + self.lap.index_at_pct(position - laps) / self.lap.hz
    }

    fn occurrence(&self, lap: i64, zone: usize) -> Occurrence {
        let brake_zone = self.lap.zones[zone];
        let base = lap as f64 * self.lap.lap_time;

        Occurrence {
            lap,
            zone,
            start: base + brake_zone.start as f64 / self.lap.hz,
            end: base + brake_zone.end as f64 / self.lap.hz,
        }
    }

    /// Brake-off of the zone before (`lap`, `zone`) among `list` (lap order).
    fn previous_end(&self, lap: i64, zone: usize, list: &[usize]) -> f64 {
        match list.iter().position(|&candidate| candidate == zone) {
            Some(index) if index > 0 => self.occurrence(lap, list[index - 1]).end,
            _ => match list.last() {
                Some(&last) => self.occurrence(lap - 1, last).end,
                None => f64::NEG_INFINITY,
            },
        }
    }

    /// The zone a brake-on at clock `at` belongs to: the first not yet over,
    /// if `at` is after the previous zone ended and no more than
    /// [`MATCH_BEFORE`] ahead of its brake point.
    fn matching(&self, at: f64, all: &[usize]) -> Option<Occurrence> {
        let first_lap = (at / self.lap.lap_time).floor() as i64;

        for lap in first_lap - 1..=first_lap + 1 {
            for &zone in all {
                let occurrence = self.occurrence(lap, zone);

                if at > occurrence.end {
                    continue;
                }

                let earliest = self
                    .previous_end(lap, zone, all)
                    .max(occurrence.start - MATCH_BEFORE);

                return (at >= earliest).then_some(occurrence);
            }
        }

        None
    }
}
