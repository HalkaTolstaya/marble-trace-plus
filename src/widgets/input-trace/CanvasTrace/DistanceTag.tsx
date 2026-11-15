import { observer } from 'mobx-react-lite';

import { useReactiveDomWrite } from '@shared/hooks/useReactiveDomWrite';
import { useCarsStore } from '@entities/cars/cars-context';
import { useSessionStore } from '@entities/session/session-context';

import styles from './CanvasTrace.module.scss';

/** Where on the lap the player is, in metres — the comparison's x axis. */
export const DistanceTag = observer(() => {
  const cars = useCarsStore();
  const session = useSessionStore();

  const tagRef = useReactiveDomWrite<HTMLSpanElement>(
    (element, scheduleWrite) => {
      const info = session.sessionInfo;
      // oxlint-disable-next-line no-restricted-properties
      const positions = cars.carPositions?.car_idx_lap_dist_pct;
      const pct = info && positions ? positions[info.playerCarIdx] : undefined;
      const metres =
        pct !== undefined && pct >= 0 && info?.trackLengthM
          ? Math.round(pct * info.trackLengthM)
          : null;

      scheduleWrite(() => {
        element.textContent = metres === null ? '' : `${metres} m`;
      });
    },
    [cars, session]
  );

  return <span ref={tagRef} className={styles.distanceTag} />;
});
