import { observer } from 'mobx-react-lite';

import styles from './CarDot.module.scss';

interface MarkerIconProps {
  scale: number;
}

interface CrownIconProps extends MarkerIconProps {
  color: string;
}

/** "This one is you": a pointer standing over the dot, its tip towards it. */
export const PlayerPointerIcon = observer(({ scale }: MarkerIconProps) => {
  return (
    <g transform={`scale(${scale})`}>
      <path d="M -6.5,-8 L 6.5,-8 L 0,1 Z" className={styles.pointer} />
    </g>
  );
});

PlayerPointerIcon.displayName = 'PlayerPointerIcon';

/** The class leader's crown, in the class colour. */
export const CrownIcon = observer(({ scale, color }: CrownIconProps) => {
  return (
    <g transform={`scale(${scale})`}>
      <polygon
        points="-7,2 -8.5,-8 -3.5,-3.5 0,-10 3.5,-3.5 8.5,-8 7,2"
        fill={color}
        className={styles.crown}
      />
    </g>
  );
});

CrownIcon.displayName = 'CrownIcon';
