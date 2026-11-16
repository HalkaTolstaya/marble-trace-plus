import { makeAutoObservable } from 'mobx';

import type { AvgLapMode } from '@shared/contracts/widget-choices';
import type { CarIdentity } from '@shared/contracts/car-identity';
import { formatLapTime } from '@shared/lib/telemetry-format';

/** Clean laps the recent pace averages. */
export const RECENT_PACE_LAPS = 5;

/** A lap this much slower than the car's best clean lap is left out of the pace. */
export const SLOW_LAP_FACTOR = 1.07;

/** Laps kept per car: enough for the recent window with room for discarded ones. */
const KEPT_LAPS = 20;

interface CarLaps {
  lastLapTime: number | null;
  /** The car touched pit road since its previous lap was completed. */
  pittedThisLap: boolean;
  wasOnPitRoad: boolean;
  /** Recent clean laps, oldest first. */
  cleanLaps: number[];
  sessionTotal: number;
  sessionCount: number;
  /** The lap the car left pit road on, or null while none has been seen. */
  stintStartLap: number | null;
}

const newCarLaps = (entry: CarIdentity): CarLaps => ({
  lastLapTime: entry.lastLapTime,
  pittedThisLap: entry.onPitRoad,
  wasOnPitRoad: entry.onPitRoad,
  cleanLaps: [],
  sessionTotal: 0,
  sessionCount: 0,
  stintStartLap: null,
});

const isValidLapTime = (time: number | null): time is number =>
  time !== null && Number.isFinite(time) && time > 0;

/**
 * Each car's lap times as the overlay saw them, for the average-lap and the
 * laps-in-stint columns. The sim reports only the last and the best lap, so the
 * history starts when the overlay does.
 *
 * A lap counts when the car's last lap time changes: it is written once, as
 * the car crosses the line. Fed from the car identities, which change at most
 * once a lap, so it never runs per tick.
 */
export class LapPaceTracker {
  private cars = new Map<number, CarLaps>();
  private sessionKey: string | null = null;

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  /** Records what changed since the previous call. A new session starts over. */
  record(entries: readonly CarIdentity[], sessionKey: string) {
    if (sessionKey !== this.sessionKey) {
      this.sessionKey = sessionKey;
      this.cars = new Map();
    }

    for (const entry of entries) {
      const known = this.cars.get(entry.carIdx);

      if (!known) {
        this.cars.set(entry.carIdx, newCarLaps(entry));
        continue;
      }

      this.update(known, entry);
    }
  }

  private update(car: CarLaps, entry: CarIdentity) {
    if (car.wasOnPitRoad && !entry.onPitRoad) {
      car.stintStartLap = entry.lap;
    }

    car.wasOnPitRoad = entry.onPitRoad;
    car.pittedThisLap = car.pittedThisLap || entry.onPitRoad;

    if (
      !isValidLapTime(entry.lastLapTime) ||
      entry.lastLapTime === car.lastLapTime
    ) {
      return;
    }

    const lapTime = entry.lastLapTime;

    car.lastLapTime = lapTime;
    car.sessionTotal += lapTime;
    car.sessionCount += 1;

    const bestClean =
      car.cleanLaps.length > 0 ? Math.min(...car.cleanLaps) : null;
    const isSlow = bestClean !== null && lapTime > bestClean * SLOW_LAP_FACTOR;

    if (!car.pittedThisLap && !isSlow) {
      car.cleanLaps = [...car.cleanLaps, lapTime].slice(-KEPT_LAPS);
    }

    car.pittedThisLap = entry.onPitRoad;
  }

  /** The car's average lap, or null until it has one to average. */
  averageLap(carIdx: number, mode: AvgLapMode): number | null {
    const car = this.cars.get(carIdx);

    if (!car) {
      return null;
    }

    if (mode === 'session') {
      return car.sessionCount > 0 ? car.sessionTotal / car.sessionCount : null;
    }

    const recent = car.cleanLaps.slice(-RECENT_PACE_LAPS);

    if (recent.length === 0) {
      return null;
    }

    return recent.reduce((sum, lapTime) => sum + lapTime, 0) / recent.length;
  }

  /** Laps since the car last left pit road; from the start when it has not. */
  stintLaps(carIdx: number, currentLap: number): number {
    const start = this.cars.get(carIdx)?.stintStartLap ?? 0;

    return Math.max(0, currentLap - start);
  }
}

/** The average as a lap time, or a dash until the car has one. */
export const formatAverageLap = (
  average: number | null,
  decimals: number
): string => (average === null ? '-' : formatLapTime(average, decimals));
