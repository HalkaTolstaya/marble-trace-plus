import {
  useCallback,
  useLayoutEffect,
  useRef,
  type DependencyList,
} from 'react';
import { autorun } from 'mobx';

/** Draws a frame of the scene `progress` (0–1) of the way to the newest tick. */
export type DrawAt = (progress: number) => void;

/** The bundle interval assumed until two ticks have been seen (30 Hz). */
const DEFAULT_INTERVAL_MS = 1000 / 30;
const MIN_INTERVAL_MS = 8;
const MAX_INTERVAL_MS = 250;
/** How much one new interval moves the running estimate. */
const INTERVAL_SMOOTHING = 0.2;

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

const prefersReducedMotion = (): boolean =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia(REDUCED_MOTION_QUERY).matches;

/**
 * `useReactiveCanvasLoop` with motion between the telemetry ticks (ADR-0017):
 * the effect hands over a `drawAt(progress)`, and the hook draws it at every
 * display frame from the moment a tick arrives (`progress` 0) until the time
 * one bundle interval takes (`progress` 1), then sleeps until the next tick.
 * The interval is measured from the ticks themselves, so the motion fills the
 * gap at whatever rate the overlay publishes.
 *
 * Off (`enabled` false, or the system asks for reduced motion), each tick is
 * drawn once at `progress` 1 — the plain loop of ADR-0009.
 */
export const useSmoothCanvasLoop = (
  reactiveEffect: (scheduleFrame: (drawAt: DrawAt) => void) => void,
  deps: DependencyList,
  enabled: boolean
) => {
  const effectRef = useRef(reactiveEffect);
  const drawRef = useRef<DrawAt | null>(null);
  const rafRef = useRef(0);
  const lastTickRef = useRef<number | null>(null);
  const intervalRef = useRef(DEFAULT_INTERVAL_MS);
  const enabledRef = useRef(enabled);

  useLayoutEffect(() => {
    effectRef.current = reactiveEffect;
    enabledRef.current = enabled;
  });

  const frame = useCallback((now: number) => {
    const drawAt = drawRef.current;
    const lastTick = lastTickRef.current;

    if (!drawAt || lastTick === null) {
      return;
    }

    const progress = Math.min(1, (now - lastTick) / intervalRef.current);

    drawAt(progress);

    if (progress < 1) {
      rafRef.current = requestAnimationFrame(frame);
    }
  }, []);

  const scheduleFrame = useCallback(
    (drawAt: DrawAt) => {
      const now = performance.now();
      const smooth = enabledRef.current && !prefersReducedMotion();

      drawRef.current = smooth ? drawAt : () => drawAt(1);

      if (smooth && lastTickRef.current !== null) {
        const measured = Math.min(
          MAX_INTERVAL_MS,
          Math.max(MIN_INTERVAL_MS, now - lastTickRef.current)
        );

        intervalRef.current +=
          (measured - intervalRef.current) * INTERVAL_SMOOTHING;
      }

      lastTickRef.current = now;
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(frame);
    },
    [frame]
  );

  useLayoutEffect(() => {
    const disposer = autorun(() => effectRef.current(scheduleFrame));

    return () => {
      disposer();
      cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
};
