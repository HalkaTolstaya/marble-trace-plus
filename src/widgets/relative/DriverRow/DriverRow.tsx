import { useWidgetSettings } from '@entities/layout/useWidgetSettings';
import type { CSSProperties } from 'react';
import { observer } from 'mobx-react-lite';
import {
  formatCarNumber,
  TRACK_SURFACE_IN_PIT_STALL,
  TRACK_SURFACE_OFF_TRACK,
} from '@shared/lib/driver';
import { computeRelativeGap, parseDriverFlags } from '@shared/lib/driver';
import { DriverStatusBadges } from '@shared/ui/DriverStatusBadge/DriverStatusBadges';
import { RadioMark } from '@entities/cars/RadioMark/RadioMark';
import { getContrastTextColor, playerRowStyle } from '@shared/lib/colors';
import { CountryFlag } from '@shared/ui/CountryFlag/CountryFlag';
import { DriverFlagBadge } from '@shared/ui/DriverFlagBadge/DriverFlagBadge';
import { LicBadge } from '@shared/ui/RatingBadge/LicBadge';
import { formatIr } from '@shared/ui/RatingBadge/LicBadge.utils';
import {
  buildRelativeGridTemplate,
  classPlacesGained,
  formatDriverName,
  resolveRowPosition,
} from '@widgets/relative/relative-utils';
import { formatLapTime } from '@shared/lib/telemetry-format';
import { formatAverageLap } from '@entities/cars/lap-pace';
import { hasRaceStarted } from '@shared/lib/timer-utils';
import { TireBadge } from '@shared/ui/TireBadge/TireBadge';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useSessionStore } from '@entities/session/session-context';
import { useRelativeWidgetStore } from '@widgets/relative/relative.store';
import { useReactiveDomWrite } from '@shared/hooks/useReactiveDomWrite';

import styles from './DriverRow.module.scss';
import { useBackendComputedStore } from '@entities/cars/computed-context';
import type { RelativeWidgetSettings } from '../settings-schema';

interface DriverRowProps {
  carIdx: number;
  index: number;
}

/**
 * One car of the strip. Everything it draws but the gap changes at most once a
 * lap, so the row is rendered from the identity and the gap — which moves every
 * tick, along with the lapped-and-lapping colouring that rides on it — is
 * written straight to its span. See `docs/rendering.md`.
 */
