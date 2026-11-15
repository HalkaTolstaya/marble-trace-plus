import { observer } from 'mobx-react-lite';

import { useStandingsWidgetStore } from '@widgets/standings/standings.store';

import styles from './DriverRow.module.scss';

const SECONDS_PER_MINUTE = 60;

/** "1:23" — the tow's time left. */
const formatCountdown = (seconds: number) =>
  `${Math.floor(seconds / SECONDS_PER_MINUTE)}:${String(seconds % SECONDS_PER_MINUTE).padStart(2, '0')}`;

/**
 * Beside the row, outside the table: how long the car has been on pit road
 * ("PIT 5s"), its last stop for a minute after it rejoins ("L28 · 7s"), or a
 * large yellow plate while it is towed after a crash — the tow button. The
 * sim reports the player's own tow with its time left ("TOW 1:23"); another
 * car's tow is known from it leaving the track for its box without driving
 * there (the backend's `isTowed`), timed from that moment ("TOW 12s"). Re-reads the store's
 * one-second clock, so only a row with a pill changes each second.
 */
export const PitPill = observer(({ carIdx }: { carIdx: number }) => {
  const standingsWidget = useStandingsWidgetStore();
  const isPlayer = standingsWidget.driverMap.get(carIdx)?.isPlayer ?? false;
  const towLeft = isPlayer ? standingsWidget.playerTowSecondsLeft : null;

  // The player's own tow is reported by the sim to the second: the time left.
  if (towLeft !== null) {
    return (
      <span className={`${styles.pitPill} ${styles.pitPillTow}`}>
        TOW {formatCountdown(towLeft)}
      </span>
    );
  }

  const pill = standingsWidget.pits.pillOf(carIdx, standingsWidget.clockMs);

  if (!pill) {
    return null;
  }

  if (pill.kind === 'tow') {
    return (
      <span className={`${styles.pitPill} ${styles.pitPillTow}`}>
        TOW {pill.seconds}s
      </span>
    );
  }

  if (pill.kind === 'pit') {
    return (
      <span className={`${styles.pitPill} ${styles.pitPillLive}`}>
        PIT {pill.seconds}s
      </span>
    );
  }

  return (
    <span className={styles.pitPill}>
      L{pill.lap}·{pill.seconds}s
    </span>
  );
});
