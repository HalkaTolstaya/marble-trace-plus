import type { ReferenceLapSample } from '@shared/contracts/generated/bindings';

export interface ReferencePedals {
  throttle: number;
  brake: number;
}

/**
 * The reference lap's pedals at a point on the lap, 0-1, blended between the
 * two buckets it falls between. A bucket is several metres long and the trace
 * is drawn many times inside one, so the nearest bucket alone turns every
 * slope of the reference into a staircase.
 */
export const referencePedalsAt = (
  samples: readonly ReferenceLapSample[],
  lapPct: number
): ReferencePedals | null => {
  const count = samples.length;

  if (count === 0) {
    return null;
  }

  const wrapped = ((lapPct % 1) + 1) % 1;
  // Bucket `i` is centred on `(i + 0.5) / count`.
  const position = wrapped * count - 0.5;
  const lower = Math.floor(position);
  const share = position - lower;
  const before = samples[(lower + count) % count];
  const after = samples[(lower + 1) % count];

  if (!before || !after) {
    return null;
  }

  return {
    throttle: before.throttle * (1 - share) + after.throttle * share,
    brake: before.brake * (1 - share) + after.brake * share,
  };
};
