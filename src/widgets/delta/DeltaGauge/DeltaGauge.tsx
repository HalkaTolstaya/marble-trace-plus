import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import {
  DELTA_GAUGE_RANGES,
  getDeltaState,
  resolveGaugeRange,
} from '@shared/lib/delta-utils';
import styles from './DeltaGauge.module.scss';

interface Props {
  delta: number | null;
  /**
   * Fixed seconds per half of the track. Omit to let the gauge auto-range
   * through DELTA_GAUGE_RANGES the way the sim's own delta bar does.
   */
  range?: number;
}

const HALF_TRACK_PCT = 50;

/** Where the scale is ruled, as shares of the track: each half cut in four. */
const TICK_POSITIONS_PCT = [12.5, 25, 37.5, 62.5, 75, 87.5];

const FILL_CLASS = {
  ahead: styles.ahead,
  behind: styles.behind,
  neutral: styles.neutral,
};

const formatRange = (range: number): string =>
  Number.isInteger(range) ? range.toFixed(1) : String(range);

export const DeltaGauge = observer(({ delta, range }: Props) => {
  const [autoRange, setAutoRange] = useState<number>(DELTA_GAUGE_RANGES[0]);

  const resolvedAutoRange =
    range === undefined ? resolveGaugeRange(delta, autoRange) : autoRange;

  if (resolvedAutoRange !== autoRange) {
    setAutoRange(resolvedAutoRange);
  }

  const activeRange = range ?? resolvedAutoRange;
  const clamped = Math.max(-activeRange, Math.min(activeRange, delta ?? 0));
  const widthPct = (Math.abs(clamped) / activeRange) * HALF_TRACK_PCT;
  const leftPct = clamped >= 0 ? HALF_TRACK_PCT : HALF_TRACK_PCT - widthPct;
  const sideClass = clamped >= 0 ? styles.fillRight : styles.fillLeft;
  const rangeText = formatRange(activeRange);

  return (
    <div className={styles.gauge}>
      <div className={styles.track}>
        <div
          className={`${styles.fill} ${sideClass} ${FILL_CLASS[getDeltaState(delta)]}`}
          style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
        />

        {TICK_POSITIONS_PCT.map((positionPct) => (
          <span
            key={positionPct}
            className={styles.tick}
            style={{ left: `${positionPct}%` }}
          />
        ))}
      </div>

      <div className={styles.zero} />

      {/* The gauge changes its scale as the gap grows, so the scale is
          written on it: a full bar at 0.5 s is not a full bar at 5. */}
      <div className={styles.scale}>
        <span>−{rangeText}</span>
        <span>+{rangeText}</span>
      </div>
    </div>
  );
});
