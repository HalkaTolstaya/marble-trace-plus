import type {
  ReferenceLapSample,
  SectorEntry,
} from '@shared/contracts/generated/bindings';

/** A sector as a stretch of the lap, in lap fraction. */
export interface SectorSpan {
  startPct: number;
  endPct: number;
}

/** The session's sectors in lap order; each ends where the next begins. */
export const sectorSpansOf = (
  sectors: readonly SectorEntry[]
): SectorSpan[] => {
  const starts = sectors
    .map((sector) => sector.sectorStartPct)
    .filter((startPct) => Number.isFinite(startPct))
    .sort((first, second) => first - second);

  return starts.map((startPct, index) => ({
    startPct,
    endPct: starts[index + 1] ?? 1,
  }));
};

/** Slower than this a bucket is not driving: a spin, a stop. Metres a second. */
const MIN_INTEGRATION_SPEED = 1;

/**
 * The reference lap's own clock: the seconds into the lap at the centre of
 * each distance bucket. Read off the lap where it carries one; a reference
 * recorded before it did has only speeds, and its clock is the time each
 * bucket takes at that speed, scaled so the whole comes to the lap time.
 */
export const referenceClockOf = (
  samples: readonly ReferenceLapSample[],
  lapTime: number
): number[] | null => {
  if (samples.length === 0 || !(lapTime > 0)) {
    return null;
  }

  const recorded = samples.map((sample) => sample.timeIntoLap ?? null);

  if (recorded.every((time) => time !== null && Number.isFinite(time))) {
    return recorded as number[];
  }

  const bucketTimes = samples.map(
    (sample) => 1 / Math.max(sample.speed, MIN_INTEGRATION_SPEED)
  );
  const total = bucketTimes.reduce((sum, time) => sum + time, 0);
  const scale = lapTime / total;

  let elapsed = 0;

  return bucketTimes.map((bucketTime) => {
    const atCentre = (elapsed + bucketTime / 2) * scale;

    elapsed += bucketTime;

    return atCentre;
  });
};

/**
 * The reference's time at a point on the lap, between the two bucket centres
 * it falls between. The lap starts at zero and ends at the lap time, which is
 * what the half buckets before the first centre and after the last run to.
 */
export const referenceTimeAt = (
  clock: readonly number[],
  lapTime: number,
  lapPct: number
): number => {
  const count = clock.length;
  const position = Math.min(Math.max(lapPct, 0), 1) * count - 0.5;
  const lower = Math.floor(position);
  const share = position - lower;
  const before = lower < 0 ? 0 : (clock[lower] ?? lapTime);
  const after = lower + 1 >= count ? lapTime : (clock[lower + 1] ?? lapTime);

  // The first half bucket runs from the line, not from the centre before it.
  if (lower < 0) {
    return after * (share * 2 - 1);
  }

  if (lower + 1 >= count) {
    return before + (lapTime - before) * Math.min(1, share * 2);
  }

  return before + (after - before) * share;
};

/** The reference's time through each sector. */
export const referenceSectorTimesOf = (
  clock: readonly number[],
  lapTime: number,
  spans: readonly SectorSpan[]
): number[] =>
  spans.map(
    (span) =>
      referenceTimeAt(clock, lapTime, span.endPct) -
      referenceTimeAt(clock, lapTime, span.startPct)
  );

export type SectorRowState = 'done' | 'current' | 'ahead';

/** Against the reference: quicker, slower, or nothing to say yet. */
export type SectorTone = 'faster' | 'slower' | 'neutral';

export interface SectorRow {
  sectorIndex: number;
  state: SectorRowState;
  tone: SectorTone;
  /** The sector's time; the running one while the car is in it. */
  time: number | null;
  /** Seconds against the reference over the same stretch; null without one. */
  delta: number | null;
  /** How much of the sector is behind the car, 0-1. */
  progress: number;
}

/** A delta closer to zero than this is the same time, not a gain or a loss. */
const LEVEL_DELTA_S = 0.0005;

export const toneOfDelta = (delta: number | null): SectorTone => {
  if (delta === null || Math.abs(delta) < LEVEL_DELTA_S) {
    return 'neutral';
  }

  return delta < 0 ? 'faster' : 'slower';
};