export const DriverRow = observer(({ carIdx, index }: DriverRowProps) => {
  const computed = useBackendComputedStore();
  const relativeWidget = useRelativeWidgetStore();
  const { session } = useSessionStore();

  const settings = useWidgetSettings<RelativeWidgetSettings>('relative');

  const driver = computed.relativeIdentities.find(
    (identity) => identity.carIdx === carIdx
  );

  const gapRef = useReactiveDomWrite<HTMLSpanElement>(
    (element, scheduleWrite) => {
      // oxlint-disable-next-line no-restricted-properties
      const entries = computed.relativeEntries;
      const liveDriver = entries.find((entry) => entry.carIdx === carIdx);
      const livePlayer = entries.find((entry) => entry.isPlayer) ?? null;

      if (!liveDriver) {
        return;
      }

      const relativeGap = livePlayer
        ? computeRelativeGap(liveDriver, livePlayer)
        : 0;

      const gapText =
        relativeGap > 0
          ? `+${relativeGap.toFixed(settings.gapDecimals)}`
          : relativeGap < 0
            ? relativeGap.toFixed(settings.gapDecimals)
            : (0).toFixed(settings.gapDecimals);

      const gapClass = liveDriver.isPlayer
        ? styles.f2Player
        : relativeGap > 0
          ? styles.f2Positive
          : relativeGap < 0
            ? styles.f2Negative
            : styles.f2Player;

      const lapDiff = livePlayer
        ? liveDriver.lap +
          liveDriver.lapDistPct -
          (livePlayer.lap + livePlayer.lapDistPct)
        : 0;

      scheduleWrite(() => {
        element.classList.remove(
          styles.f2Player,
          styles.f2Positive,
          styles.f2Negative
        );
        element.classList.add(gapClass);
        element.textContent = liveDriver.isPlayer ? '-' : gapText;

        const row = element.closest('[data-relative-row]');
        const name = row?.querySelector(`.${styles.driverName}`);

        if (name instanceof HTMLElement) {
          name.classList.toggle(
            styles.driverNameLappedBehind,
            !liveDriver.isPlayer && lapDiff < -0.5
          );
          name.classList.toggle(
            styles.driverNameLappingUs,
            !liveDriver.isPlayer && lapDiff > 0.5
          );
        }
      });
    },
    [computed, carIdx, settings.gapDecimals]
  );

  if (!driver) {
    return null;
  }

  const isOut = driver.trackSurface === 'NotInWorld';
  const isOffTrack = !isOut && driver.trackSurface === TRACK_SURFACE_OFF_TRACK;

  const isPit =
    !isOut &&
    (driver.trackSurface === TRACK_SURFACE_IN_PIT_STALL || driver.onPitRoad);

  const pitState = driver.pitState;
  const flagType = parseDriverFlags(driver.rawFlags);

  const position = resolveRowPosition(driver, settings.useLivePositions);

  const rowClass = [
    styles.driverRow,
    settings.rowPadding === 'narrow' ? styles.rowPaddingNarrow : '',
    settings.rowPadding === 'medium' ? styles.rowPaddingMedium : '',
    settings.rowPadding === 'wide' ? styles.rowPaddingWide : '',
    driver.isPlayer ? styles.driverRowPlayer : '',
    index % 2 !== 0 ? styles.rowOdd : '',
    isOffTrack ? styles.driverRowOffTrack : '',
    isOut ? styles.driverRowOut : '',
  ]
    .filter(Boolean)
    .join(' ');

  const formattedCarNumber = formatCarNumber(driver.carNumber);

  const placesGained = hasRaceStarted(session?.session_state ?? null)
    ? classPlacesGained(
        driver.startPosClass,
        settings.useLivePositions
          ? driver.liveClassPosition
          : driver.classPosition
      )
    : null;

  const posChangeMark =
    placesGained === null || placesGained === 0 ? (
      <span className={styles.changeNeutral}>–</span>
    ) : placesGained > 0 ? (
      <span className={styles.changeUp}>
        <ChevronUp size={11} />
        {placesGained}
      </span>
    ) : (
      <span className={styles.changeDown}>
        <ChevronDown size={11} />
        {-placesGained}
      </span>
    );

  const irDelta = settings.useLivePositions
    ? driver.estimatedIrDeltaLive
    : driver.estimatedIrDeltaOfficial;
  const roundedIrDelta = irDelta === null ? null : Math.round(irDelta);

  const irChangeMark =
    roundedIrDelta === null || roundedIrDelta === 0 ? (
      <span className={styles.changeNeutral}>–</span>
    ) : (
      <span
        className={roundedIrDelta > 0 ? styles.changeUp : styles.changeDown}
      >
        {roundedIrDelta > 0 ? `+${roundedIrDelta}` : roundedIrDelta}
      </span>
    );

  const isClassBest =
    driver.bestLapTime !== null &&
    relativeWidget.classBestLaps.get(driver.carClassId) === driver.bestLapTime;

  const gridTemplate = buildRelativeGridTemplate(settings);

  const rowFill = playerRowStyle(driver.isPlayer, settings.playerRowColor);

  // The stripe is painted by a pseudo-element, so the class color reaches it
  // through a variable — the same marker Standings rows carry.
  const rowStyle = {
    gridTemplateColumns: gridTemplate,
    ...rowFill,
    '--row-class-marker': driver.carClassColor,
  } as CSSProperties;

  return (
    <div className={rowClass} style={rowStyle} data-relative-row>
      <div className={styles.posBlock}>
        <span
          className={`${styles.driverPosition} ${driver.isPlayer ? styles.driverPositionPlayer : ''}`}
          style={
            driver.isPlayer ? { color: settings.playerAccentColor } : undefined
          }
        >
          {position}
        </span>
      </div>

      {settings.showPosChange && (
        <div className={styles.cellCenter}>{posChangeMark}</div>
      )}

      {settings.showCarNumber && (
        <div className={styles.carNumberCell}>
          <span
            className={styles.driverCarNumber}
            style={{
              backgroundColor: driver.carClassColor,
              color: getContrastTextColor(driver.carClassColor),
            }}
          >
            {formattedCarNumber}
          </span>
        </div>
      )}

      {settings.showCountryFlag && (
        <div className={styles.countryFlagCell}>
          <CountryFlag flairId={driver.flairId} isAi={driver.isAi} />
        </div>
      )}

      <div className={styles.infoBlock}>
        {settings.showDriverFlags && flagType !== 'none' && (
          <DriverFlagBadge type={flagType} />
        )}

        <span
          className={[
            styles.driverName,
            driver.isPlayer ? styles.driverNamePlayer : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {formatDriverName(driver.userName, settings.nameFormat)}
        </span>

        {settings.showRadioMark && (
          <RadioMark carIdx={driver.carIdx} onPlayerRow={driver.isPlayer} />
        )}

        <DriverStatusBadges
          flagType={flagType}
          isTowed={driver.isTowed}
          isOut={isOut}
          isOffTrack={isOffTrack}
          isPit={isPit}
          pitState={pitState}
          showPit={settings.showPitIndicator}
        />
      </div>

      {settings.showLapNumber && (
        <div className={styles.cellCenter}>
          <span className={styles.lapChip}>L{driver.lap}</span>
        </div>
      )}

      {settings.showLicBadge ? (
        <div className={styles.colLic}>
          <LicBadge
            licString={driver.licString}
            showLetter={settings.showLicenseLetter}
            badgeStyle={settings.licBadgeStyle}
          />
        </div>
      ) : null}

      {settings.showIRating ? (
        <div className={styles.colIr}>
          <span>{formatIr(driver.iRating, settings.abbreviateIRating)}</span>
        </div>
      ) : null}

      {settings.showIrChange && (
        <div className={styles.cellCenter}>{irChangeMark}</div>
      )}

      {settings.showBestLap && (
        <div className={styles.cellRight}>
          <span
            className={`${styles.lapTime} ${isClassBest ? styles.lapTimeBest : ''}`}
          >
            {formatLapTime(driver.bestLapTime, settings.lapTimeDecimals)}
          </span>
        </div>
      )}

      {settings.showLastLap && (
        <div className={styles.cellRight}>
          <span className={styles.lapTime}>
            {formatLapTime(driver.lastLapTime, settings.lapTimeDecimals)}
          </span>
        </div>
      )}

      {settings.showAvgLap && (
        <div className={styles.cellRight}>
          <span className={styles.lapTime}>
            {formatAverageLap(
              relativeWidget.lapPace.averageLap(carIdx, settings.avgLapMode),
              settings.lapTimeDecimals
            )}
          </span>
        </div>
      )}

      {settings.showStintLaps && (
        <div className={styles.cellCenter}>
          <span className={styles.lapTime}>
            {relativeWidget.lapPace.stintLaps(carIdx, driver.lap)}
          </span>
        </div>
      )}

      {settings.showTire && (
        <div className={styles.cellCenter}>
          <TireBadge tire={driver.tireCompound} />
        </div>
      )}

      <div className={styles.f2Block}>
        <span ref={gapRef} className={styles.f2Time} />
      </div>
    </div>
  );
});
