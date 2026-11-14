import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runInAction } from 'mobx';
import { PreviewCore } from '@app/roots/renderer-core';
import type { WidgetStoreFactory } from '@entities/widget/widget-instances.store';
import type { WidgetCore } from '@widgets/widget-mount';
import type {
  CarInputsFrame,
  InputSample,
} from '@shared/contracts/generated/bindings';
import { InputTraceWidgetStore } from './input-trace.store';

const INPUT_TRACE = 'input-trace';

const sampleWithThrottle = (
  throttle: number,
  bodySlipDeg: number | null = null
): InputSample => ({
  throttle,
  brake: 0,
  clutch: null,
  brakeAbsActive: false,
  steeringWheelAngle: 0,
  bodySlipDeg,
});

const createInputTrace: WidgetStoreFactory<WidgetCore> = (context) =>
  new InputTraceWidgetStore(context);

describe('InputTraceWidgetStore — frameTick', () => {
  let core: PreviewCore;
  let inputTrace: InputTraceWidgetStore;

  const pushFrame = (throttle: number) => {
    runInAction(() => {
      core.player.updateCarInputs({ throttle } as CarInputsFrame);
    });
  };

  beforeEach(() => {
    core = new PreviewCore();
    inputTrace = core.widgetInstances.open(
      { core, instanceId: INPUT_TRACE, type: INPUT_TRACE },
      createInputTrace
    ) as InputTraceWidgetStore;
  });

  afterEach(() => {
    core.dispose();
  });

  it('starts at zero so the canvas sentinel counts the first frame', () => {
    expect(inputTrace.frameTick).toBe(0);
  });

  it('advances exactly once per telemetry frame', () => {
    pushFrame(0.1);
    pushFrame(0.2);
    pushFrame(0.3);

    expect(inputTrace.frameTick).toBe(3);
  });

  // The trace buffer is sized at 60 samples per second, so an append driven by
  // anything other than a frame would shorten the configured history.
  it('does not advance when unrelated observables change', () => {
    pushFrame(0.1);

    runInAction(() => {
      core.player.updateCarDynamics({
        steering_wheel_angle: 1.5,
      } as never);
    });

    expect(inputTrace.frameTick).toBe(1);
  });

  it('marks the ticks the car slid sideways on', () => {
    runInAction(() => {
      core.player.updateCarInputs({ throttle: 1 } as CarInputsFrame, [
        sampleWithThrottle(1, 0.8),
        sampleWithThrottle(1, -4.5),
        sampleWithThrottle(1, null),
      ]);
    });

    expect(inputTrace.frameSamples.map((sample) => sample.sliding)).toEqual([
      false,
      true,
      false,
    ]);
  });

  it('returns to zero on reset', () => {
    pushFrame(0.1);
    inputTrace.reset();

    expect(inputTrace.frameTick).toBe(0);
  });

  // The store exists only while its instance is mounted: a trace that is not on
  // screen must not filter a single frame.
  it('stops on unmount — a replayed frame no longer reaches it', () => {
    pushFrame(0.5);
    core.widgetInstances.close(INPUT_TRACE, inputTrace);
    pushFrame(0.9);

    expect(inputTrace.frameTick).toBe(0);
    expect(core.widgetInstances.storesOf(INPUT_TRACE)).toEqual([]);
  });

  it('smooths with its own instance settings', () => {
    runInAction(() => {
      core.liveWidgets.updateUserSettings(INPUT_TRACE, { smoothing: 0 });
    });

    pushFrame(0.8);

    expect(inputTrace.smoothed.throttle).toBeCloseTo(0.8);
  });

  it('adds one point per source tick the bundle carries', () => {
    runInAction(() => {
      core.liveWidgets.updateUserSettings(INPUT_TRACE, { smoothing: 0 });
      core.player.updateCarInputs({ throttle: 0.4 } as CarInputsFrame, [
        sampleWithThrottle(0.2),
        sampleWithThrottle(0.4),
      ]);
    });

    expect(inputTrace.frameTick).toBe(1);
    expect(inputTrace.frameSamples.map((sample) => sample.throttle)).toEqual([
      0.2, 0.4,
    ]);
  });

  // Previews and stories set the frame alone; the trace still moves.
  it('falls back to the frame itself without input samples', () => {
    runInAction(() => {
      core.liveWidgets.updateUserSettings(INPUT_TRACE, { smoothing: 0 });
    });

    pushFrame(0.6);

    expect(inputTrace.frameSamples.map((sample) => sample.throttle)).toEqual([
      0.6,
    ]);
  });
});

describe('InputTraceWidgetStore — reference overlay', () => {
  let core: PreviewCore;
  let inputTrace: InputTraceWidgetStore;

  const BUCKETS = 1000;
  const PLAYER = 3;

  const referenceLap = (brakeAt: (pct: number) => number) => ({
    trackId: 1,
    carScreenName: 'Car',
    lapTime: 100,
    condition: 'dry' as const,
    recordedWetness: null,
    recordedTireWear: null,
    recordedFuelLevel: null,
    samples: Array.from({ length: BUCKETS }, (_, bucket) => {
      const pct = (bucket + 0.5) / BUCKETS;

      return {
        speed: 50,
        throttle: 1 - brakeAt(pct),
        brake: brakeAt(pct),
        latAccel: null,
        longAccel: null,
        steeringWheelAngle: 0,
        timeIntoLap: pct * 100,
      };
    }),
  });

  const atPct = (pct: number) => {
    const positions = Array.from({ length: 8 }, () => -1);

    positions[PLAYER] = pct;

    runInAction(() => {
      core.cars.updateCarPositions({
        car_idx_lap_dist_pct: positions,
        car_idx_track_surface: positions.map(() => 3),
      });
      core.player.updateCarInputs({ throttle: 0.5 } as CarInputsFrame);
    });
  };

  beforeEach(() => {
    core = new PreviewCore();
    runInAction(() => {
      core.session.updateSessionInfo({
        playerCarIdx: PLAYER,
      } as Parameters<typeof core.session.updateSessionInfo>[0]);
    });
    inputTrace = core.widgetInstances.open(
      { core, instanceId: INPUT_TRACE, type: INPUT_TRACE },
      createInputTrace
    ) as InputTraceWidgetStore;
  });

  afterEach(() => {
    core.dispose();
  });

  it('carries no reference without a reference lap', () => {
    atPct(0.25);

    expect(inputTrace.frameSamples[0]?.refBrake).toBeNull();
  });

  it('samples the reference at the car’s lap position', () => {
    runInAction(() => {
      core.referenceLap.updateReferenceLap(
        referenceLap((pct) => (pct > 0.4 && pct < 0.6 ? 1 : 0))
      );
    });

    atPct(0.2);
    expect(inputTrace.frameSamples[0]?.refBrake).toBe(0);
    expect(inputTrace.frameSamples[0]?.refThrottle).toBe(1);

    atPct(0.5);
    // A jump of more than 5% of a lap is not spread across the frame.
    expect(inputTrace.frameSamples.at(-1)?.refBrake).toBe(1);
  });

  it('spreads a frame across start/finish without jumping back a lap', () => {
    runInAction(() => {
      core.referenceLap.updateReferenceLap(
        referenceLap((pct) => (pct < 0.01 ? 1 : 0))
      );
    });

    atPct(0.995);
    atPct(0.005);

    expect(inputTrace.frameSamples.at(-1)?.refBrake).toBe(1);
  });
});
