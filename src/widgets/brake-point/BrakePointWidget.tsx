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
  barLabel,
  formatMetres,
  formatSeconds,
  percent,
} from './brake-point-format';
import type { BrakePointSettings } from './settings-schema';

const toneClass = (tone: string): string => styles[`tone-${tone}`] ?? '';

const ratio = (value: number): string =>
  `${Math.min(Math.max(value, 0), 1) * 100}%`;

const MESSAGE_KEYS: Partial<Record<BrakeCueFrame['mode'], string>> = {
  noReference: 'noReference',
  noZones: 'noZones',
  noCar: 'noCar',
};

/**
 * The brake-point countdown (ADR-0014). The state machine runs on the
 * telemetry thread; this only draws the frame it last sent.
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

  return (
    <WidgetPanel direction="column" className={styles.root}>
      <div className={styles.header}>
        <span>
          {t('settingsPanels.brakePoint.zone')}{' '}
          <FixedDigits text={`${frame.zoneNo}/${frame.zoneCount}`} />
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

      <div className={styles.body}>
        <div
          className={`${styles.bar} ${frame.mode === 'brake' ? styles.barBrake : ''}`}
        >
          <div className={styles.join} style={{ width: ratio(frame.join) }} />
          <div className={styles.fill} style={{ width: ratio(frame.fill) }} />
          {frame.flash ? (
            <div
              className={`${styles.flash} ${toneClass(GRADE_TONE[frame.flash.grade])}`}
              style={{ opacity: frame.flash.alpha * 0.85 }}
            />
          ) : null}
          <div className={styles.label}>
            <FixedDigits text={barLabel(frame)} />
          </div>
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
