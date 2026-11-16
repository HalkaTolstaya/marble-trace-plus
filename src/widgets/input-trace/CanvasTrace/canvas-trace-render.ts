import type { ReferenceLapSample } from '@shared/contracts/generated/bindings';
import { WIDGET_CANVAS_FONT_FAMILY } from '@shared/lib/canvas';
import { normalizedSteering } from '@shared/lib/car-signals';
import { referencePedalsAt } from '../reference-pedals';
import {
  isSteeringTraceShown,
  type InputTraceSettings,
} from '../settings-schema';

// Circular sample buffers shared by the ingest and paint passes. Channel
// samples are interleaved: buffer[sampleIndex * channelCount + channelIndex].
export interface TraceBufferState {
  buffer: Float32Array;
  absBuffer: Uint8Array;
  steerBuffer: Float32Array;
  slideBuffer: Uint8Array;
  /** Reference throttle and brake per sample, interleaved; NaN where none. */
  refBuffer: Float32Array;
  /** Where on the lap each sample was taken, 0-1; NaN where unknown. */
  pctBuffer: Float32Array;
  /** Each sample's x on the plot for the frame being painted; NaN = not drawn. */
  xScratch: Float32Array;
  head: number;
  count: number;
}

export const createTraceBufferState = (): TraceBufferState => ({
  buffer: new Float32Array(0),
  absBuffer: new Uint8Array(0),
  steerBuffer: new Float32Array(0),
  slideBuffer: new Uint8Array(0),
  refBuffer: new Float32Array(0),
  pctBuffer: new Float32Array(0),
  xScratch: new Float32Array(0),
  head: 0,
  count: 0,
});

/**
 * What the distance axis needs beyond the buffers: where the car is now, how
 * long the lap is, and the reference lap itself — so the stretch of track
 * still ahead can be drawn before the car gets there.
 */
export interface DistanceFrame {
  nowPct: number;
  trackLengthM: number;
  referenceSamples: readonly ReferenceLapSample[] | null;
}

/** What a frame is painted from, besides the buffers and the settings. */
export interface TraceScene {
  /**
   * Smooth motion (ADR-0017): how many sample columns the time plot still has
   * to travel to its newest position. Drawn shifted right by this much, it
   * glides left between ticks instead of jumping a tick's worth at once.
   */
  timeLagSamples?: number;
  /** A reference lap is loaded: the buffers carry its pedals. */
  referenceLoaded: boolean;
  /** The car's place on a lap of known length; null off track or without one. */
  distance: DistanceFrame | null;
}

export const EMPTY_TRACE_SCENE: TraceScene = {
  referenceLoaded: false,
  distance: null,
};

const SAMPLES_PER_SECOND = 60;

/**
 * Against lap distance the plot shows metres, not seconds, so the history it
 * needs depends on the car's speed. This much covers the window behind the car
 * down to a crawl; older samples fall off the left edge unseen.
 */
const DISTANCE_HISTORY_SECONDS = 40;

/** Pedal levels the grid is ruled at, and the one drawn a shade stronger. */
const GRID_LEVELS = [0.25, 0.5, 0.75];
const GRID_MID_LEVEL = 0.5;
const GRID_LINE_COLOR = 'rgba(250, 250, 250, 0.07)';
const GRID_MID_LINE_COLOR = 'rgba(250, 250, 250, 0.13)';
const GRID_LINE_WIDTH_PX = 1;

/** The soft fall of colour under a live line, when no reference fills the plot. */
const UNDERFILL_TOP_ALPHA = 0.2;
const UNDERFILL_BOTTOM_ALPHA = 0;

/** A reference hill is densest at its crest and thins towards the baseline. */
const REFERENCE_BASE_SHARE = 0.45;
/** Its crest line against its fill, so the hill keeps an edge at any opacity. */
const REFERENCE_EDGE_GAIN = 1.9;
const REFERENCE_EDGE_WIDTH_PX = 1;
/** Step between reference points along the distance axis, in px. */
const REFERENCE_STEP_PX = 2;

