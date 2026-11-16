import { useRef, type ReactNode } from 'react';
import { observer } from 'mobx-react-lite';

import { useReactiveDomWrite } from '@shared/hooks/useReactiveDomWrite';
import { usePlayerStore } from '@entities/player/player-context';

import { unwrapAngle } from '../unwrap-angle';
import styles from './RotatingRing.module.scss';

const RADIANS_TO_DEGREES = 180 / Math.PI;

/**
 * The custom property the whole compass turns on. The group rotates by it and
 * the cardinal labels counter-rotate by it, so one write turns the ring and
 * keeps the letters upright.
 */
const COMPASS_YAW_PROPERTY = '--compass-yaw';

interface RotatingRingProps {
  /**
   * The ring's geometry, created by a parent that does not re-render — nothing
   * inside it changes with the heading.
   */
  children: ReactNode;
  /** Ease to each heading instead of stepping to it. */
  smooth: boolean;
}

/**
 * Turns the compass with the car's heading, a hot field that changes on every
 * physics tick. The rotation goes to the DOM through the reactive-DOM primitive,
 * so the heading wakes React not at all: this component renders once, and its
 * children are the same element objects for as long as it is mounted.
 */
export const RotatingRing = observer(
  ({ children, smooth }: RotatingRingProps) => {
    const player = usePlayerStore();
    // The last angle written, unwrapped: the next one is taken within half a
    // turn of it, so an eased ring never swings round through the whole circle.
    const writtenYawRef = useRef<number | null>(null);

    const groupRef = useReactiveDomWrite<SVGGElement>(
      (element, scheduleWrite) => {
        // oxlint-disable-next-line no-restricted-properties
        const carYawDeg = (player.carDynamics?.yaw ?? 0) * RADIANS_TO_DEGREES;

        scheduleWrite(() => {
          const yaw = unwrapAngle(writtenYawRef.current, -carYawDeg);

          writtenYawRef.current = yaw;
          element.style.setProperty(COMPASS_YAW_PROPERTY, `${yaw}deg`);
        });
      },
      [player]
    );

    return (
      <g
        ref={groupRef}
        className={`${styles.rotatingGroup} ${smooth ? styles.smooth : ''}`}
        pointerEvents="none"
      >
        {children}
      </g>
    );
  }
);
