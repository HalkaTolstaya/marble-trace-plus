import { MOVE_DURATION_MS } from '@shared/lib/animation';
import { useLayoutEffect, useRef, useState, type RefCallback } from 'react';

const ROW_SELECTOR = '[data-driver-row]';
export const ROW_KEY_ATTRIBUTE = 'data-row-key';
// A short overshoot: the passing row settles with a slight spring instead of
// braking into place.
const MOVE_EASING = 'cubic-bezier(0.2, 0.85, 0.3, 1.05)';
// Set on a row that changed places, read by its stylesheet: `gain` when it
// moved up, `loss` when it moved down. The flash is a one-shot animation on a
// change of state, not on the telemetry (ADR-0009).
export const ROW_FLASH_ATTRIBUTE = 'data-row-flash';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
// Sub-pixel drift from rounding must not trigger a transition.
const MIN_MOVE_PX = 1;

type RowTops = Map<string, number>;

const readRows = (container: HTMLElement): HTMLElement[] =>
  Array.from(container.querySelectorAll<HTMLElement>(ROW_SELECTOR));

const rowKey = (row: HTMLElement): string =>
  row.getAttribute(ROW_KEY_ATTRIBUTE) ?? '';

// Vertical offset a still-running transition has already applied. Without it a
// reorder that lands mid-flight would restart from the settled layout position
// and the row would visibly jump.
const currentShift = (row: HTMLElement): number => {
  const { transform } = getComputedStyle(row);

  if (!transform || transform === 'none') {
    return 0;
  }

  const values = transform
    .slice(transform.indexOf('(') + 1, -1)
    .split(',')
    .map(Number);

  const translateY = values.length === 16 ? values[13] : values[5];

  return Number.isFinite(translateY) ? translateY : 0;
};

const prefersReducedMotion = (): boolean =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia(REDUCED_MOTION_QUERY).matches;

// Restarts the flash even when the row already carries it from a pass a moment
// ago: the attribute is dropped, the style flushed, and set again.
const flashRow = (row: HTMLElement, direction: 'gain' | 'loss') => {
  row.removeAttribute(ROW_FLASH_ATTRIBUTE);
  void row.offsetWidth;
  row.setAttribute(ROW_FLASH_ATTRIBUTE, direction);
};

/**
 * How many places each row rose (positive) or fell (negative), counted among
 * the rows present in both orders only. A car joining or leaving the list
 * pushes the rows around it without anyone passing anyone, so it must not
 * read as a gain or a loss.
 */
export const changesOfPlace = (
  before: readonly string[],
  after: readonly string[]
): Map<string, number> => {
  const present = new Set(after);
  const kept = before.filter((key) => present.has(key));
  const keptSet = new Set(kept);
  const placeBefore = new Map(kept.map((key, place) => [key, place]));
  const changes = new Map<string, number>();
  let place = 0;

  for (const key of after) {
    if (!keptSet.has(key)) {
      continue;
    }

    changes.set(key, (placeBefore.get(key) ?? place) - place);
    place += 1;
  }

  return changes;
};

const measureTops = (rows: HTMLElement[]): RowTops => {
  const tops: RowTops = new Map();

  for (const row of rows) {
    tops.set(rowKey(row), row.offsetTop);
  }

  return tops;
};

/**
 * Slides rows to their new places when the standings order changes (FLIP): each
 * row is offset back to where it was, then released into a transition, so a car
 * that gains a place visibly travels up past the one it passed.
 *
 * Transforms are written straight to the nodes rather than through React state —
 * they are per-frame geometry, and re-rendering to animate would fight the
 * 10 Hz telemetry updates that cause the reorder in the first place.
 */
export const useRowMoveAnimation = <T extends HTMLElement>(
  animate = true
): RefCallback<T> => {
  const [container, setContainer] = useState<T | null>(null);
  const previousTops = useRef<RowTops>(new Map());
  const previousOrder = useRef('');
  const previousKeys = useRef<string[]>([]);
  const frameId = useRef(0);
  const wasAnimating = useRef(animate);

  // No dependency array: the order can change on any render, and comparing the
  // rendered key order is cheaper than measuring, so unchanged renders cost a
  // single attribute read per row.
  useLayoutEffect(() => {
    if (!container) {
      return;
    }

    const rows = readRows(container);
    const order = rows.map(rowKey).join();

    if (order === previousOrder.current) {
      return;
    }

    previousOrder.current = order;

    const keysBefore = previousKeys.current;

    previousKeys.current = rows.map(rowKey);

    // Skipped both while animation is off and on the first render after it comes
    // back on: the rows moved because the list itself moved, not because of a
    // pass, so sliding them would animate the scroll instead of an overtake.
    const skipAnimation =
      !animate || !wasAnimating.current || prefersReducedMotion();

    wasAnimating.current = animate;

    if (skipAnimation) {
      cancelAnimationFrame(frameId.current);

      for (const row of rows) {
        row.style.transition = 'none';
        row.style.transform = '';
      }

      previousTops.current = measureTops(rows);

      return;
    }

    const tops = measureTops(rows);
    const placeChanges = changesOfPlace(keysBefore, previousKeys.current);
    const moved: HTMLElement[] = [];

    for (const row of rows) {
      const before = previousTops.current.get(rowKey(row));
      const after = tops.get(rowKey(row));

      if (before === undefined || after === undefined) {
        continue;
      }

      const delta = before + currentShift(row) - after;

      if (Math.abs(delta) < MIN_MOVE_PX) {
        row.style.transition = 'none';
        row.style.transform = '';
        continue;
      }

      row.style.transition = 'none';
      row.style.transform = `translateY(${delta}px)`;
      moved.push(row);

      const placeChange = placeChanges.get(rowKey(row)) ?? 0;

      if (placeChange !== 0) {
        flashRow(row, placeChange > 0 ? 'gain' : 'loss');
      }
    }

    previousTops.current = tops;

    if (moved.length === 0) {
      return;
    }

    cancelAnimationFrame(frameId.current);

    frameId.current = requestAnimationFrame(() => {
      for (const row of moved) {
        row.style.transition = `transform ${MOVE_DURATION_MS}ms ${MOVE_EASING}`;
        row.style.transform = '';
      }
    });
  });

  useLayoutEffect(() => {
    if (!container) {
      return;
    }

    // Row heights follow --wfs, so a resize invalidates the stored geometry.
    // Re-measure without animating — the rows did not change places.
    const observer = new ResizeObserver(() => {
      previousTops.current = measureTops(readRows(container));
    });

    observer.observe(container);

    return () => {
      cancelAnimationFrame(frameId.current);
      observer.disconnect();
    };
  }, [container]);

  return setContainer;
};
