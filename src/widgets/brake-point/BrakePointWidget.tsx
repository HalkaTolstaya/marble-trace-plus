import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';

import { WidgetPanel } from '@shared/ui/WidgetPanel/WidgetPanel';
import { FixedDigits } from '@shared/ui/FixedDigits/FixedDigits';
import { useWidgetSettings } from '@entities/layout/useWidgetSettings';
import type { BrakeCueFrame } from '@shared/contracts/reflaps';
import styles from './BrakePointWidget.module.scss';
import { useBrakePointWidgetStore } from './brake-point.store';
import {
  GRADE_ARROWS,
  GRADE_KEY,
  GRADE_TONE,
  formatMetres,
  formatSeconds,
  percent,
  plateLabel,
  plateStageOf,
  type PlateStage,
} from './brake-point-format';
import type { BrakePointSettings } from './settings-schema';

const toneClass = (tone: string): string => styles[`tone-${tone}`] ?? '';

const unit = (value: number): number => Math.min(Math.max(value, 0), 1);

const ratio = (value: number): string => `${unit(value) * 100}%`;

const PLATE_STAGE_CLASS: Record<PlateStage, string> = {
  idle: styles.plateIdle,
  count3: styles.plateCount,
  count2: styles.plateCount,
  count1: styles.plateCount,
  brake: styles.plateBrake,
};

const MESSAGE_KEYS: Partial<Record<BrakeCueFrame['mode'], string>> = {
  noReference: 'noReference',
  noZones: 'noZones',
  noCar: 'noCar',
};

/**
 * The brake-point countdown (ADR-0014). The state machine runs on the
 * telemetry thread; this only draws the frame it last sent.
 *
 * One plate, read out of the corner of the eye: a figure in the middle, a red
 * line running round its edge as the brake point comes up, and the whole
 * plate red on BRAKE. Everything else is an optional row above or below it.
 */
export const BrakePointWidget = observer(() => {
  const { t } = useTranslation('widgets');
  const { frame } = useBrakePointWidgetStore();
  const settings = useWidgetSettings<BrakePointSettings>('brake-point');
  const messageKey = frame ? MESSAGE_KEYS[frame.mode] : 'noReference';

  if (!frame || messageKey) {
    return (
      <WidgetPanel direction="column" className={styles.root}>
        <div className={styles.message}>
          {t(
            `settingsPanels.brakePoint.messages.${messageKey ?? 'noReference'}`
          )}
        </div>
      </WidgetPanel>
    );
  }

  const verdict = frame.verdict;
  const target = frame.target ?? 0;
  const gaugeValue = frame.peak ?? frame.live;
  const stage = plateStageOf(frame);
  const showHeader = settings.showPips || settings.showTarget;
  // By metres the figure changes with every reading, so only the step into the
  // count and into BRAKE is an arrival; by counts each count is one.
  const arrivalKey =
    settings.layout === 'meters' && stage !== 'brake' && stage !== 'idle'
      ? 'count'
      : stage;

  return (
    <WidgetPanel direction="column" className={styles.root}>
      {showHeader ? (
        <div className={styles.header}>
          <span className={styles.zone}>
            {t('settingsPanels.brakePoint.zone')}{' '}
            <span className={styles.zoneValue}>
              <FixedDigits text={`${frame.zoneNo}/${frame.zoneCount}`} />
            </span>
          </span>

          {settings.showPips ? (
            <div className={styles.pips}>
              {frame.pips.map((pip, index) => (
                <span
                  key={index}
                  className={[
                    styles.pip,
                    pip.grade ? toneClass(GRADE_TONE[pip.grade]) : '',
                    pip.stale ? styles.pipStale : '',
                    pip.current ? styles.pipCurrent : '',
                  ].join(' ')}
                />
              ))}
            </div>
          ) : null}

          {settings.showTarget ? (
            <span className={styles.targetValue}>
              {t('settingsPanels.brakePoint.target')}{' '}
              <FixedDigits text={percent(frame.target)} />%
            </span>
          ) : null}
        </div>
      ) : null}

      <div className={styles.body}>
        <div
          className={`${styles.plate} ${PLATE_STAGE_CLASS[stage]} ${settings.smoothMotion ? styles.plateSmooth : ''}`}
        >
          {/* The count's progress, drawn round the plate's own edge: the line
              starts at the top left corner and has gone all the way round by
              the brake point. Its length moves with the telemetry. */}
          <svg className={styles.contour} aria-hidden="true">
            <rect
              className={styles.contourJoin}
              pathLength={1}
              style={{ strokeDasharray: `${unit(frame.join)} 1` }}
            />
            <rect
              className={styles.contourLine}
              pathLength={1}
              style={{ strokeDasharray: `${unit(frame.fill)} 1` }}
            />
          </svg>

          {/* Keyed by what it reads, so each count and BRAKE itself is a new
              element: its arrival runs once, on that change of state. */}
          <div key={arrivalKey} className={styles.label}>
            <FixedDigits text={plateLabel(frame, settings.layout)} />
          </div>

          {stage === 'brake' ? <div className={styles.strike} /> : null}

          {/* The grade takes the whole plate for a moment, word and colour
              together, and fades as one at the rate the backend sets. */}
          {frame.flash ? (
            <div
              className={`${styles.flash} ${toneClass(GRADE_TONE[frame.flash.grade])}`}
              style={{ opacity: frame.flash.alpha }}
            >
              <span key={frame.flash.grade} className={styles.flashLabel}>
                {GRADE_ARROWS[frame.flash.grade]}{' '}
                {t(
                  `settingsPanels.brakePoint.grades.${GRADE_KEY[frame.flash.grade]}`
                )}
              </span>
            </div>
          ) : null}
        </div>

        {settings.showTarget ? (
          <div className={styles.target}>
            <div
              className={styles.gauge}
              style={{ height: ratio(gaugeValue) }}
            />
            <div
              className={styles.targetLine}
              style={{ bottom: ratio(target) }}
            />
          </div>
        ) : null}
      </div>

      {settings.showTiming ? (
        <div className={styles.timing}>
          {verdict ? (
            <>
              <span className={styles.muted}>
                {t('settingsPanels.brakePoint.zone')} {verdict.zoneNo}
              </span>
              <span
                className={`${styles.grade} ${toneClass(GRADE_TONE[verdict.grade])}`}
              >
                {GRADE_ARROWS[verdict.grade]}{' '}
                {t(
                  `settingsPanels.brakePoint.grades.${GRADE_KEY[verdict.grade]}`
                )}
              </span>
              <FixedDigits text={formatSeconds(verdict.dt)} />
              <span className={styles.muted}>
                <FixedDigits text={formatMetres(verdict.dm)} />
              </span>
              {verdict.peak !== null ? (
                <span className={styles.muted}>
                  <FixedDigits text={percent(verdict.peak)} />/
                  <FixedDigits text={percent(verdict.target)} />%
                </span>
              ) : null}
            </>
          ) : (
            <span className={styles.muted}>
              {t('settingsPanels.brakePoint.waiting')}
            </span>
          )}
        </div>
      ) : null}
    </WidgetPanel>
  );
});
