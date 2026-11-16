import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';

import { WidgetPanel } from '@shared/ui/WidgetPanel/WidgetPanel';
import { NoDataPlaceholder } from '@shared/ui/NoDataPlaceholder/NoDataPlaceholder';
import { useReactiveDomWrite } from '@shared/hooks/useReactiveDomWrite';
import { useWidgetSettings } from '@entities/layout/useWidgetSettings';
import { useSessionStore } from '@entities/session/session-context';
import { useSimStore } from '@entities/sim/sim-context';

import {
  formatClock,
  formatDeltaSeconds,
  toneOfDelta,
  visibleRowStart,
  type SectorRow,
  type SectorTone,
} from './delta-sectors-model';
import {
  useDeltaSectorsWidgetStore,
  type LapFigure,
} from './delta-sectors.store';
import styles from './DeltaSectorsWidget.module.scss';
import type { DeltaSectorsSettings } from './settings-schema';

const PROGRESS_PROPERTY = '--sector-progress';

const TONE_CLASS: Record<SectorTone, string> = {
  faster: styles.toneFaster,
  slower: styles.toneSlower,
  neutral: styles.toneNeutral,
};

const STATE_CLASS: Record<SectorRow['state'], string> = {
  done: styles.rowDone,
  current: styles.rowCurrent,
  ahead: styles.rowAhead,
};

const ALL_TONES = Object.values(TONE_CLASS);
const ALL_STATES = Object.values(STATE_CLASS);

const setText = (root: Element, className: string, text: string): void => {
  const node = root.getElementsByClassName(className)[0];

  if (node && node.textContent !== text) {
    node.textContent = text;
  }
};

const setTone = (node: Element | undefined, tone: SectorTone): void => {
  if (!node) {
    return;
  }

  node.classList.remove(...ALL_TONES);
  node.classList.add(TONE_CLASS[tone]);
};

/** One sector row, written straight to its element. */
const applyRow = (element: Element, row: SectorRow): void => {
  if (!(element instanceof HTMLElement)) {
    return;
  }

  element.classList.remove(...ALL_STATES);
  element.classList.add(STATE_CLASS[row.state]);
  element.style.setProperty(PROGRESS_PROPERTY, row.progress.toFixed(4));

  // The plate takes the banked sector's verdict; the running one has none
  // yet, and its delta is coloured on its own.
  setTone(element.getElementsByClassName(styles.plate)[0], row.tone);
  setTone(element, row.state === 'current' ? toneOfDelta(row.delta) : row.tone);

  setText(element, styles.plate, `S${row.sectorIndex + 1}`);
  setText(element, styles.time, formatClock(row.time));
  setText(element, styles.delta, formatDeltaSeconds(row.delta));
};

/** The cells of the lap card, found by what they hold rather than by a style. */
const LAP_CELL_ATTRIBUTE = 'data-lap';

type LapCellName = 'best' | 'last' | 'reference';

const lapCellOf = (card: Element, name: LapCellName): Element | null =>
  card.querySelector(`[${LAP_CELL_ATTRIBUTE}="${name}"]`);

const applyFigure = (
  card: Element,
  name: LapCellName,
  figure: LapFigure
): void => {
  const cell = lapCellOf(card, name);

  if (!cell) {
    return;
  }

  setText(cell, styles.lapTime, formatClock(figure.time));
  setText(cell, styles.lapGap, formatDeltaSeconds(figure.delta));
  setTone(cell, toneOfDelta(figure.delta));
};

/**
 * The lap sector by sector against the reference lap, and under it the best,
 * the last and the reference lap side by side.
 *
 * The running sector's time, its bar and its delta move with the lap, so the
 * rows are markup React writes once per layout and one pass per animation
 * frame fills (`docs/rendering.md`).
 */
export const DeltaSectorsWidget = observer(() => {
  const { t } = useTranslation('widgets');
  const { sessionInfo } = useSessionStore();
  const sim = useSimStore();
  const deltaSectors = useDeltaSectorsWidgetStore();
  const { visibleSectors, showLapCard, smoothMotion } =
    useWidgetSettings<DeltaSectorsSettings>('delta-sectors');

  const sectorCount = deltaSectors.spans.length;
  const rowCount = Math.min(visibleSectors, sectorCount);
  const hasReference = deltaSectors.hasReference;

  const rootRef = useReactiveDomWrite<HTMLDivElement>(
    (element, scheduleWrite) => {
      const rows = deltaSectors.rows;
      const start = visibleRowStart(
        rows.length,
        deltaSectors.currentSectorIdx,
        rowCount
      );
      const shown = rows.slice(start, start + rowCount);
      const lapCard = deltaSectors.lapCard;

      scheduleWrite(() => {
        const rowElements = element.getElementsByClassName(styles.row);

        for (const [rowIndex, row] of shown.entries()) {
          const rowElement = rowElements[rowIndex];

          if (rowElement) {
            applyRow(rowElement, row);
          }
        }

        const card = element.getElementsByClassName(styles.lapCard)[0];

        if (card) {
          applyFigure(card, 'best', lapCard.best);
          applyFigure(card, 'last', lapCard.last);

          const referenceCell = lapCellOf(card, 'reference');

          if (referenceCell) {
            setText(
              referenceCell,
              styles.lapTime,
              formatClock(lapCard.reference)
            );
          }
        }
      });
    },
    [deltaSectors, rowCount, showLapCard]
  );

  if (!sim.isConnected || sessionInfo == null || sectorCount === 0) {
    return (
      <WidgetPanel direction="column" gap={0} minWidth={0}>
        <div className={styles.empty}>
          <NoDataPlaceholder />
        </div>
      </WidgetPanel>
    );
  }

  return (
    <WidgetPanel direction="column" gap={0} minWidth={0} fitHeight>
      <div
        ref={rootRef}
        className={`${styles.root} ${smoothMotion ? styles.smooth : ''}`}
      >
        <div className={styles.sectors}>
          <div className={styles.header}>
            <span className={styles.title}>
              {t('settingsPanels.deltaSectors.title')}
            </span>

            <span className={styles.versus}>
              {t(
                hasReference
                  ? 'settingsPanels.deltaSectors.versusReference'
                  : 'settingsPanels.deltaSectors.noReference'
              )}
            </span>
          </div>

          {Array.from({ length: rowCount }, (_unused, rowIndex) => (
            <div key={rowIndex} className={styles.row}>
              <span className={styles.plate} />
              <span className={styles.time} />
              <span className={styles.delta} />
            </div>
          ))}
        </div>

        {showLapCard ? (
          <div className={styles.lapCard}>
            <div className={styles.lapCell} data-lap="best">
              <span className={styles.lapLabel}>
                {t('settingsPanels.deltaSectors.best')}
              </span>
              <span className={styles.lapTime} />
              <span className={styles.lapGap} />
            </div>

            <div className={styles.lapCell} data-lap="last">
              <span className={styles.lapLabel}>
                {t('settingsPanels.deltaSectors.last')}
              </span>
              <span className={styles.lapTime} />
              <span className={styles.lapGap} />
            </div>

            <div className={styles.lapCell} data-lap="reference">
              <span className={styles.lapLabel}>
                {t('settingsPanels.deltaSectors.reference')}
              </span>
              <span className={styles.lapTime} />
              <span className={styles.referenceMark}>
                {t('settingsPanels.deltaSectors.referenceMark')}
              </span>
            </div>
          </div>
        ) : null}
      </div>
    </WidgetPanel>
  );
});
