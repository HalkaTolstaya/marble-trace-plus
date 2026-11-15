import { afterEach, describe, expect, it, vi } from 'vitest';

import type { BrakeCueFrame } from '@shared/contracts/reflaps';
import { BrakePointWidgetStore, cueConfigOf } from './brake-point.store';
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

const channel = vi.hoisted(() => ({
  instances: [] as {
    configure: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    onFrame: (frame: unknown) => void;
  }[],
}));

vi.mock('@entities/brake-cue/brake-cue-channel', () => ({
  BrakeCueChannel: class {
    configure = vi.fn();
    close = vi.fn();
    constructor(public onFrame: (frame: unknown) => void) {
      channel.instances.push(this);
    }
  },
}));

describe('BrakePointWidgetStore', () => {
  const settings = { ...BRAKE_POINT_SETTINGS.defaults };
  const core = (startsWidgetStores: boolean) => ({
    startsWidgetStores,
    liveWidgets: { getSettings: () => settings },
  });

  afterEach(() => {
    channel.instances.length = 0;
  });

  it('opens no channel in a preview', () => {
    const store = new BrakePointWidgetStore({
      core: core(false),
      instanceId: 'brake-point',
      type: 'brake-point',
    } as never);

    expect(channel.instances).toHaveLength(0);
    store.dispose();
  });

  it('configures the cue on mount, takes its frames, closes on dispose', () => {
    const store = new BrakePointWidgetStore({
      core: core(true),
      instanceId: 'brake-point',
      type: 'brake-point',
    } as never);
    const [opened] = channel.instances;

    expect(opened?.configure).toHaveBeenCalledWith(cueConfigOf(settings));

    opened?.onFrame(frame({ mode: 'brake' }));
    expect(store.frame?.mode).toBe('brake');

    store.dispose();
    expect(opened?.close).toHaveBeenCalledTimes(1);
  });
});