/** The marker on the newest sample: a solid dot in a ring of its own colour. */
const HEAD_DOT_TO_LINE = 0.95;
const HEAD_HALO_TO_LINE = 2.3;
const HEAD_HALO_ALPHA = 0.3;
const HEAD_DOT_MIN_PX = 2;

/** Where "now" stands on the distance axis: the rest of the plot is ahead. */
const NOW_SHARE = 0.68;
const NOW_LINE_COLOR = 'rgba(250, 250, 250, 0.75)';
const NOW_LINE_WIDTH_PX = 1.5;

/** Axis lettering, as shares of the canvas height, with a legible floor. */
const AXIS_FONT_SHARE = 0.1;
const AXIS_FONT_MIN_PX = 8;
const AXIS_FONT_MAX_PX = 12;
const AXIS_FONT_WEIGHT = 700;
const AXIS_LABEL_COLOR = 'rgba(250, 250, 250, 0.62)';
const AXIS_TICK_COLOR = 'rgba(250, 250, 250, 0.1)';
/** Room for "100" beside the plot and for a row of metres under it, in ems. */
const Y_GUTTER_EMS = 2.3;
const X_GUTTER_EMS = 1.35;
const Y_LABELS = [0, 0.5, 1];
const PCT = 100;

/** Distance ticks the axis aims to show, and the round steps it picks from. */
const X_TICKS_WANTED = 4;
const X_TICK_STEPS_M = [25, 50, 100, 200, 250, 500, 1000, 2000];

/**
 * A jump this wide between two samples is not driving: a tow, a reset, a
 * garage exit. The line breaks rather than drawing a stroke across the plot.
 */
const TELEPORT_PX = 48;

type TraceChannel = { color: string; type: 'throttle' | 'brake' | 'clutch' };

export const bufferSizeFor = (settings: InputTraceSettings): number =>
  (settings.showDistance ? DISTANCE_HISTORY_SECONDS : settings.historySeconds) *
  SAMPLES_PER_SECOND;

const visibleChannels = (settings: InputTraceSettings): TraceChannel[] => {
  const channels: TraceChannel[] = [];

  if (settings.showThrottle) {
    channels.push({ color: settings.throttleColor, type: 'throttle' });
  }

  if (settings.showBrake) {
    channels.push({ color: settings.brakeColor, type: 'brake' });
  }

  if (settings.showClutch) {
    channels.push({ color: settings.clutchColor, type: 'clutch' });
  }

  return channels;
};

const clampUnit = (value: number): number => Math.min(Math.max(value, 0), 1);

const HEX_COLOR = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i;
const SHORT_HEX_COLOR = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i;
const COLOR_NUMBERS = /[\d.]+/g;

/**
 * The colour at a given alpha, whatever notation the user's picker left it
 * in. A notation this cannot read is returned as it came — opaque, but drawn.
 */
const withAlpha = (color: string, alpha: number): string => {
  const unit = clampUnit(alpha);
  const short = SHORT_HEX_COLOR.exec(color);
  const hex = short
    ? `${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`
    : HEX_COLOR.exec(color)?.[1];

  if (hex) {
    const red = parseInt(hex.slice(0, 2), 16);
    const green = parseInt(hex.slice(2, 4), 16);
    const blue = parseInt(hex.slice(4, 6), 16);

    return `rgba(${red}, ${green}, ${blue}, ${unit})`;
  }

  if (color.startsWith('rgb')) {
    const [red = 0, green = 0, blue = 0, own = 1] = (
      color.match(COLOR_NUMBERS) ?? []
    ).map(Number);

    return `rgba(${red}, ${green}, ${blue}, ${own * unit})`;
  }

  return color;
};

