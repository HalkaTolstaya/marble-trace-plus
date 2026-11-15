import { useWidgetSettings } from '@entities/layout/useWidgetSettings';
import type { CSSProperties } from 'react';
import { observer } from 'mobx-react-lite';
import { formatLapTime } from '@shared/lib/telemetry-format';
import { formatAverageLap } from '@entities/cars/lap-pace';
import {
  abbreviateName,
  formatBrand,
  formatCarNumber,
  TRACK_SURFACE_IN_PIT_STALL,
  TRACK_SURFACE_OFF_TRACK,
} from '@shared/lib/driver';
import { parseDriverFlags } from '@shared/lib/driver';
import { isSessionEnded } from '@shared/lib/timer-utils';
import { DriverStatusBadges } from '@shared/ui/DriverStatusBadge/DriverStatusBadges';
import { RadioMark } from '@entities/cars/RadioMark/RadioMark';
import { getContrastTextColor, playerRowStyle } from '@shared/lib/colors';
import { CountryFlag } from '@shared/ui/CountryFlag/CountryFlag';
import { DriverFlagBadge } from '@shared/ui/DriverFlagBadge/DriverFlagBadge';
import { RatingPill } from '@shared/ui/RatingPill/RatingPill';
import { formatIr } from '@shared/ui/RatingBadge/LicBadge.utils';
import { TireBadge } from '@shared/ui/TireBadge/TireBadge';
import {
  buildGridTemplate,
  calculateLapsBehind,
  getStandingsGap,
  resolveBestLapDisplay,
} from '@widgets/standings/standings-utils';
import { PosChange } from './PosChange';
import { PositionCell } from './PositionCell';
import { PitPill } from './PitPill';
import { IrChangeCell } from './IrChangeCell';

import styles from './DriverRow.module.scss';
import { useReactiveDomWrite } from '@shared/hooks/useReactiveDomWrite';
import { useBackendComputedStore } from '@entities/cars/computed-context';
import { useSessionStore } from '@entities/session/session-context';
import { useStandingsWidgetStore } from '@widgets/standings/standings.store';
import type { StandingsWidgetSettings } from '../settings-schema';

interface DriverRowProps {
  carIdx: number;
  index: number;
  /** First row of the "around the player" block — gets the separator above it. */
  startsPlayerWindow?: boolean;
}

