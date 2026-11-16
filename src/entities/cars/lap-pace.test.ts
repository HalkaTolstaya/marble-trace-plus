import { describe, expect, it } from 'vitest';

import type { CarIdentity } from '@shared/contracts/car-identity';
import { LapPaceTracker } from './lap-pace';

const car = (
  lastLapTime: number | null,
  overrides: Partial<CarIdentity> = {}
): CarIdentity =>
  ({
    carIdx: 1,
    lap: 1,
    lastLapTime,
    onPitRoad: false,
    ...overrides,
  }) as CarIdentity;

const feed = (
  tracker: LapPaceTracker,
  steps: Array<[number | null, Partial<CarIdentity>?]>
) => {
  for (const [lapTime, overrides] of steps) {
    tracker.record([car(lapTime, overrides)], 'race');
  }
};

describe('LapPaceTracker', () => {
  it('averages every completed lap for the session', () => {
    const tracker = new LapPaceTracker();

    feed(tracker, [[null], [90], [92], [94]]);

    expect(tracker.averageLap(1, 'session')).toBe(92);
  });

  it('leaves pit and unusually slow laps out of the recent pace', () => {
    const tracker = new LapPaceTracker();

    feed(tracker, [
      [null],
      [90],
      [null, { onPitRoad: true }],
      [120, { onPitRoad: false }],
      [91],
      [140],
    ]);

    expect(tracker.averageLap(1, 'recent')).toBe(90.5);
    expect(tracker.averageLap(1, 'session')).toBeCloseTo(
      (90 + 120 + 91 + 140) / 4
    );
  });

  it('counts the stint from the lap the car left pit road', () => {
    const tracker = new LapPaceTracker();

    feed(tracker, [
      [null, { lap: 10, onPitRoad: true }],
      [null, { lap: 11, onPitRoad: false }],
    ]);

    expect(tracker.stintLaps(1, 15)).toBe(4);
  });

  it('starts over in a new session', () => {
    const tracker = new LapPaceTracker();

    feed(tracker, [[null], [90]]);
    tracker.record([car(null)], 'next');

    expect(tracker.averageLap(1, 'session')).toBeNull();
  });
});
