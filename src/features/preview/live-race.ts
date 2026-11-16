import type { DriverEntry } from '@shared/contracts/driver-entry';
import { liveDriverEntryOf } from '@entities/cars/driver-entry-join';

import type { PreviewTarget } from './preview-target';

/** How often the field moves, and how often the pedals do. */
const FIELD_TICK_MS = 100;
const INPUT_TICK_MS = 33;

/** The lap clock runs this much faster than the wall clock, so laps close. */
const LAP_CLOCK_SPEEDUP = 4;

/** Seconds between neighbouring cars, on average. */
const MEAN_GAP_S = 1.6;

/** How far a car's gap swings either way: past its neighbour, so places change. */
const GAP_SWING_S = 1.4;

/** One swing every this many seconds, roughly; each car at its own rhythm. */
const SWING_PERIOD_S = 22;

/** Lap-to-lap scatter in a car's lap time. */
const LAP_TIME_SCATTER_S = 0.35;

interface CarState {
  base: DriverEntry;
  /** The car's place in the order it started the preview in. */
  slot: number;
  phase: number;
  rhythm: number;
  lapTime: number;
  /** Laps covered, whole and fraction together. */
  progress: number;
  lapStartedAt: number;
  bestLap: number | null;
  lastLap: number | null;
}

const PLAYER_LAP_DIST_PCT = 0.5;

const signedLapDiff = (pct: number, reference: number): number => {
  let diff = pct - reference;

  if (diff > 0.5) {
    diff -= 1;
  }

  if (diff < -0.5) {
    diff += 1;
  }

  return diff;
};

/**
 * A race that runs in the preview: the cars lap, their gaps breathe, and the
 * ones running close trade places now and then — so the tables show their
 * overtakes, intervals and lap times working, not a still frame.
 */
export class LiveRacePreview {
  private cars: CarState[] = [];
  private clockS = 0;
  private timers: ReturnType<typeof setInterval>[] = [];

  constructor(private readonly store: PreviewTarget) {}

  start() {
    const field = this.store.backendComputed.fieldEntries;

    if (field.length === 0) {
      return;
    }

    const playerIndex = Math.max(
      0,
      field.findIndex((entry) => entry.isPlayer)
    );
    const referenceLap =
      field.find((entry) => entry.isPlayer)?.lastLapTime ?? 92;

    this.cars = field.map((entry, slot) => {
      const lapTime =
        entry.bestLapTime && entry.bestLapTime > 0
          ? entry.bestLapTime
          : referenceLap;

      return {
        base: entry,
        slot,
        phase: (slot * 2.399) % (2 * Math.PI),
        rhythm: 0.7 + ((slot * 0.37) % 0.6),
        lapTime,
        progress:
          entry.lap +
          PLAYER_LAP_DIST_PCT +
          ((playerIndex - slot) * MEAN_GAP_S) / referenceLap,
        lapStartedAt: -((entry.lapDistPct ?? 0) * lapTime),
        bestLap: entry.bestLapTime,
        lastLap: entry.lastLapTime,
      };
    });

    this.timers.push(
      setInterval(() => this.tickField(FIELD_TICK_MS / 1000), FIELD_TICK_MS),
      setInterval(() => this.tickInputs(), INPUT_TICK_MS)
    );
  }

  stop() {
    for (const timer of this.timers) {
      clearInterval(timer);
    }

    this.timers = [];
  }

  private gapOf(car: CarState): number {
    const swing =
      GAP_SWING_S *
      Math.sin(
        (2 * Math.PI * this.clockS * car.rhythm) / SWING_PERIOD_S + car.phase
      );

    return car.slot * MEAN_GAP_S + swing;
  }

  private tickField(wallSeconds: number) {
    const dt = wallSeconds * LAP_CLOCK_SPEEDUP;

    this.clockS += wallSeconds;

    for (const car of this.cars) {
      const before = Math.floor(car.progress);

      car.progress += dt / car.lapTime;

      if (Math.floor(car.progress) > before) {
        const scatter = (Math.random() - 0.5) * 2 * LAP_TIME_SCATTER_S;
        const lap = car.lapTime + scatter;

        car.lastLap = lap;
        car.bestLap = car.bestLap === null ? lap : Math.min(car.bestLap, lap);
      }
    }

    const leader = this.cars.reduce((first, car) =>
      this.gapOf(car) < this.gapOf(first) ? car : first
    );
    const ordered = [...this.cars].sort(
      (first, second) => this.gapOf(first) - this.gapOf(second)
    );
    const player = this.cars.find((car) => car.base.isPlayer) ?? leader;
    const playerPct = player.progress - Math.floor(player.progress);
    const classSeen = new Map<number, number>();

    const entries: DriverEntry[] = ordered.map((car, index) => {
      const classPosition = (classSeen.get(car.base.carClassId) ?? 0) + 1;

      classSeen.set(car.base.carClassId, classPosition);

      // Laps are counted on the car's own clock; its place on the lap follows
      // its gap, so the relative and the standings tell the same story.
      const gap = this.gapOf(car) - this.gapOf(leader);
      const progress =
        player.progress + (this.gapOf(player) - this.gapOf(car)) / car.lapTime;
      const lap = Math.floor(progress);
      const lapDistPct = progress - lap;

      return {
        ...car.base,
        position: index + 1,
        livePosition: index + 1,
        classPosition,
        liveClassPosition: classPosition,
        f2Time: gap,
        lap,
        lapDistPct,
        relativeLapDist: signedLapDiff(lapDistPct, playerPct),
        estTime: lapDistPct * car.lapTime,
        lastLapTime: car.lastLap,
        bestLapTime: car.bestLap,
      };
    });

    const playerCarIdx = player.base.carIdx;

    this.store.backendComputed.updateDriverEntries({
      entries: entries.map(liveDriverEntryOf),
      playerCarIdx,
    });
    this.store.backendComputed.updateRelative({
      entries: [...entries]
        .sort((first, second) => second.relativeLapDist - first.relativeLapDist)
        .map(liveDriverEntryOf),
      playerCarIdx,
    });
  }

  /** Throttle, brake and steering through a corner sequence, on a loop. */
  private tickInputs() {
    const inputs = this.store.player.carInputs;
    const dynamics = this.store.player.carDynamics;
    const seconds = performance.now() / 1000;
    const phase = (seconds % 8) / 8;

    // Full throttle down a straight, a hard stop, a trail off the brake into
    // the apex, and back on the power out of it.
    const braking = phase > 0.45 && phase < 0.62;
    const brake = braking
      ? Math.max(0, 1 - ((phase - 0.45) / 0.17) ** 1.6) * 0.95
      : 0;
    const throttle =
      phase < 0.45
        ? 1
        : phase < 0.68
          ? 0
          : Math.min(1, ((phase - 0.68) / 0.2) ** 1.4);
    const steer = Math.sin(Math.max(0, phase - 0.5) * Math.PI * 2) * 1.6;

    if (inputs) {
      this.store.player.updateCarInputs({
        ...inputs,
        throttle,
        brake,
        clutch: 1,
      });
    }

    if (dynamics) {
      this.store.player.updateCarDynamics({
        ...dynamics,
        steering_wheel_angle: steer,
      });
    }
  }
}
