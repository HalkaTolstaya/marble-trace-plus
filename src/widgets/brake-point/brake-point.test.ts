import { describe, expect, it } from 'vitest';

import type { BrakeCueFrame } from '@shared/contracts/reflaps';
import { cueConfigOf } from './brake-point.store';
import {
  barLabel,
  formatMetres,
  formatSeconds,
  percent,
} from './brake-point-format';
import { BRAKE_POINT_SETTINGS } from './settings-schema';

const frame = (patch: Partial<BrakeCueFrame>): BrakeCueFrame => ({
  mode: 'idle',
  beat: 0,
  fill: 0,
  join: 0,
  zoneNo: 1,
  zoneCount: 9,
  untilBrake: null,
  dist: 0,
  target: 0.8,
  live: 0,
  peak: null,
  flash: null,
  finalPeak: null,
  verdict: null,
  pips: [],
  ...patch,
});

describe('brake point', () => {
  it('converts the settings into the backend’s units', () => {
    expect(cueConfigOf(BRAKE_POINT_SETTINGS.defaults)).toEqual({
      lead: 3,
      early: 0,
      minPeak: 0.15,
      tol: 0.08,
      perfect: 0.03,
    });
  });

  it('never sends a perfect window wider than the good one', () => {
    const config = cueConfigOf({
      ...BRAKE_POINT_SETTINGS.defaults,
      goodWindowMs: 40,
      perfectWindowMs: 120,
    });

    expect(config.perfect).toBe(config.tol);
  });

  it('labels the bar by mode', () => {
    expect(barLabel(frame({ mode: 'countdown', beat: 2 }))).toBe('2');
    expect(barLabel(frame({ mode: 'brake' }))).toBe('BRAKE');
    expect(barLabel(frame({ mode: 'idle', dist: 212.4 }))).toBe('212 m');
    expect(barLabel(frame({ mode: 'braking' }))).toBe('');
  });

  it('formats signed timing and clamps percentages', () => {
    expect(formatSeconds(0.123)).toBe('+0.12 s');
    expect(formatSeconds(-0.05)).toBe('−0.05 s');
    expect(formatSeconds(null)).toBe('');
    expect(formatMetres(-6.6)).toBe('−7 m');
    expect(percent(1.4)).toBe('100');
    expect(percent(null)).toBe('--');
  });
});
