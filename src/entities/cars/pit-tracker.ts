import { makeAutoObservable } from 'mobx';

import type { CarIdentity } from '@shared/contracts/car-identity';
import { TRACK_SURFACE_IN_PIT_STALL } from '@shared/lib/driver';

/** On pit road, or standing in its box — the sim reports the two apart. */
const isInPits = (entry: CarIdentity) =>
  entry.onPitRoad || entry.trackSurface === TRACK_SURFACE_IN_PIT_STALL;

/** How long the last stop stays beside a car after it rejoins. */
export const LAST_STOP_SHOWN_MS = 60_000;

const MS_PER_SECOND = 1000;

interface CarPit {
  /** When the car turned into pit road, or null while it is not on it. */
  pitSince: number | null;
  /** When the tow began, or null while it is not being towed. */
  towSince: number | null;
  lastStop: { lap: number; seconds: number; endedAt: number } | null;
}

/** What the pill beside a car says, if anything. */
export type PitPill =
  | { kind: 'tow'; seconds: number }
  | { kind: 'pit'; seconds: number }
  | { kind: 'lastStop'; lap: number; seconds: number };

const secondsBetween = (since: number, now: number) =>
  Math.max(0, Math.floor((now - since) / MS_PER_SECOND));

/**
 * Each car's time on pit road and under tow, as the overlay saw it: the sim
 * says only whether a car is there now, so the clocks start when it arrives.
 * Fed from the car identities, which change when a car turns in or out.
 */
export class PitTracker {
  private cars = new Map<number, CarPit>();

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  record(entries: readonly CarIdentity[], nowMs: number) {
    for (const entry of entries) {
      const car = this.cars.get(entry.carIdx) ?? {
        pitSince: null,
        towSince: null,
        lastStop: null,
      };

      if (entry.isTowed && car.towSince === null) {
        car.towSince = nowMs;
      }

      if (!entry.isTowed) {
        car.towSince = null;
      }

      const inPits = isInPits(entry) && !entry.isTowed;

      if (inPits && car.pitSince === null) {
        car.pitSince = nowMs;
      }

      if (!inPits && car.pitSince !== null) {
        car.lastStop = {
          lap: entry.lap,
          seconds: secondsBetween(car.pitSince, nowMs),
          endedAt: nowMs,
        };
        car.pitSince = null;
      }

      this.cars.set(entry.carIdx, car);
    }
  }

  /** The pill for a car at this moment: a tow, a stop under way, or the last one. */
  pillOf(carIdx: number, nowMs: number): PitPill | null {
    const car = this.cars.get(carIdx);

    if (!car) {
      return null;
    }

    if (car.towSince !== null) {
      return { kind: 'tow', seconds: secondsBetween(car.towSince, nowMs) };
    }

    if (car.pitSince !== null) {
      return { kind: 'pit', seconds: secondsBetween(car.pitSince, nowMs) };
    }

    if (car.lastStop && nowMs - car.lastStop.endedAt < LAST_STOP_SHOWN_MS) {
      return {
        kind: 'lastStop',
        lap: car.lastStop.lap,
        seconds: car.lastStop.seconds,
      };
    }

    return null;
  }

  /** Some car has a pill whose seconds are running. */
  get anyClockRunning(): boolean {
    for (const car of this.cars.values()) {
      if (car.pitSince !== null || car.towSince !== null) {
        return true;
      }
    }

    return false;
  }
}