export const DriverRow = observer(
  ({ carIdx, index, startsPlayerWindow = false }: DriverRowProps) => {
    const standingsWidget = useStandingsWidgetStore();
    const session = useSessionStore();
    const computed = useBackendComputedStore();

    const driver = standingsWidget.driverMap.get(carIdx);
    const settings = useWidgetSettings<StandingsWidgetSettings>('standings');
    const gridTemplate = buildGridTemplate(settings);

    // The gap is the row's one moving number: it is measured against the leader's
    // live entry and changes on every tick, so it is written straight to its span
    // while the rest of the row is rendered from the identity above. See
    // `docs/rendering.md`.
    const gapRef = useReactiveDomWrite<HTMLSpanElement>(
      (element, scheduleWrite) => {
        const liveDriver = computed.driverEntryOf(carIdx);

        if (!liveDriver) {
          return;
        }

        const byClass = settings.viewMode !== 'all';
        const leaderIdentity = byClass
          ? (standingsWidget.classLeaders.get(liveDriver.carClassId) ?? null)
          : standingsWidget.overallLeader;
        const liveLeader = leaderIdentity
          ? computed.driverEntryOf(leaderIdentity.carIdx)
          : null;

        const sessions = session.sessionInfo?.sessions;
        const isRaceSession =
          sessions?.[session.sessionInfo?.currentSessionNum ?? 0]
            ?.sessionType === 'Race';

        const leads =
          (byClass ? liveDriver.liveClassPosition : liveDriver.livePosition) ===
          1;

        const gapInfo = getStandingsGap(
          liveDriver,
          liveLeader,
          isRaceSession,
          leads,
          calculateLapsBehind(liveLeader, liveDriver),
          { decimals: settings.gapDecimals, signed: true }
        );

        scheduleWrite(() => {
          const isMuted = gapInfo.isLeader || gapInfo.isEmpty;

          element.classList.toggle(styles.gapLeader, isMuted);
          element.classList.toggle(styles.gapValue, !isMuted);
          element.textContent = gapInfo.value;
        });
      },
      [computed, standingsWidget, session, settings, carIdx]
    );

    // Interval: the same measure as the gap, against the car ahead in the
    // class instead of its leader. A class leader has nothing ahead.
    const intervalRef = useReactiveDomWrite<HTMLSpanElement>(
      (element, scheduleWrite) => {
        const liveDriver = computed.driverEntryOf(carIdx);
        const aheadIdx = standingsWidget.carAheadInClass.get(carIdx);
        const liveAhead =
          aheadIdx === undefined ? null : computed.driverEntryOf(aheadIdx);

        if (!liveDriver) {
          return;
        }

        const sessions = session.sessionInfo?.sessions;
        const isRaceSession =
          sessions?.[session.sessionInfo?.currentSessionNum ?? 0]
            ?.sessionType === 'Race';

        const intervalInfo = liveAhead
          ? getStandingsGap(
              liveDriver,
              liveAhead,
              isRaceSession,
              false,
              calculateLapsBehind(liveAhead, liveDriver),
              { decimals: settings.gapDecimals, signed: true }
            )
          : null;

        scheduleWrite(() => {
          element.textContent = intervalInfo?.value ?? '';
        });
      },
      [computed, standingsWidget, session, settings, carIdx]
    );

    if (!driver) {
      return null;
    }

    const isInGarage = driver.trackSurface === 'NotInWorld';

    // Latched in the backend once the car crosses the line under the checkered
    // flag, so this outlives the drive back to the garage. It outranks retirement
    // too: a driver who takes the flag and then quits the session is reported by
    // the sim with a reason-out, but what he did in the race was finish it.
    const isFinished = driver.isFinished;

    // Once the session is over everybody drops to the garage, so leaving the world
    // is no longer a status worth flagging — only a sim-confirmed retirement is.
    const isOut =
      !isFinished &&
      (driver.isRetired ||
        (isInGarage &&
          !isSessionEnded(session.session?.session_state ?? null)));

    const isPit =
      !isOut &&
      (driver.trackSurface === TRACK_SURFACE_IN_PIT_STALL || driver.onPitRoad);

    const pitState = driver.pitState;
    const flagType = parseDriverFlags(driver.rawFlags);

    // The tow truck has the car: it left the world without going through the pit
    // lane, which OUT alone would not tell apart from a garage exit.

    const isOffTrack = driver.trackSurface === TRACK_SURFACE_OFF_TRACK;

    const rowClass = [
      styles.driverRow,
      settings.rowPadding === 'narrow' ? styles.rowPaddingNarrow : '',
      settings.rowPadding === 'medium' ? styles.rowPaddingMedium : '',
      settings.rowPadding === 'wide' ? styles.rowPaddingWide : '',
      driver.isPlayer ? styles.driverRowPlayer : '',
      index % 2 !== 0 ? styles.rowOdd : '',
      isOffTrack ? styles.driverRowOffTrack : '',
      isOut ? styles.driverRowOut : '',
      startsPlayerWindow ? styles.driverRowWindowStart : '',
      standingsWidget.hoveredClassId === driver.carClassId
        ? styles.driverRowScrollTarget
        : '',
    ]
      .filter(Boolean)
      .join(' ');

    const rowFill = playerRowStyle(driver.isPlayer, settings.playerRowColor);

    // The stripe is painted by a pseudo-element, so the class color reaches it
    // through a variable — the same 3px marker the class header carries.
    const rowStyle = {
      gridTemplateColumns: gridTemplate,
      ...rowFill,
      '--row-class-marker': driver.carClassColor,
    } as CSSProperties;

    const formattedCarNumber = formatCarNumber(driver.carNumber);

    const classBest = standingsWidget.classBestLapMap.get(driver.carClassId);
    const isClassBestLap =
      driver.bestLapTime !== null &&
      classBest !== undefined &&
      driver.bestLapTime === classBest;

    const bestLap = resolveBestLapDisplay(driver);

    // Within the player's class: a car ahead reads its interval in red, one
    // behind in green; every other car keeps the plain colour.
    const playerSide = standingsWidget.sideOfPlayer.get(carIdx);
    const intervalSideClass =
      playerSide === 'ahead'
        ? styles.intervalAhead
        : playerSide === 'behind'
          ? styles.intervalBehind
          : '';

    // One switch mutes every informational column at once, so the row's accent
    // is left to the position, the name and the best lap.
    const dimClass = settings.dimSecondaryColumns ? styles.cellDimmed : '';

    return (
      <div
        className={rowClass}
        style={rowStyle}
        data-driver-row
        data-row-key={carIdx}
      >
        <PositionCell carIdx={carIdx} />

        {settings.showPosChange && (
          <div className={`${styles.cell} ${styles.cellCenter}`}>
            <PosChange carIdx={carIdx} />
          </div>
        )}

        {settings.showCarNumber && (
          <div className={`${styles.cell} ${styles.carNumberCell}`}>
            <span
              className={styles.carNumber}
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
          <div className={`${styles.cell} ${styles.cellCenter}`}>
            <CountryFlag flairId={driver.flairId} isAi={driver.isAi} />
          </div>
        )}

        <div className={`${styles.cell} ${styles.nameCell}`}>
          {settings.showDriverFlags &&
            (isFinished ? (
              <DriverFlagBadge type="checkered" />
            ) : (
              flagType !== 'none' && <DriverFlagBadge type={flagType} />
            ))}

          <span
            className={`${styles.driverName} ${driver.isPlayer ? styles.driverNamePlayer : ''}`}
          >
            {settings.abbreviateNames
              ? abbreviateName(driver.userName)
              : driver.userName}
          </span>

          {settings.showRadioMark && (
            <RadioMark carIdx={driver.carIdx} onPlayerRow={driver.isPlayer} />
          )}

          <DriverStatusBadges
            flagType={flagType}
            isOut={isOut}
            isOffTrack={isOffTrack}
            isPit={isPit}
            pitState={pitState}
            isFinished={isFinished}
            // Pit road and tows go in the pill beside the row instead.
            showPit={false}
            isTowed={false}
          />
        </div>

        {settings.showLicBadge && (
          <div className={`${styles.cell} ${styles.cellCenter}`}>
            <RatingPill
              licString={driver.licString}
              iRating={driver.iRating}
              irDelta={
                settings.useLivePositions
                  ? driver.estimatedIrDeltaLive
                  : driver.estimatedIrDeltaOfficial
              }
              showLetter={settings.showLicenseLetter}
              showIRating={settings.showIRating}
              showDelta={settings.showIrChange}
              abbreviate={settings.abbreviateIRating}
            />
          </div>
        )}

        {settings.showIRating && !settings.showLicBadge && (
          <div className={`${styles.cell} ${styles.cellRight}`}>
            <span className={`${styles.irValue} ${dimClass}`}>
              {formatIr(driver.iRating, settings.abbreviateIRating)}
            </span>
          </div>
        )}

        {settings.showIrChange && !settings.showLicBadge && (
          <div className={`${styles.cell} ${styles.cellCenter}`}>
            <IrChangeCell carIdx={carIdx} />
          </div>
        )}

        {settings.showLapsCompleted && (
          <div className={`${styles.cell} ${styles.cellCenter}`}>
            <span className={`${styles.lapsCompleted} ${dimClass}`}>
              {driver.lap}
            </span>
          </div>
        )}

        {settings.showGap && (
          <div className={`${styles.cell} ${styles.cellRight}`}>
            <span ref={gapRef} className={dimClass} />
          </div>
        )}

        {settings.showInterval && (
          <div className={`${styles.cell} ${styles.cellRight}`}>
            <span
              ref={intervalRef}
              className={`${styles.interval} ${intervalSideClass}`}
            />
          </div>
        )}

        {settings.showBestLap && (
          <div className={`${styles.cell} ${styles.cellRight}`}>
            <span
              className={`${styles.bestLap} ${isClassBestLap ? styles.bestLapFastest : ''} ${bestLap.isQualifying ? styles.bestLapQualifying : ''}`}
            >
              {formatLapTime(bestLap.time, settings.lapTimeDecimals)}
            </span>
          </div>
        )}

        {settings.showLastLap && (
          <div className={`${styles.cell} ${styles.cellRight}`}>
            <span className={`${styles.lastLap} ${dimClass}`}>
              {isPit
                ? '-'
                : formatLapTime(driver.lastLapTime, settings.lapTimeDecimals)}
            </span>
          </div>
        )}

        {settings.showAvgLap && (
          <div className={`${styles.cell} ${styles.cellRight}`}>
            <span className={`${styles.lastLap} ${dimClass}`}>
              {formatAverageLap(
                standingsWidget.lapPace.averageLap(carIdx, settings.avgLapMode),
                settings.lapTimeDecimals
              )}
            </span>
          </div>
        )}

        {settings.showStintLaps && (
          <div className={`${styles.cell} ${styles.cellCenter}`}>
            <span className={`${styles.lapsCompleted} ${dimClass}`}>
              {standingsWidget.lapPace.stintLaps(carIdx, driver.lap)}
            </span>
          </div>
        )}

        {settings.showBrand && (
          <div className={`${styles.cell} ${styles.cellCenter}`}>
            <span
              className={`${styles.brandLabel} ${dimClass}`}
              title={driver.carScreenName}
            >
              {formatBrand(driver.carScreenName)}
            </span>
          </div>
        )}

        {settings.showTire && (
          <div className={`${styles.cell} ${styles.cellCenter}`}>
            <TireBadge tire={driver.tireCompound} />
          </div>
        )}
        {settings.showPitIndicator && <PitPill carIdx={carIdx} />}
      </div>
    );
  }
);
