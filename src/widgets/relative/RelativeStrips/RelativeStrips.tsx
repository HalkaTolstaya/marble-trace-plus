import { observer } from 'mobx-react-lite';
import { Clock, Thermometer, Timer, TriangleAlert, Waves } from 'lucide-react';

import { useWidgetSettings } from '@entities/layout/useWidgetSettings';
import { useBackendComputedStore } from '@entities/cars/computed-context';
import { useEnvironmentStore } from '@entities/environment/environment-context';
import { useSessionStore } from '@entities/session/session-context';
import { useUnitsStore } from '@entities/app-settings/units-context';
import { computeClassSof } from '@shared/lib/driver';
import {
  formatSessionTime,
  formatTemp,
  tempUnit,
} from '@shared/lib/telemetry-format';
import {
  isLapLimitedSession,
  resolveSessionClock,
} from '@shared/lib/timer-utils';
import {
  buildRelativeGridTemplate,
  parseSessionTemp,
} from '@widgets/relative/relative-utils';

import styles from './RelativeStrips.module.scss';
import type { RelativeWidgetSettings } from '../settings-schema';

const ICON_SIZE_PX = 13;

const SOF_THOUSAND = 1000;

/** The session clock as the timer setting asks: time, laps or both. */
const useSessionTimer = (settings: RelativeWidgetSettings) => {
  const { session, sessionInfo } = useSessionStore();
  const { driverIdentities } = useBackendComputedStore();

  const currentSession =
    sessionInfo?.sessions?.[sessionInfo?.currentSessionNum ?? 0];
  const isLapLimited = isLapLimitedSession(
    currentSession?.sessionLaps,
    currentSession?.sessionType
  );
  const { seconds } = resolveSessionClock(
    session?.session_time_remain ?? null,
    session?.session_time ?? null,
    isLapLimited
  );
  const playerLap =
    driverIdentities.find((entry) => entry.isPlayer)?.lap ?? null;
  const totalLaps =
    currentSession?.sessionLaps &&
    currentSession.sessionLaps.toLowerCase() !== 'unlimited'
      ? currentSession.sessionLaps
      : '-';

  const time = formatSessionTime(seconds);
  const laps = playerLap === null ? null : `${playerLap}/${totalLaps}`;

  return {
    time: settings.raceTimer === 'laps' ? null : time,
    laps: settings.raceTimer === 'time' ? null : laps,
  };
};

const formatWallClock = (format: RelativeWidgetSettings['clockFormat']) =>
  new Date().toLocaleTimeString(format === '12h' ? 'en-US' : 'en-GB', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: format === '12h',
  });

/** Temperatures, SoF, incidents and the clock, above the table. */
export const RelativeHeader = observer(() => {
  const settings = useWidgetSettings<RelativeWidgetSettings>('relative');
  const { environment } = useEnvironmentStore();
  const { sessionInfo } = useSessionStore();
  const { unitSystem } = useUnitsStore();
  const { driverIdentities } = useBackendComputedStore();
  const timer = useSessionTimer(settings);

  if (!settings.showTableHeader) {
    return null;
  }

  const unit = tempUnit(unitSystem);
  const air =
    environment?.airTemp ?? parseSessionTemp(sessionInfo?.trackAirTemp);
  const track =
    environment?.trackTemp ?? parseSessionTemp(sessionInfo?.trackSurfaceTemp);

  const player = driverIdentities.find((entry) => entry.isPlayer);
  const classField = player
    ? driverIdentities.filter((entry) => entry.carClassId === player.carClassId)
    : driverIdentities;
  const sof = computeClassSof(classField);

  const incidents = player?.incidents ?? 0;
  const incidentLimit = sessionInfo?.incidentLimit ?? null;

  return (
    <div className={styles.header}>
      <span className={styles.item}>
        <Thermometer size={ICON_SIZE_PX} className={styles.icon} />
        {air === null ? '–' : `${formatTemp(air, unitSystem)}${unit}`}
      </span>
      <span className={styles.item}>
        <Waves size={ICON_SIZE_PX} className={styles.icon} />
        {track === null ? '–' : `${formatTemp(track, unitSystem)}${unit}`}
      </span>
      <span className={styles.item}>
        <span className={styles.label}>SoF</span>
        {sof > 0 ? (sof / SOF_THOUSAND).toFixed(1) + 'k' : '–'}
      </span>
      <span className={styles.item}>
        <TriangleAlert size={ICON_SIZE_PX} className={styles.icon} />
        {incidentLimit ? `${incidents}/${incidentLimit}` : `${incidents}x`}
      </span>
      {timer.time !== null && (
        <span className={styles.item}>
          <Timer size={ICON_SIZE_PX} className={styles.icon} />
          {timer.time}
        </span>
      )}
    </div>
  );
});

/** Column titles, on the same grid as the rows. */
export const RelativeColumnHeaders = observer(() => {
  const settings = useWidgetSettings<RelativeWidgetSettings>('relative');

  if (!settings.showColumnHeaders) {
    return null;
  }

  const titles: Array<[boolean, string, 'left' | 'center' | 'right']> = [
    [true, 'Pos', 'center'],
    [settings.showPosChange, '±', 'center'],
    [settings.showCarNumber, '#', 'center'],
    [settings.showCountryFlag, '', 'center'],
    [true, 'Driver', 'left'],
    [settings.showLapNumber, 'Lap', 'center'],
    [settings.showLicBadge, 'IR', 'center'],
    [settings.showIRating && !settings.showLicBadge, 'iR', 'center'],
    [settings.showIrChange && !settings.showLicBadge, '±iR', 'center'],
    [settings.showBestLap, 'Best', 'right'],
    [settings.showLastLap, 'Last', 'right'],
    [settings.showAvgLap, 'Avg', 'right'],
    [settings.showStintLaps, 'Stint', 'center'],
    [settings.showTire, 'Tyre', 'center'],
    [true, 'Rel', 'right'],
  ];

  return (
    <div
      className={styles.columns}
      style={{ gridTemplateColumns: buildRelativeGridTemplate(settings) }}
    >
      {titles
        .filter(([shown]) => shown)
        .map(([, title, align], index) => (
          <span
            // The titles are fixed per layout; their place is their identity.
            // oxlint-disable-next-line react/no-array-index-key
            key={index}
            className={`${styles.columnTitle} ${styles[align]}`}
          >
            {title}
          </span>
        ))}
    </div>
  );
});

/** The player's lap, the session timer and the time of day, below the table. */
export const RelativeFooter = observer(() => {
  const settings = useWidgetSettings<RelativeWidgetSettings>('relative');
  const timer = useSessionTimer(settings);

  if (!settings.showTableFooter) {
    return null;
  }

  return (
    <div className={styles.footer}>
      <span className={styles.item}>{timer.laps ?? ''}</span>
      {settings.showRealTimeClock && (
        <span className={styles.item}>
          <Clock size={ICON_SIZE_PX} className={styles.icon} />
          {formatWallClock(settings.clockFormat)}
        </span>
      )}
      {timer.time !== null && (
        <span className={styles.item}>
          <Timer size={ICON_SIZE_PX} className={styles.icon} />
          {timer.time}
        </span>
      )}
    </div>
  );
});