interface PlotArea {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface ChannelPassContext {
  /** See `TraceScene.timeLagSamples`. */
  timeLagSamples: number;
  ctx: CanvasRenderingContext2D;
  state: TraceBufferState;
  settings: InputTraceSettings;
  steeringLockDeg: number;
  plot: PlotArea;
  channelCount: number;
  bufferSize: number;
  /** Top of the pedal scale and its height: the line's own width is kept clear. */
  scaleTop: number;
  scaleHeight: number;
}

const circularIndexOf = (
  { state, bufferSize }: ChannelPassContext,
  sampleIndex: number
): number => (state.head - state.count + sampleIndex + bufferSize) % bufferSize;

const levelY = (pass: ChannelPassContext, level: number): number =>
  pass.scaleTop + (1 - level) * pass.scaleHeight;

/** Signed lap fraction from `fromPct` to `toPct`, the short way round. */
const lapSpan = (fromPct: number, toPct: number): number => {
  const span = toPct - fromPct;

  if (span > 0.5) return span - 1;

  if (span < -0.5) return span + 1;

  return span;
};

/**
 * Fills `xScratch` with where each sample stands on the plot this frame.
 * Against time a sample's place is its age; against distance it is where on
 * the lap it was taken, so a sample from before the window, or with no known
 * position, gets no place at all.
 */
const placeSamples = (
  pass: ChannelPassContext,
  distance: DistanceFrame | null
) => {
  const { state, plot, bufferSize } = pass;

  if (state.xScratch.length !== bufferSize) {
    state.xScratch = new Float32Array(bufferSize);
  }

  const xs = state.xScratch;

  if (!distance) {
    const lag = pass.timeLagSamples;

    for (let sampleIndex = 0; sampleIndex < state.count; sampleIndex++) {
      xs[sampleIndex] =
        plot.left + ((sampleIndex + lag) / (bufferSize - 1)) * plot.width;
    }

    return;
  }

  const nowX = plot.left + plot.width * NOW_SHARE;
  const pxPerLap =
    (plot.width / pass.settings.distanceWindow) * distance.trackLengthM;

  for (let sampleIndex = 0; sampleIndex < state.count; sampleIndex++) {
    const pct = state.pctBuffer[circularIndexOf(pass, sampleIndex)];

    if (pct === undefined || Number.isNaN(pct)) {
      xs[sampleIndex] = Number.NaN;

      continue;
    }

    const x = nowX + lapSpan(distance.nowPct, pct) * pxPerLap;

    xs[sampleIndex] = x < plot.left || x > nowX + 1 ? Number.NaN : x;
  }

  // A car that sat still, or came round a whole lap inside the history, left
  // samples in the window that are not this run through it. Only the newest
  // unbroken run is the lap being driven: everything before its first break is
  // dropped.
  let runStart = state.count;

  for (let sampleIndex = state.count - 1; sampleIndex >= 0; sampleIndex--) {
    const x = xs[sampleIndex] ?? Number.NaN;
    const newer = xs[sampleIndex + 1] ?? Number.NaN;
    const isLast = sampleIndex === state.count - 1;

    if (
      Number.isNaN(x) ||
      (!isLast && (x > newer + 1 || newer - x > TELEPORT_PX))
    ) {
      break;
    }

    runStart = sampleIndex;
  }

  xs.fill(Number.NaN, 0, runStart);
};

const drawGrid = (pass: ChannelPassContext) => {
  const { ctx, plot } = pass;

  ctx.lineWidth = GRID_LINE_WIDTH_PX;

  for (const level of GRID_LEVELS) {
    // Half a pixel off the grid so a 1 px line fills one row, not two.
    const y = Math.round(levelY(pass, level)) + 0.5;

    ctx.strokeStyle =
      level === GRID_MID_LEVEL ? GRID_MID_LINE_COLOR : GRID_LINE_COLOR;
    ctx.beginPath();
    ctx.moveTo(plot.left, y);
    ctx.lineTo(plot.left + plot.width, y);
    ctx.stroke();
  }
};

type SampleY = (circularIndex: number) => number;
type SampleColor = (circularIndex: number) => string;

/**
 * One trace as a line. The line re-strokes wherever its colour changes — the
 * brake under ABS, the steering in a slide — so the marked stretch carries its
 * own colour without a break in the line, and breaks only where a sample has
 * no place on the plot.
 */
const strokeTrace = (
  pass: ChannelPassContext,
  yOf: SampleY,
  colorOf: SampleColor
) => {
  const { ctx, state } = pass;
  const xs = state.xScratch;

  let drawing = false;
  let currentColor = '';

  ctx.lineWidth = pass.settings.lineWidth;

  for (let sampleIndex = 0; sampleIndex < state.count; sampleIndex++) {
    const x = xs[sampleIndex] ?? Number.NaN;

    if (Number.isNaN(x)) {
      if (drawing) {
        ctx.stroke();
        drawing = false;
      }

      continue;
    }

    const circularIndex = circularIndexOf(pass, sampleIndex);
    const y = yOf(circularIndex);
    const color = colorOf(circularIndex);

    if (!drawing) {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.moveTo(x, y);
      currentColor = color;
      drawing = true;

      continue;
    }

    ctx.lineTo(x, y);

    if (color !== currentColor) {
      ctx.stroke();
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.moveTo(x, y);
      currentColor = color;
    }
  }

  if (drawing) {
    ctx.stroke();
  }
};

/** The area between a trace and the baseline, in one vertical gradient. */
const fillUnderTrace = (
  pass: ChannelPassContext,
  yOf: SampleY,
  topColor: string,
  bottomColor: string
) => {
  const { ctx, state } = pass;
  const xs = state.xScratch;
  const baseline = levelY(pass, 0);
  const gradient = ctx.createLinearGradient(0, levelY(pass, 1), 0, baseline);

  gradient.addColorStop(0, topColor);
  gradient.addColorStop(1, bottomColor);
  ctx.fillStyle = gradient;

  let open = false;
  let lastX = 0;

  const close = () => {
    if (!open) return;

    ctx.lineTo(lastX, baseline);
    ctx.closePath();
    ctx.fill();
    open = false;
  };

  for (let sampleIndex = 0; sampleIndex < state.count; sampleIndex++) {
    const x = xs[sampleIndex] ?? Number.NaN;
    const y = Number.isNaN(x)
      ? Number.NaN
      : yOf(circularIndexOf(pass, sampleIndex));

    if (Number.isNaN(y)) {
      close();

      continue;
    }

    if (!open) {
      ctx.beginPath();
      ctx.moveTo(x, baseline);
      open = true;
    }

    ctx.lineTo(x, y);
    lastX = x;
  }

  close();
};

/** Where the newest drawn sample of a trace stands, if any is on the plot. */
const headOf = (
  pass: ChannelPassContext,
  yOf: SampleY
): { x: number; y: number; circularIndex: number } | null => {
  const { state } = pass;

  if (state.count === 0) return null;

  const sampleIndex = state.count - 1;
  const x = state.xScratch[sampleIndex] ?? Number.NaN;

  if (Number.isNaN(x)) return null;

  const circularIndex = circularIndexOf(pass, sampleIndex);

  return { x, y: yOf(circularIndex), circularIndex };
};

const headHaloRadius = (settings: InputTraceSettings): number =>
  Math.max(HEAD_DOT_MIN_PX, settings.lineWidth) * HEAD_HALO_TO_LINE;

const drawHead = (
  pass: ChannelPassContext,
  yOf: SampleY,
  colorOf: SampleColor
) => {
  const head = headOf(pass, yOf);

  if (!head) return;

  const { ctx, settings } = pass;
  const color = colorOf(head.circularIndex);
  const dotRadius = Math.max(
    HEAD_DOT_MIN_PX,
    settings.lineWidth * HEAD_DOT_TO_LINE
  );

  ctx.fillStyle = withAlpha(color, HEAD_HALO_ALPHA);
  ctx.beginPath();
  ctx.arc(head.x, head.y, headHaloRadius(settings), 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(head.x, head.y, dotRadius, 0, Math.PI * 2);
  ctx.fill();
};

interface ReferencePoint {
  x: number;
  /** The reference pedal, 0-1; NaN where the lap has no sample. */
  value: number;
}

/**
 * The reference lap's pedal as a filled hill from the baseline with a fine
 * crest line, behind the live lines: the gap between hill and line is the
 * difference to the reference at the same place on the lap (ADR-0014).
 */
const drawReferenceHill = (
  pass: ChannelPassContext,
  points: ReferencePoint[],
  color: string
) => {
  const { ctx, settings } = pass;
  const baseline = levelY(pass, 0);
  const fill = ctx.createLinearGradient(0, levelY(pass, 1), 0, baseline);

  fill.addColorStop(0, withAlpha(color, settings.referenceOpacity));
  fill.addColorStop(
    1,
    withAlpha(color, settings.referenceOpacity * REFERENCE_BASE_SHARE)
  );

  const crestColor = withAlpha(
    color,
    Math.min(1, settings.referenceOpacity * REFERENCE_EDGE_GAIN)
  );

  let run: ReferencePoint[] = [];

  const flush = () => {
    const first = run[0];
    const last = run[run.length - 1];

    if (!first || !last || run.length < 2) {
      run = [];

      return;
    }

    ctx.beginPath();
    ctx.moveTo(first.x, baseline);

    for (const point of run) {
      ctx.lineTo(point.x, levelY(pass, point.value));
    }

    ctx.lineTo(last.x, baseline);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();

    ctx.beginPath();

    for (const [pointIndex, point] of run.entries()) {
      if (pointIndex === 0) {
        ctx.moveTo(point.x, levelY(pass, point.value));
      } else {
        ctx.lineTo(point.x, levelY(pass, point.value));
      }
    }

    ctx.lineWidth = REFERENCE_EDGE_WIDTH_PX;
    ctx.strokeStyle = crestColor;
    ctx.stroke();

    run = [];
  };

  for (const point of points) {
    if (Number.isNaN(point.value)) {
      flush();
    } else {
      run.push(point);
    }
  }

  flush();
};

/** The reference as it was where the car has been: one point per sample. */
const referencePointsFromHistory = (
  pass: ChannelPassContext,
  offset: 0 | 1
): ReferencePoint[] => {
  const { state } = pass;
  const points: ReferencePoint[] = [];

  for (let sampleIndex = 0; sampleIndex < state.count; sampleIndex++) {
    const x = state.xScratch[sampleIndex] ?? Number.NaN;
    const value =
      state.refBuffer[circularIndexOf(pass, sampleIndex) * 2 + offset];

    points.push({
      x: Number.isNaN(x) ? 0 : x,
      value: Number.isNaN(x) || value === undefined ? Number.NaN : value,
    });
  }

  return points;
};

/**
 * The reference over the whole distance window, read off the lap itself — the
 * stretch behind the car and the stretch it has not reached yet alike.
 */
const referencePointsAlongLap = (
  pass: ChannelPassContext,
  distance: DistanceFrame,
  channel: 'throttle' | 'brake'
): ReferencePoint[] => {
  const { plot, settings } = pass;
  const samples = distance.referenceSamples;
  const points: ReferencePoint[] = [];

  if (!samples || samples.length === 0) return points;

  const nowX = plot.left + plot.width * NOW_SHARE;
  const lapPerPx = settings.distanceWindow / plot.width / distance.trackLengthM;
  const right = plot.left + plot.width;

  for (let x = plot.left; x <= right; x += REFERENCE_STEP_PX) {
    const pedals = referencePedalsAt(
      samples,
      distance.nowPct + (x - nowX) * lapPerPx
    );

    points.push({ x, value: pedals ? pedals[channel] : Number.NaN });
  }

  return points;
};

const axisFontPx = (logicalHeight: number): number =>
  Math.min(
    AXIS_FONT_MAX_PX,
    Math.max(AXIS_FONT_MIN_PX, Math.round(logicalHeight * AXIS_FONT_SHARE))
  );

const drawPedalScale = (pass: ChannelPassContext, fontPx: number) => {
  const { ctx, plot } = pass;

  ctx.font = `${AXIS_FONT_WEIGHT} ${fontPx}px ${WIDGET_CANVAS_FONT_FAMILY}`;
  ctx.fillStyle = AXIS_LABEL_COLOR;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';

  for (const level of Y_LABELS) {
    // The end labels are pulled inside the plot's own height, so "100" is not
    // cut by the canvas edge and "0" does not run into the metres under it.
    const y = Math.min(
      Math.max(levelY(pass, level), plot.top + fontPx / 2),
      plot.top + plot.height - fontPx / 2
    );

    ctx.fillText(`${Math.round(level * PCT)}`, plot.left - fontPx * 0.5, y);
  }
};

const tickStepFor = (windowMeters: number): number => {
  const wanted = windowMeters / X_TICKS_WANTED;

  return (
    X_TICK_STEPS_M.find((step) => step >= wanted) ??
    X_TICK_STEPS_M[X_TICK_STEPS_M.length - 1] ??
    wanted
  );
};

/**
 * Round distances along the lap, as ticks through the plot and metres under
 * it. They are counted from the start/finish line, so across it the count
 * starts again — which is why the three laps around "now" are each ruled
 * from their own zero.
 */
const drawDistanceAxis = (
  pass: ChannelPassContext,
  distance: DistanceFrame,
  fontPx: number
) => {
  const { ctx, plot, settings } = pass;
  const nowX = plot.left + plot.width * NOW_SHARE;
  const pxPerMeter = plot.width / settings.distanceWindow;
  const nowMeters = distance.nowPct * distance.trackLengthM;
  const step = tickStepFor(settings.distanceWindow);
  const right = plot.left + plot.width;
  const labelY = plot.top + plot.height + fontPx * (X_GUTTER_EMS / 2);

  ctx.font = `${AXIS_FONT_WEIGHT} ${fontPx}px ${WIDGET_CANVAS_FONT_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = GRID_LINE_WIDTH_PX;

  for (const lapOffset of [-1, 0, 1]) {
    for (let meters = 0; meters < distance.trackLengthM; meters += step) {
      const x =
        nowX +
        (meters + lapOffset * distance.trackLengthM - nowMeters) * pxPerMeter;

      if (x < plot.left || x > right) continue;

      const crisp = Math.round(x) + 0.5;

      ctx.strokeStyle = AXIS_TICK_COLOR;
      ctx.beginPath();
      ctx.moveTo(crisp, plot.top);
      ctx.lineTo(crisp, plot.top + plot.height);
      ctx.stroke();

      const text = `${meters}m`;
      const halfText = ctx.measureText(text).width / 2;

      // A label that would be cut by either end of the axis is left out; its
      // tick still stands.
      if (x - halfText < plot.left || x + halfText > right) continue;

      ctx.fillStyle = AXIS_LABEL_COLOR;
      ctx.fillText(text, x, labelY);
    }
  }
};

const drawNowLine = (pass: ChannelPassContext) => {
  const { ctx, plot } = pass;
  const x = Math.round(plot.left + plot.width * NOW_SHARE) + 0.5;

  ctx.strokeStyle = NOW_LINE_COLOR;
  ctx.lineWidth = NOW_LINE_WIDTH_PX;
  ctx.beginPath();
  ctx.moveTo(x, plot.top);
  ctx.lineTo(x, plot.top + plot.height);
  ctx.stroke();
};

export const drawInputTrace = (
  canvas: HTMLCanvasElement,
  state: TraceBufferState,
  settings: InputTraceSettings,
  steeringLockDeg: number,
  scene: TraceScene = EMPTY_TRACE_SCENE
) => {
  const ctx = canvas.getContext('2d');

  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const logicalWidth = canvas.width / dpr;
  const logicalHeight = canvas.height / dpr;
  const channels = visibleChannels(settings);

  ctx.clearRect(0, 0, logicalWidth, logicalHeight);

  // Nothing to draw: the cleared canvas drops the last trace.
  if (state.buffer.length === 0 && !isSteeringTraceShown(settings)) return;

  // The axis needs a lap to measure along; without one the plot stays on time.
  const distance =
    settings.showDistance && scene.distance && scene.distance.trackLengthM > 0
      ? scene.distance
      : null;

  const fontPx = axisFontPx(logicalHeight);
  const plot: PlotArea = distance
    ? {
        left: fontPx * Y_GUTTER_EMS,
        top: 0,
        width: logicalWidth - fontPx * Y_GUTTER_EMS,
        height: logicalHeight - fontPx * X_GUTTER_EMS,
      }
    : {
        left: 0,
        top: 0,
        // Against time the newest sample is the plot's right edge: the room
        // its marker needs is kept clear, so the marker is not cut in half.
        width: logicalWidth - headHaloRadius(settings),
        height: logicalHeight,
      };

  if (plot.width <= 0 || plot.height <= 0) return;

  const verticalInset = settings.lineWidth / 2;

  const pass: ChannelPassContext = {
    ctx,
    state,
    settings,
    steeringLockDeg,
    plot,
    channelCount: channels.length,
    bufferSize: bufferSizeFor(settings),
    scaleTop: plot.top + verticalInset,
    scaleHeight: plot.height - verticalInset * 2,
    timeLagSamples: scene.timeLagSamples ?? 0,
  };

  placeSamples(pass, distance);
  drawGrid(pass);

  if (distance) {
    drawPedalScale(pass, fontPx);
    drawDistanceAxis(pass, distance, fontPx);
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(plot.left, plot.top, logicalWidth - plot.left, plot.height);
  ctx.clip();

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const hasReference = settings.showReference && scene.referenceLoaded;
  const referenceThrottle =
    hasReference && settings.showThrottle && settings.compareThrottle;
  const referenceBrake =
    hasReference && settings.showBrake && settings.compareBrake;

  if (referenceThrottle) {
    drawReferenceHill(
      pass,
      distance
        ? referencePointsAlongLap(pass, distance, 'throttle')
        : referencePointsFromHistory(pass, 0),
      settings.throttleColor
    );
  }

  if (referenceBrake) {
    drawReferenceHill(
      pass,
      distance
        ? referencePointsAlongLap(pass, distance, 'brake')
        : referencePointsFromHistory(pass, 1),
      settings.brakeColor
    );
  }

  const heads: Array<{ yOf: SampleY; colorOf: SampleColor }> = [];

  for (const [channelIndex, channel] of channels.entries()) {
    const yOf: SampleY = (circularIndex) =>
      levelY(
        pass,
        state.buffer[circularIndex * channels.length + channelIndex] ?? 0
      );

    const colorOf: SampleColor =
      channel.type === 'brake'
        ? (circularIndex) =>
            settings.showAbs && state.absBuffer[circularIndex] === 1
              ? settings.absColor
              : settings.brakeColor
        : () => channel.color;

    // Under a reference the plot is already carrying two fills; a third under
    // the live line would bury the difference the comparison is there to show.
    if (!hasReference && channel.type !== 'clutch') {
      fillUnderTrace(
        pass,
        yOf,
        withAlpha(channel.color, UNDERFILL_TOP_ALPHA),
        withAlpha(channel.color, UNDERFILL_BOTTOM_ALPHA)
      );
    }

    strokeTrace(pass, yOf, colorOf);
    heads.push({ yOf, colorOf });
  }

  if (isSteeringTraceShown(settings)) {
    const centre = plot.top + plot.height / 2;
    const halfHeight = plot.height / 2 - verticalInset;

    strokeTrace(
      pass,
      (circularIndex) =>
        centre -
        normalizedSteering(
          state.steerBuffer[circularIndex] ?? 0,
          steeringLockDeg,
          settings.steeringZoom
        ) *
          halfHeight,
      (circularIndex) =>
        settings.showSlide && state.slideBuffer[circularIndex] === 1
          ? settings.slideColor
          : settings.steeringTraceColor
    );
  }

  if (distance) {
    drawNowLine(pass);
  }

  for (const head of heads) {
    drawHead(pass, head.yOf, head.colorOf);
  }

  ctx.restore();
};

export interface TraceSample {
  throttle: number;
  brake: number;
  clutch: number;
  absActive: boolean;
  steeringWheelAngle: number;
  /** The car is sliding sideways past `SLIDE_ANGLE_DEG`. */
  sliding: boolean;
  /** The reference lap's pedals where the car was; absent without one. */
  refThrottle?: number | null;
  refBrake?: number | null;
  /** Where on the lap the sample was taken, 0-1; absent off track. */
  lapPct?: number | null;
}

// Resizes the circular buffers when the settings change. Split out from
// pushTraceSample so a repaint that appends nothing (settings edit, static
// preview) still allocates the buffers and paints the grid. Mutates `state` in
// place — it is per-instance scratch space.
export const ensureTraceBuffers = (
  state: TraceBufferState,
  settings: InputTraceSettings
) => {
  const bufferSize = bufferSizeFor(settings);
  const channelCount =
    (settings.showThrottle ? 1 : 0) +
    (settings.showBrake ? 1 : 0) +
    (settings.showClutch ? 1 : 0);

  const requiredBufferLength = bufferSize * channelCount;

  // A resize of any circular buffer invalidates head/count for all of them —
  // e.g. with every channel toggled off, requiredBufferLength stays 0 across a
  // historySeconds change, but absBuffer/steerBuffer still get reallocated to
  // the new (smaller) bufferSize; leaving a stale head from the old size would
  // write out of bounds on them.
  let buffersResized = false;

  if (state.buffer.length !== requiredBufferLength) {
    state.buffer = new Float32Array(requiredBufferLength);
    buffersResized = true;
  }

  if (state.absBuffer.length !== bufferSize) {
    state.absBuffer = new Uint8Array(bufferSize);
    buffersResized = true;
  }

  if (state.steerBuffer.length !== bufferSize) {
    state.steerBuffer = new Float32Array(bufferSize);
    buffersResized = true;
  }

  if (state.slideBuffer.length !== bufferSize) {
    state.slideBuffer = new Uint8Array(bufferSize);
    buffersResized = true;
  }

  if (state.refBuffer.length !== bufferSize * 2) {
    state.refBuffer = new Float32Array(bufferSize * 2).fill(Number.NaN);
    buffersResized = true;
  }

  if (state.pctBuffer.length !== bufferSize) {
    state.pctBuffer = new Float32Array(bufferSize).fill(Number.NaN);
    buffersResized = true;
  }

  if (buffersResized) {
    state.head = 0;
    state.count = 0;
  }
};

// Appends exactly one sample. Channel values arrive already smoothed by
// InputTraceWidgetStore, so the trace and the bars never drift apart. Must be
// called at most once per telemetry frame: the buffer length encodes
// `historySeconds` at 60 samples per second, so an extra push per frame
// shortens the visible history proportionally.
export const pushTraceSample = (
  state: TraceBufferState,
  sample: TraceSample,
  settings: InputTraceSettings
) => {
  const bufferSize = bufferSizeFor(settings);

  if (bufferSize === 0) return;

  const values: number[] = [];

  if (settings.showThrottle) values.push(sample.throttle);

  if (settings.showBrake) values.push(sample.brake);

  if (settings.showClutch) values.push(sample.clutch);

  const offset = state.head * values.length;

  for (let channelIndex = 0; channelIndex < values.length; channelIndex++) {
    state.buffer[offset + channelIndex] = values[channelIndex] ?? 0;
  }

  state.absBuffer[state.head] = sample.absActive ? 1 : 0;
  state.steerBuffer[state.head] = sample.steeringWheelAngle;
  state.slideBuffer[state.head] = sample.sliding ? 1 : 0;
  state.refBuffer[state.head * 2] = sample.refThrottle ?? Number.NaN;
  state.refBuffer[state.head * 2 + 1] = sample.refBrake ?? Number.NaN;
  state.pctBuffer[state.head] = sample.lapPct ?? Number.NaN;

  state.head = (state.head + 1) % bufferSize;

  if (state.count < bufferSize) {
    state.count++;
  }
};
