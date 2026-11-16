/**
 * The countdown line's length between cue frames (ADR-0017, smooth motion).
 *
 * The backend fills the line linearly in time: `fill = 1 − untilBrake / lead`.
 * A frame carries both, so the lead is known from the frame itself, and the
 * line can be drawn at any moment after it from the time that has passed — at
 * the display's rate, not the frames'. It never runs back within one count: a
 * frame that reads a little behind the prediction (the car slowed) holds the
 * line until time catches up rather than shortening it.
 */
export interface ContourAnchor {
  fill: number;
  untilBrake: number;
  /** When the frame arrived, in `performance.now()` milliseconds. */
  receivedAtMs: number;
}

const MS_PER_SECOND = 1000;

/** The count's length in seconds from one frame, or null when it cannot tell. */
export const leadOf = (fill: number, untilBrake: number): number | null => {
  if (fill >= 1 || untilBrake <= 0) {
    return null;
  }

  return untilBrake / (1 - fill);
};

/** The line's length at `nowMs`, predicted from the last frame. */
export const fillAt = (anchor: ContourAnchor, nowMs: number): number => {
  const lead = leadOf(anchor.fill, anchor.untilBrake);

  if (lead === null) {
    return anchor.fill;
  }

  const elapsed = (nowMs - anchor.receivedAtMs) / MS_PER_SECOND;
  const predicted = 1 - (anchor.untilBrake - elapsed) / lead;

  return Math.min(1, Math.max(anchor.fill, predicted));
};
