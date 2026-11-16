import { useEffect, useRef, type RefObject } from 'react';
import { fillAt, type ContourAnchor } from './contour-motion';
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

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Draws the countdown line at the display's rate while the count runs, from
 * the last cue frame and the time since it arrived (`contour-motion.ts`).
 * React still writes each frame's own length; between frames this writes the
 * predicted one straight to the element.
 */
const useSmoothContour = (
  frame: BrakeCueFrame | null,
  running: boolean
): RefObject<SVGRectElement | null> => {
  const lineRef = useRef<SVGRectElement | null>(null);
  const anchorRef = useRef<ContourAnchor | null>(null);
  const shownRef = useRef(0);

  useEffect(() => {
    if (!frame || frame.untilBrake === null) {
      anchorRef.current = null;

      return;
    }

    anchorRef.current = {
      fill: Math.max(frame.fill, running ? shownRef.current : 0),
      untilBrake: frame.untilBrake,
      receivedAtMs: performance.now(),
    };
  }, [frame, running]);

  useEffect(() => {
    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia(REDUCED_MOTION_QUERY).matches;

    if (!running || reduced) {
      shownRef.current = 0;

      return;
    }

    let rafId = 0;

    const step = (now: number) => {
      const anchor = anchorRef.current;
      const line = lineRef.current;

      if (anchor && line) {
        const fill = Math.max(shownRef.current, fillAt(anchor, now));

        shownRef.current = fill;
        line.style.strokeDasharray = `${unit(fill)} 1`;
      }

      rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);

    return () => cancelAnimationFrame(rafId);
  }, [running]);

  return lineRef;
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
  const smoothCountdown = settings.smoothMotion && frame?.mode === 'countdown';
  const contourLineRef = useSmoothContour(frame, smoothCountdown);
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
        <div className={`${styles.plate} ${PLATE_STAGE_CLASS[stage]}`}>
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
              ref={contourLineRef}
              className={styles.contourLine}
              pathLength={1}
              // While the count runs smoothly the line is drawn per display
              // frame; a frame's own, slightly older length written here
              // would pull it back for a frame.
              style={
                smoothCountdown
                  ? undefined
                  : { strokeDasharray: `${unit(frame.fill)} 1` }
              }
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
