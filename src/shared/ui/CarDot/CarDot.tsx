import { observer } from 'mobx-react-lite';
import styles from './CarDot.module.scss';
import { CrownIcon, PlayerPointerIcon } from './MarkerIcons';
import {
  carDotRect,
  type CarDotRect,
  type CarDotShape,
} from '@shared/lib/canvas';
import { getContrastTextColor } from '@shared/lib/colors';

interface CarDotProps {
  carNumber: string;
  carClassColor: string;
  isPlayer: boolean;
  /** Base radius in SVG user units. Parent sets this based on coordinate space. */
  radius?: number;
  /** Marker outline; classes get their own shape when the map enables it. */
  shape?: CarDotShape;
  label?: string;
  labelIsPlayer?: boolean;
  playerColor?: string;
  /**
   * Rings the player's dot with a halo. For a map with room around its dots;
   * a strip that clips them to its own height leaves it off.
   */
  playerHalo?: boolean;
}

const PLAYER_RADIUS_SCALE = 1.3; // player dot is 30% larger than competitor dots
const STROKE_TO_RADIUS = 0.22; // class-color border thickness
const NUMBER_FONT_TO_RADIUS = 1.2; // car number font size inside the circle
const NUMBER_DY_TO_FONT = 0.36; // vertical nudge to visually center text (SVG dy is from baseline)
const MARKER_GAP_TO_SCALE = 7; // gap between the marker icon and the dot outline
// The dark edge outside the class ring: what keeps the ring a ring on a ground
// of its own colour — a green class on grass, a white one on a kerb.
const CASING_TO_RADIUS = 0.1;
// The player's halo: a second ring standing off the dot, the one mark on the
// map that is there to be found rather than read.
const HALO_GAP_TO_RADIUS = 0.26;
const HALO_STROKE_TO_RADIUS = 0.2;

interface DotOutlineProps {
  rect: CarDotRect | null;
  radius: number;
  /** How far outside the dot's own edge this outline runs. */
  grow: number;
  className: string;
  stroke?: string;
  strokeWidth?: number;
}

/** The dot's shape at a given distance outside its edge: a body or a ring. */
const DotOutline = observer(
  ({ rect, radius, grow, className, stroke, strokeWidth }: DotOutlineProps) => {
    if (rect === null) {
      return (
        <circle
          r={radius + grow}
          className={className}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      );
    }

    const halfSide = rect.halfSide + grow;

    return (
      <rect
        x={-halfSide}
        y={-halfSide}
        width={halfSide * 2}
        height={halfSide * 2}
        rx={rect.cornerRadius + grow}
        ry={rect.cornerRadius + grow}
        transform={`rotate(${rect.rotationDeg})`}
        className={className}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
    );
  }
);

DotOutline.displayName = 'DotOutline';

export const CarDot = observer(
  ({
    carNumber,
    carClassColor,
    isPlayer,
    radius = 10,
    shape = 'circle',
    label,
    playerColor = '#18181b',
    playerHalo = false,
  }: CarDotProps) => {
    const showHalo = isPlayer && playerHalo;
    const r = isPlayer ? radius * PLAYER_RADIUS_SCALE : radius;
    const fontSize = radius * NUMBER_FONT_TO_RADIUS;
    const scale = radius / 10;
    const rect = carDotRect(shape, r);
    const ringWidth = radius * STROKE_TO_RADIUS;
    const casingGrow = ringWidth / 2 + radius * CASING_TO_RADIUS;
    const haloGrow = casingGrow + radius * HALO_GAP_TO_RADIUS;
    const haloWidth = radius * HALO_STROKE_TO_RADIUS;
    // The diamond's corner, not its edge, is what the marker has to clear.
    const outerRadius = rect
      ? rect.halfSide * (rect.rotationDeg === 0 ? 1 : Math.SQRT2)
      : r;
    const markerClearance = showHalo ? haloGrow + haloWidth / 2 : casingGrow;
    const markerY =
      -outerRadius - markerClearance - MARKER_GAP_TO_SCALE * scale;

    const bg = isPlayer ? playerColor : undefined;
    const textColor = bg ? getContrastTextColor(bg) : undefined;

    return (
      <g
        style={{
          ['--car-dot-bg' as string]: bg,
          ['--car-dot-text' as string]: textColor,
        }}
      >
        {showHalo && (
          <DotOutline
            rect={rect}
            radius={r}
            grow={haloGrow}
            className={styles.playerHalo}
            strokeWidth={haloWidth}
          />
        )}

        <DotOutline
          rect={rect}
          radius={r}
          grow={casingGrow}
          className={styles.carCasing}
        />

        <DotOutline
          rect={rect}
          radius={r}
          grow={0}
          className={styles.carCircle}
          stroke={carClassColor}
          strokeWidth={ringWidth}
        />

        <text
          textAnchor="middle"
          dy={`${NUMBER_DY_TO_FONT}em`}
          style={{ fontSize: `calc(${fontSize}px * var(--font-scale, 1))` }}
          className={styles.carNumber}
        >
          {carNumber}
        </text>

        {label === 'YOU' && (
          <g transform={`translate(0, ${markerY})`}>
            <PlayerPointerIcon scale={scale} />
          </g>
        )}

        {label === 'P1' && (
          <g transform={`translate(0, ${markerY})`}>
            <CrownIcon scale={scale} color={carClassColor} />
          </g>
        )}
      </g>
    );
  }
);

CarDot.displayName = 'CarDot';
