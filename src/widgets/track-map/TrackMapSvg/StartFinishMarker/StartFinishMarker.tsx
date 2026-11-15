import { observer } from 'mobx-react-lite';
import styles from './StartFinishMarker.module.scss';

interface StartFinishMarkerProps {
  x: number;
  y: number;
  angle: number;
  trackCenterX: number;
  trackCenterY: number;
  /** The drawn width of the track, in the map's own units. */
  trackWidth: number;
  /** Map units per screen pixel: the marker is drawn in pixels at this scale. */
  scale?: number;
}

/** How far out of the track the flag tile stands, in screen pixels. */
const CALLOUT_LENGTH = 22;
/** How far the finish line overhangs each edge of the track. */
const LINE_OVERHANG = 3;

const TILE_CELLS = 3;
const TILE_CELL_SIZE = 6;
const TILE_SIZE = TILE_CELLS * TILE_CELL_SIZE;
const TILE_CORNER = 3;
const TILE_CLIP_ID = 'start-finish-tile-clip';

const TILE_CELL_INDEXES = Array.from(
  { length: TILE_CELLS * TILE_CELLS },
  (_unused, cellIndex) => cellIndex
);

export const StartFinishMarker = observer(
  ({
    x,
    y,
    angle,
    trackCenterX,
    trackCenterY,
    trackWidth,
    scale = 1,
  }: StartFinishMarkerProps) => {
    // The marker's own Y axis, across the track, in the map's coordinates.
    const rad = (angle * Math.PI) / 180;
    const acrossX = -Math.sin(rad);
    const acrossY = Math.cos(rad);

    // Of the two ways across the track, the one that leads away from the
    // circuit's centre of mass is the outside of the loop — the tile goes
    // there, clear of the infield.
    const distanceTowards = (direction: 1 | -1): number =>
      Math.hypot(
        x + acrossX * direction - trackCenterX,
        y + acrossY * direction - trackCenterY
      );
    const outward = distanceTowards(1) > distanceTowards(-1) ? 1 : -1;

    const halfLine = trackWidth / scale / 2 + LINE_OVERHANG;
    const tileOffset = outward * (halfLine + CALLOUT_LENGTH);

    return (
      <g transform={`translate(${x},${y}) rotate(${angle}) scale(${scale})`}>
        <line
          x1="0"
          y1={outward * halfLine}
          x2="0"
          y2={tileOffset}
          className={styles.callout}
        />

        {/* The line itself, painted across the track as it is on the asphalt. */}
        <line
          x1="0"
          y1={-halfLine}
          x2="0"
          y2={halfLine}
          className={styles.finishLineCasing}
        />
        <line
          x1="0"
          y1={-halfLine}
          x2="0"
          y2={halfLine}
          className={styles.finishLine}
        />

        <g transform={`translate(0, ${tileOffset})`}>
          {/* The map's own rotation is undone from a variable the draw reaction
              writes, so heading-up mode keeps the tile upright without a render. */}
          <g className={styles.screenUpright}>
            <g transform={`rotate(${-angle})`}>
              <clipPath id={TILE_CLIP_ID}>
                <rect
                  x={-TILE_SIZE / 2}
                  y={-TILE_SIZE / 2}
                  width={TILE_SIZE}
                  height={TILE_SIZE}
                  rx={TILE_CORNER}
                />
              </clipPath>

              <g clipPath={`url(#${TILE_CLIP_ID})`}>
                {TILE_CELL_INDEXES.map((cellIndex) => (
                  <rect
                    key={cellIndex}
                    x={
                      -TILE_SIZE / 2 + (cellIndex % TILE_CELLS) * TILE_CELL_SIZE
                    }
                    y={
                      -TILE_SIZE / 2 +
                      Math.floor(cellIndex / TILE_CELLS) * TILE_CELL_SIZE
                    }
                    width={TILE_CELL_SIZE}
                    height={TILE_CELL_SIZE}
                    className={
                      cellIndex % 2 === 0 ? styles.tileLight : styles.tileDark
                    }
                  />
                ))}
              </g>

              <rect
                x={-TILE_SIZE / 2}
                y={-TILE_SIZE / 2}
                width={TILE_SIZE}
                height={TILE_SIZE}
                rx={TILE_CORNER}
                className={styles.tileCasing}
              />
            </g>
          </g>
        </g>
      </g>
    );
  }
);
