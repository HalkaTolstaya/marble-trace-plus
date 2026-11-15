import { useWidgetSettings } from '@entities/layout/useWidgetSettings';
import { useMemo } from 'react';
import { observer } from 'mobx-react-lite';

import { useVisibleRowCount } from '@shared/hooks/useVisibleRowCount';
import { DriverRow } from '@widgets/relative/DriverRow/DriverRow';
import { PaceCarRow } from '@widgets/relative/PaceCarRow/PaceCarRow';
import { NoDataPlaceholder } from '@shared/ui/NoDataPlaceholder/NoDataPlaceholder';
import { useBackendComputedStore } from '@entities/cars/computed-context';
import { useSimStore } from '@entities/sim/sim-context';
import { useRelativeWidgetStore } from '@widgets/relative/relative.store';
import { windowAroundPlayer } from '@widgets/relative/relative-utils';
import {
  RelativeColumnHeaders,
  RelativeFooter,
  RelativeHeader,
} from '@widgets/relative/RelativeStrips/RelativeStrips';

import styles from './RelativeContent.module.scss';
import type { RelativeWidgetSettings } from '../settings-schema';

const WIDE_ROW_HEIGHT = 3.5;
const MEDIUM_ROW_HEIGHT = 3.25;
const NARROW_ROW_HEIGHT = 2.75;
const MIN_VISIBLE_ROWS = 3;

/**
 * The strip around the player. The order comes from the widget store as a list
 * of car indices compared by content, so a burst that moves every car without
 * changing who is where re-renders nothing here — each row reads its own driver
 * and writes its own gap. See `docs/rendering.md`.
 */
export const RelativeContent = observer(() => {
  const computed = useBackendComputedStore();
  const relativeWidget = useRelativeWidgetStore();
  const sim = useSimStore();

  const { rowPadding, driversAhead, driversBehind } =
    useWidgetSettings<RelativeWidgetSettings>('relative');

  const rows = relativeWidget.rowOrder;

  const playerCarIdx = computed.relativeIdentities.find(
    (identity) => identity.isPlayer
  )?.carIdx;

  const { ref: driverListRef, count: visibleRowCount } =
    useVisibleRowCount<HTMLDivElement>(
      rowPadding === 'wide'
        ? WIDE_ROW_HEIGHT
        : rowPadding === 'medium'
          ? MEDIUM_ROW_HEIGHT
          : NARROW_ROW_HEIGHT,
      MIN_VISIBLE_ROWS,
      '[data-relative-row]'
    );

  // The cars the settings ask for, each side clipped to the ones there are,
  // and never more than the widget height holds.
  const displayRows = useMemo(() => {
    const playerIdx = rows.findIndex((row) => row.carIdx === playerCarIdx);
    const window = windowAroundPlayer(
      rows,
      playerIdx,
      driversAhead,
      driversBehind
    );

    if (window.length <= visibleRowCount || playerIdx === -1) {
      return window;
    }

    // Too short for the window: the side the player has more of gives way.
    const playerInWindow = window.findIndex(
      (row) => row.carIdx === playerCarIdx
    );
    const half = Math.floor((visibleRowCount - 1) / 2);
    const start = Math.max(
      0,
      Math.min(playerInWindow - half, window.length - visibleRowCount)
    );

    return window.slice(start, start + visibleRowCount);
  }, [rows, playerCarIdx, visibleRowCount, driversAhead, driversBehind]);

  const hasData = sim.isConnected && rows.length > 0;

  if (!hasData) {
    return <NoDataPlaceholder />;
  }

  return (
    <>
      <RelativeHeader />
      <RelativeColumnHeaders />
      <div ref={driverListRef} className={styles.driverList}>
        {displayRows.map((row, index) =>
          row.isPaceCar ? (
            <PaceCarRow key={row.carIdx} carIdx={row.carIdx} index={index} />
          ) : (
            <DriverRow key={row.carIdx} carIdx={row.carIdx} index={index} />
          )
        )}
      </div>
      <RelativeFooter />
    </>
  );
});
