import { describe, expect, it } from 'vitest';

import type { ReferenceLapSample } from '@shared/contracts/generated/bindings';
import {
  formatClock,
  formatDeltaSeconds,
  referenceClockOf,
  referenceSectorTimesOf,
  referenceTimeAt,
  sectorRowsOf,
  sectorSpansOf,
  toneOfDelta,
  visibleRowStart,
} from './delta-sectors-model';

const BUCKETS = 100;
const LAP_TIME_S = 100;

const sampleAt = (
  speed: number,
  timeIntoLap: number | null
): ReferenceLapSample => ({
  speed,
  throttle: 1,
  brake: 0,
  latAccel: null,
  longAccel: null,
  steeringWheelAngle: 0,
  timeIntoLap,
});

// A lap at one speed with its clock recorded: a second a bucket.
const CLOCKED_LAP = Array.from({ length: BUCKETS }, (_unused, index) =>
  sampleAt(50, index + 0.5)
);

// The first half at twice the speed of the second, and no clock recorded.
const UNCLOCKED_LAP = Array.from({ length: BUCKETS }, (_unused, index) =>
  sampleAt(index < BUCKETS / 2 ? 60 : 30, null)
);

const THIRDS = sectorSpansOf([
  { sectorNum: 1, sectorStartPct: 0.4 },
  { sectorNum: 0, sectorStartPct: 0 },
  { sectorNum: 2, sectorStartPct: 0.7 },
]);

describe('sectorSpansOf', () => {
  it('orders the sectors and ends each where the next begins', () => {
    expect(THIRDS).toEqual([
      { startPct: 0, endPct: 0.4 },
      { startPct: 0.4, endPct: 0.7 },
      { startPct: 0.7, endPct: 1 },
    ]);
  });
});

describe('referenceClockOf', () => {
  it('has no clock for an empty lap or one without a time', () => {
    expect(referenceClockOf([], LAP_TIME_S)).toBeNull();
    expect(referenceClockOf(CLOCKED_LAP, 0)).toBeNull();
  });

  it('reads the clock the lap recorded', () => {
    expect(referenceClockOf(CLOCKED_LAP, LAP_TIME_S)?.[10]).toBe(10.5);
  });

  it('rebuilds the clock from speed, scaled to the lap time', () => {
    const clock = referenceClockOf(UNCLOCKED_LAP, LAP_TIME_S) ?? [];

    // Half the distance at twice the speed takes a third of the time — to
    // within the bucket the speed changes in.
    expect(referenceTimeAt(clock, LAP_TIME_S, 0.5)).toBeCloseTo(100 / 3, 0);
    expect(referenceTimeAt(clock, LAP_TIME_S, 1)).toBeCloseTo(LAP_TIME_S, 5);
  });
});

describe('referenceTimeAt', () => {
  const clock = referenceClockOf(CLOCKED_LAP, LAP_TIME_S) ?? [];

  it('starts at zero and ends at the lap time', () => {
    expect(referenceTimeAt(clock, LAP_TIME_S, 0)).toBeCloseTo(0, 5);
    expect(referenceTimeAt(clock, LAP_TIME_S, 1)).toBeCloseTo(LAP_TIME_S, 5);
  });

  it('interpolates between bucket centres', () => {
    expect(referenceTimeAt(clock, LAP_TIME_S, 0.25)).toBeCloseTo(25, 5);
    expect(referenceTimeAt(clock, LAP_TIME_S, 0.004)).toBeCloseTo(0.4, 5);
    expect(referenceTimeAt(clock, LAP_TIME_S, 0.998)).toBeCloseTo(99.8, 5);
  });
});

describe('referenceSectorTimesOf', () => {
  it('splits the reference lap at the sector lines', () => {
    const clock = referenceClockOf(CLOCKED_LAP, LAP_TIME_S) ?? [];
    const times = referenceSectorTimesOf(clock, LAP_TIME_S, THIRDS);

    expect(times[0]).toBeCloseTo(40, 5);
    expect(times[1]).toBeCloseTo(30, 5);
    expect(times[2]).toBeCloseTo(30, 5);
  });
});

