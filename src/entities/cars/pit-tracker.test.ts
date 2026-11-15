import { describe, expect, it } from 'vitest';

import type { CarIdentity } from '@shared/contracts/car-identity';
import { LAST_STOP_SHOWN_MS, PitTracker } from './pit-tracker';

const car = (overrides: Partial<CarIdentity>): CarIdentity =>
  ({
    carIdx: 1,
    lap: 28,
    onPitRoad: false,
    isTowed: false,
    ...overrides,
  }) as CarIdentity;

describe('PitTracker', () => {
  it('counts the seconds on pit road and keeps the stop after it', () => {
    const tracker = new PitTracker();

    tracker.record([car({ onPitRoad: true })], 0);
    expect(tracker.pillOf(1, 5_400)).toEqual({ kind: 'pit', seconds: 5 });

    tracker.record([car({ onPitRoad: false })], 7_000);
    expect(tracker.pillOf(1, 8_000)).toEqual({
      kind: 'lastStop',
      lap: 28,
      seconds: 7,
    });
    expect(tracker.pillOf(1, 7_000 + LAST_STOP_SHOWN_MS)).toBeNull();
  });

  it('puts a tow before everything else', () => {
    const tracker = new PitTracker();

    tracker.record([car({ onPitRoad: true, isTowed: true })], 0);

    expect(tracker.pillOf(1, 2_000)).toEqual({ kind: 'tow', seconds: 2 });
    expect(tracker.anyClockRunning).toBe(true);
  });
});
