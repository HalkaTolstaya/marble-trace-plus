import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DriverEntry } from '@shared/contracts/driver-entry';
import { LiveRacePreview } from './live-race';
import type { PreviewTarget } from './preview-target';

const FIELD_SIZE = 8;

const fieldOf = (): DriverEntry[] =>
  Array.from(
    { length: FIELD_SIZE },
    (_unused, index) =>
      ({
        carIdx: index + 1,
        carClassId: 1,
        isPlayer: index === 4,
        lap: 10,
        lapDistPct: 0.5,
        lastLapTime: 92,
        bestLapTime: 91.5,
      }) as DriverEntry
  );

const fakeStore = () => {
  const frames: Array<{ entries: DriverEntry[] }> = [];
  const store = {
    backendComputed: {
      fieldEntries: fieldOf(),
      updateDriverEntries: (frame: { entries: DriverEntry[] }) =>
        frames.push(frame),
      updateRelative: () => undefined,
    },
    player: { carInputs: null, carDynamics: null },
  } as unknown as PreviewTarget;

  return { store, frames };
};

const orderOf = (frame: { entries: DriverEntry[] }) =>
  frame.entries.map((entry) => entry.carIdx).join();

describe('LiveRacePreview', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('changes places and closes laps within a minute', () => {
    const { store, frames } = fakeStore();
    const race = new LiveRacePreview(store);

    race.start();
    vi.advanceTimersByTime(60_000);
    race.stop();

    const orders = new Set(frames.map(orderOf));
    const lastLaps = new Set(
      frames.map((frame) => frame.entries[0]?.lastLapTime)
    );

    expect(orders.size).toBeGreaterThan(1);
    expect(lastLaps.size).toBeGreaterThan(1);
  });

  it('stops writing once stopped', () => {
    const { store, frames } = fakeStore();
    const race = new LiveRacePreview(store);

    race.start();
    vi.advanceTimersByTime(1_000);
    race.stop();

    const written = frames.length;

    vi.advanceTimersByTime(5_000);

    expect(frames.length).toBe(written);
  });
});
