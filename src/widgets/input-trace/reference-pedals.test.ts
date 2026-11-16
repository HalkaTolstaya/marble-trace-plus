import { describe, expect, it } from 'vitest';

import type { ReferenceLapSample } from '@shared/contracts/generated/bindings';
import { referencePedalsAt } from './reference-pedals';

const BUCKET_COUNT = 4;

const sampleWith = (throttle: number, brake: number): ReferenceLapSample => ({
  speed: 0,
  throttle,
  brake,
  latAccel: null,
  longAccel: null,
  steeringWheelAngle: 0,
});

// Bucket centres at 0.125, 0.375, 0.625 and 0.875 of the lap.
const LAP = [
  sampleWith(1, 0),
  sampleWith(0, 1),
  sampleWith(0, 0),
  sampleWith(0.5, 0),
];

describe('referencePedalsAt', () => {
  it('has nothing to say about an empty lap', () => {
    expect(referencePedalsAt([], 0.5)).toBeNull();
  });

  it('reads a bucket exactly at its centre', () => {
    expect(referencePedalsAt(LAP, 1.5 / BUCKET_COUNT)).toEqual({
      throttle: 0,
      brake: 1,
    });
  });

  it('blends two buckets between their centres', () => {
    const pedals = referencePedalsAt(LAP, 1 / BUCKET_COUNT);

    expect(pedals?.throttle).toBeCloseTo(0.5);
    expect(pedals?.brake).toBeCloseTo(0.5);
  });

  it('blends the last bucket with the first across the line', () => {
    expect(referencePedalsAt(LAP, 0)?.throttle).toBeCloseTo(0.75);
    expect(referencePedalsAt(LAP, 1)?.throttle).toBeCloseTo(0.75);
  });
});
