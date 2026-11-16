import { describe, expect, it } from 'vitest';

import { fillAt, leadOf } from './contour-motion';

describe('countdown contour motion', () => {
  it('knows the count length from one frame', () => {
    expect(leadOf(0.25, 2.25)).toBeCloseTo(3);
    expect(leadOf(1, 0)).toBeNull();
  });

  it('runs on linearly from the last frame', () => {
    const anchor = { fill: 0.25, untilBrake: 2.25, receivedAtMs: 1000 };

    expect(fillAt(anchor, 1000)).toBeCloseTo(0.25);
    expect(fillAt(anchor, 1750)).toBeCloseTo(0.5);
    expect(fillAt(anchor, 5000)).toBe(1);
  });

  it('never draws the line shorter than the frame says', () => {
    const anchor = { fill: 0.5, untilBrake: 1.5, receivedAtMs: 1000 };

    expect(fillAt(anchor, 900)).toBe(0.5);
  });
});