describe('sectorRowsOf', () => {
  const reference = {
    clock: referenceClockOf(CLOCKED_LAP, LAP_TIME_S) ?? [],
    lapTime: LAP_TIME_S,
  };

  const rows = sectorRowsOf({
    spans: THIRDS,
    reference,
    sectorTimes: [39.5, 12, null],
    currentSectorIdx: 1,
    currentLapTime: 55.7,
    lapPct: 0.55,
  });

  it('grades a banked sector against the reference', () => {
    expect(rows[0]?.state).toBe('done');
    expect(rows[0]?.tone).toBe('faster');
    expect(rows[0]?.delta).toBeCloseTo(-0.5, 5);
    expect(rows[0]?.progress).toBe(1);
  });

  it('runs the current sector: its own clock, its progress, its live delta', () => {
    expect(rows[1]?.state).toBe('current');
    // The running sector's slot is ignored: 55.7 s less the 39.5 banked.
    expect(rows[1]?.time).toBeCloseTo(16.2, 5);
    expect(rows[1]?.progress).toBeCloseTo(0.5, 5);
    // The reference took 15 s from the sector line to here.
    expect(rows[1]?.delta).toBeCloseTo(1.2, 5);
  });

  it('says nothing about a sector still ahead', () => {
    expect(rows[2]).toMatchObject({
      state: 'ahead',
      tone: 'neutral',
      time: null,
      delta: null,
      progress: 0,
    });
  });

  it('keeps the times and drops the deltas without a reference', () => {
    const bare = sectorRowsOf({
      spans: THIRDS,
      reference: null,
      sectorTimes: [39.5, null, null],
      currentSectorIdx: 1,
      currentLapTime: 55.7,
      lapPct: 0.55,
    });

    expect(bare[0]?.time).toBe(39.5);
    expect(bare[0]?.delta).toBeNull();
    expect(bare[1]?.delta).toBeNull();
  });

  it('puts every sector ahead while the car is off the lap', () => {
    const offLap = sectorRowsOf({
      spans: THIRDS,
      reference,
      sectorTimes: [39.5, 30, 30],
      currentSectorIdx: null,
      currentLapTime: 0,
      lapPct: null,
    });

    expect(offLap.every((row) => row.state === 'ahead')).toBe(true);
  });
});

describe('toneOfDelta', () => {
  it('reads the sign, and nothing into a dead heat', () => {
    expect(toneOfDelta(-0.112)).toBe('faster');
    expect(toneOfDelta(0.306)).toBe('slower');
    expect(toneOfDelta(0)).toBe('neutral');
    expect(toneOfDelta(null)).toBe('neutral');
  });
});

describe('visibleRowStart', () => {
  it('shows every sector when they all fit', () => {
    expect(visibleRowStart(3, 2, 3)).toBe(0);
  });

  it('keeps the running sector the last row but one', () => {
    expect(visibleRowStart(8, 0, 3)).toBe(0);
    expect(visibleRowStart(8, 3, 3)).toBe(2);
  });

  it('stops at the end of the lap', () => {
    expect(visibleRowStart(8, 7, 3)).toBe(5);
  });
});

describe('formatting', () => {
  it('writes a time with its minutes', () => {
    expect(formatClock(10.814)).toBe('0:10.814');
    expect(formatClock(106.89)).toBe('1:46.890');
    expect(formatClock(59.9996)).toBe('1:00.000');
    expect(formatClock(null)).toBe('-:--.---');
  });

  it('writes a delta with its sign', () => {
    expect(formatDeltaSeconds(0.306)).toBe('+0.306');
    expect(formatDeltaSeconds(-0.112)).toBe('-0.112');
    expect(formatDeltaSeconds(null)).toBe('');
  });
});
