const FULL_TURN_DEGREES = 360;
const HALF_TURN_DEGREES = 180;

/**
 * The angle to write next so the turn from `previousDeg` to `targetDeg` goes
 * the short way round. A bearing wraps at 360, and an eased rotation between
 * 359 and 0 would otherwise swing through the whole circle; the returned
 * angle is the same direction as `targetDeg`, left unwrapped so it lies within
 * half a turn of the previous one.
 */
export const unwrapAngle = (
  previousDeg: number | null,
  targetDeg: number
): number => {
  if (previousDeg === null) {
    return targetDeg;
  }

  const step =
    ((((targetDeg - previousDeg + HALF_TURN_DEGREES) % FULL_TURN_DEGREES) +
      FULL_TURN_DEGREES) %
      FULL_TURN_DEGREES) -
    HALF_TURN_DEGREES;

  return previousDeg + step;
};