export interface SectorRowsInput {
  spans: readonly SectorSpan[];
  /** The reference's clock and lap time; null without a reference lap. */
  reference: { clock: readonly number[]; lapTime: number } | null;
  /** This lap's sector times, as the backend reports them. */
  sectorTimes: readonly (number | null)[];
  /** Null while the car is off the lap: every sector is still ahead. */
  currentSectorIdx: number | null;
  currentLapTime: number;
  /** Where on the lap the car is, 0-1; null when unknown. */
  lapPct: number | null;
}

const unit = (value: number): number => Math.min(Math.max(value, 0), 1);

/**
 * Every sector of the lap as a row: the ones behind the car with their time
 * and what it gained or lost on the reference, the one it is in with its
 * running time and the live difference over the part driven so far, and the
 * ones ahead with nothing yet.
 */
export const sectorRowsOf = ({
  spans,
  reference,
  sectorTimes,
  currentSectorIdx,
  currentLapTime,
  lapPct,
}: SectorRowsInput): SectorRow[] => {
  const referenceTimes = reference
    ? referenceSectorTimesOf(reference.clock, reference.lapTime, spans)
    : null;

  return spans.map((span, sectorIndex) => {
    const isOnLap = currentSectorIdx !== null;

    if (!isOnLap || sectorIndex > currentSectorIdx) {
      return {
        sectorIndex,
        state: 'ahead',
        tone: 'neutral',
        time: null,
        delta: null,
        progress: 0,
      };
    }

    const referenceTime = referenceTimes?.[sectorIndex] ?? null;

    if (sectorIndex < currentSectorIdx) {
      const time = sectorTimes[sectorIndex] ?? null;
      const delta =
        time !== null && time > 0 && referenceTime !== null
          ? time - referenceTime
          : null;

      return {
        sectorIndex,
        state: 'done',
        tone: toneOfDelta(delta),
        time: time !== null && time > 0 ? time : null,
        delta,
        progress: 1,
      };
    }

    // The backend writes the running sector's time into its slot too, so the
    // time behind the car is summed over the sectors before this one only.
    const banked = sectorTimes
      .slice(0, sectorIndex)
      .reduce<number>((sum, time) => sum + (time ?? 0), 0);
    const time = Math.max(0, currentLapTime - banked);
    const length = span.endPct - span.startPct;
    const progress =
      lapPct === null || length <= 0
        ? 0
        : unit((lapPct - span.startPct) / length);
    const delta =
      reference && lapPct !== null
        ? time -
          (referenceTimeAt(reference.clock, reference.lapTime, lapPct) -
            referenceTimeAt(reference.clock, reference.lapTime, span.startPct))
        : null;

    return {
      sectorIndex,
      state: 'current',
      tone: 'neutral',
      time,
      delta,
      progress,
    };
  });
};

/**
 * Which rows are on screen when the lap has more sectors than the widget has
 * rows: the window slides with the car, keeping the sector it is in as the
 * last row but one, so the one just banked and the one coming are both seen.
 */
export const visibleRowStart = (
  sectorCount: number,
  currentSectorIdx: number | null,
  visibleRows: number
): number => {
  const lastStart = Math.max(0, sectorCount - visibleRows);
  const wanted = (currentSectorIdx ?? 0) - (visibleRows - 2);

  return Math.min(Math.max(wanted, 0), lastStart);
};

const SECONDS_PER_MINUTE = 60;
const MILLIS = 1000;
const PENDING_TIME = '-:--.---';
const PENDING_DELTA = '';

/** `0:10.814` — minutes always shown, so every time in the column lines up. */
export const formatClock = (seconds: number | null): string => {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) {
    return PENDING_TIME;
  }

  const totalMillis = Math.round(seconds * MILLIS);
  const minutes = Math.floor(totalMillis / (SECONDS_PER_MINUTE * MILLIS));
  const rest = totalMillis - minutes * SECONDS_PER_MINUTE * MILLIS;
  const wholeSeconds = Math.floor(rest / MILLIS);
  const millis = rest - wholeSeconds * MILLIS;

  return `${minutes}:${String(wholeSeconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
};

/** `+0.306` / `-0.112`; empty without a value. */
export const formatDeltaSeconds = (delta: number | null): string => {
  if (delta === null || !Number.isFinite(delta)) {
    return PENDING_DELTA;
  }

  return `${delta < 0 ? '-' : '+'}${Math.abs(delta).toFixed(3)}`;
};
