import { observer } from 'mobx-react-lite';
import { useWidgetInstanceId } from '@entities/layout/useWidgetSettings';
import { useRef, useCallback } from 'react';

import { useSmoothCanvasLoop } from '@shared/hooks/useSmoothCanvasLoop';
import { useCanvasAutoResize } from '@shared/hooks/useCanvasAutoResize';
import styles from './CanvasTrace.module.scss';
import { useAppSettingsStore } from '@entities/app-settings/app-settings-context';
import { useLiveWidgetsStore } from '@entities/layout/live-widgets-context';
import { useInputTraceWidgetStore } from '@widgets/input-trace/input-trace.store';
import {
  createTraceBufferState,
  drawInputTrace,
  ensureTraceBuffers,
  pushTraceSample,
  type TraceBufferState,
  type TraceScene,
} from './canvas-trace-render';
import type { InputTraceSettings } from '../settings-schema';

/** The signed step from one lap position to the next, across the line too. */
const lapStep = (fromPct: number, toPct: number): number => {
  const step = toPct - fromPct;

  if (step > 0.5) {
    return step - 1;
  }

  if (step < -0.5) {
    return step + 1;
  }

  return step;
};

// No frame has been consumed yet; the store's tick starts at 0 and reset()
// returns it there, so the sentinel must sit outside that range.
const NO_FRAME_CONSUMED = -1;

export const CanvasTrace = observer(() => {
  const liveWidgets = useLiveWidgetsStore();
  const instanceId = useWidgetInstanceId('input-trace');
  const inputTrace = useInputTraceWidgetStore();
  const appSettings = useAppSettingsStore();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bufferStateRef = useRef<TraceBufferState | null>(null);
  const lastFrameTickRef = useRef(NO_FRAME_CONSUMED);
  // The lap position the previous tick showed: the distance axis glides from
  // it to the newest one (smooth motion).
  const previousNowPctRef = useRef<number | null>(null);

  bufferStateRef.current ??= createTraceBufferState();

  const draw = useCallback(
    (
      settings: InputTraceSettings,
      steeringLockDeg: number,
      scene: TraceScene
    ) => {
      const canvas = canvasRef.current;
      const state = bufferStateRef.current;

      if (!canvas || !state) return;

      drawInputTrace(canvas, state, settings, steeringLockDeg, scene);
    },
    []
  );

  // What the frame is painted from besides the buffers. Read inside the
  // autorun, so a reference loaded or a session joined repaints the plot.
  const sceneOf = useCallback((): TraceScene => {
    const { lapPct, trackLengthM, referenceSamples } = inputTrace;

    return {
      referenceLoaded: referenceSamples !== null,
      distance:
        lapPct !== null && trackLengthM !== null
          ? { nowPct: lapPct, trackLengthM, referenceSamples }
          : null,
    };
  }, [inputTrace]);

  const smoothMotion =
    liveWidgets.getSettings<InputTraceSettings>(instanceId).smoothMotion;

  useSmoothCanvasLoop(
    (scheduleFrame) => {
      const settings = liveWidgets.getSettings<InputTraceSettings>(instanceId);
      const state = bufferStateRef.current;

      if (!state) return;

      // Touch every field drawInputTrace() reads so autorun tracks them as
      // dependencies — the draw itself runs deferred inside requestAnimationFrame,
      // outside the autorun's synchronous tracking window, so settings-only
      // changes (no telemetry update, e.g. the static widget preview) would
      // otherwise never trigger a redraw.
      const {
        lineWidth: _lineWidth,
        throttleColor: _throttleColor,
        brakeColor: _brakeColor,
        clutchColor: _clutchColor,
        absColor: _absColor,
        showAbs: _showAbs,
        showSteering: _showSteering,
        showSteeringTrace: _showSteeringTrace,
        steeringTraceColor: _steeringTraceColor,
        showSlide: _showSlide,
        slideColor: _slideColor,
        steeringZoom: _steeringZoom,
        showReference: _showReference,
        compareThrottle: _compareThrottle,
        compareBrake: _compareBrake,
        referenceOpacity: _referenceOpacity,
        showDistance: _showDistance,
        distanceWindow: _distanceWindow,
      } = settings;

      // Read inside the autorun for the same reason: the lock lives in app
      // settings, and changing it must repaint the steering trace.
      const steeringLockDeg = appSettings.appSettings.steeringLock;

      ensureTraceBuffers(state, settings);

      // This autorun runs more than once per telemetry frame: the store's
      // reaction writes `frameTick` and `frameSamples` in one MobX flush, which
      // can re-invalidate an autorun pass that already completed. Settings
      // edits re-run it too. Appending on every pass would push a frame's samples
      // twice and halve the configured `historySeconds`, so the append is gated
      // on the store's per-frame tick while the repaint below still happens.
      const { frameTick, frameSamples } = inputTrace;
      let samplesThisTick = 0;

      if (frameTick !== lastFrameTickRef.current) {
        lastFrameTickRef.current = frameTick;
        samplesThisTick = frameSamples.length;

        for (const sample of frameSamples) {
          pushTraceSample(state, sample, settings);
        }
      }

      const scene = sceneOf();
      const fromPct = previousNowPctRef.current;
      const toPct = scene.distance?.nowPct ?? null;

      previousNowPctRef.current = toPct;

      // Between two ticks the plot travels from where the last one left it:
      // the time plot by the columns the tick added, the distance axis from
      // the previous lap position to the new one, the short way round.
      scheduleFrame((progress) => {
        const glidingPct =
          scene.distance && fromPct !== null && toPct !== null
            ? (fromPct + lapStep(fromPct, toPct) * progress + 1) % 1
            : null;

        draw(settings, steeringLockDeg, {
          ...scene,
          timeLagSamples: samplesThisTick * (1 - progress),
          distance:
            scene.distance && glidingPct !== null
              ? { ...scene.distance, nowPct: glidingPct }
              : scene.distance,
        });
      });
    },
    [liveWidgets, inputTrace, appSettings, draw, sceneOf],
    smoothMotion
  );

  const redrawOnResize = useCallback(() => {
    const currentSettings =
      liveWidgets.getSettings<InputTraceSettings>(instanceId);

    draw(currentSettings, appSettings.appSettings.steeringLock, sceneOf());
  }, [liveWidgets, instanceId, appSettings, draw, sceneOf]);

  useCanvasAutoResize(canvasRef, redrawOnResize);

  return (
    <div className={styles.container}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        aria-label="Input trace"
      />
    </div>
  );
});
