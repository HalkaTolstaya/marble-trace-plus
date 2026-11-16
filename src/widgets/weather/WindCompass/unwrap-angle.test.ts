import { describe, expect, it } from 'vitest';

import { unwrapAngle } from './unwrap-angle';

describe('unwrapAngle', () => {
  it('takes the first angle as it comes', () => {
    expect(unwrapAngle(null, 350)).toBe(350);
  });

  it('crosses north the short way, clockwise', () => {
    expect(unwrapAngle(359, 1)).toBe(361);
  });

  it('crosses north the short way, anticlockwise', () => {
    expect(unwrapAngle(1, 359)).toBe(-1);
  });

  it('keeps turning from an angle that is already unwrapped', () => {
    expect(unwrapAngle(725, 10)).toBe(730);
  });

  it('leaves an ordinary step alone', () => {
    expect(unwrapAngle(90, 120)).toBe(120);
  });
});
