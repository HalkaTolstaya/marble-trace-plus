import type { BrakeCueFrame, BrakeGrade } from '@shared/contracts/reflaps';

/** CSS module class suffix per grade. */
export const GRADE_TONE: Record<BrakeGrade, string> = {
  perfect: 'perfect',
  good: 'good',
  early: 'off',
  late: 'off',
  veryEarly: 'bad',
  veryLate: 'bad',
  noBrake: 'bad',
};

/** i18n key under `settingsPanels.brakePoint.grades`. */
export const GRADE_KEY: Record<BrakeGrade, string> = {
  perfect: 'perfect',
  good: 'good',
  early: 'early',
  late: 'late',
  veryEarly: 'veryEarly',
  veryLate: 'veryLate',
  noBrake: 'noBrake',
};

/** The chevrons point the way the trace does: early is behind the car. */
export const GRADE_ARROWS: Record<BrakeGrade, string> = {
  perfect: '',
  good: '',
  early: '«',
  late: '»',
  veryEarly: '««',
  veryLate: '»»',
  noBrake: '',
};

/** `+0.12 s` / `-0.05 s`; empty without a value. */
export const formatSeconds = (seconds: number | null): string => {
  if (seconds === null || !Number.isFinite(seconds)) return '';

  const sign = seconds > 0 ? '+' : seconds < 0 ? '−' : '±';

  return `${sign}${Math.abs(seconds).toFixed(2)} s`;
};

/** `+7 m`; empty without a value. */
export const formatMetres = (metres: number | null): string => {
  if (metres === null || !Number.isFinite(metres)) return '';

  const sign = metres > 0 ? '+' : metres < 0 ? '−' : '±';

  return `${sign}${Math.abs(Math.round(metres))} m`;
};

export const percent = (value: number | null): string =>
  value === null || !Number.isFinite(value)
    ? '--'
    : `${Math.round(Math.min(Math.max(value, 0), 1) * 100)}`;

export type PlateStage = 'idle' | 'count3' | 'count2' | 'count1' | 'brake';

/** What the plate is saying, as one name: each change of it is a change of state. */
export const plateStageOf = (frame: BrakeCueFrame): PlateStage => {
  if (frame.mode === 'brake') {
    return 'brake';
  }

  if (frame.mode !== 'countdown') {
    return 'idle';
  }

  if (frame.beat >= 3) {
    return 'count3';
  }

  return frame.beat === 2 ? 'count2' : 'count1';
};

export type BrakePointLayout = 'countdown' | 'meters';

const metresLabel = (frame: BrakeCueFrame): string =>
  frame.dist > 0 ? `${Math.round(frame.dist)} m` : '';

/**
 * What the plate's figure reads: the count, or — by metres — how far the
 * brake point still is. Between zones it is the distance either way.
 */
export const plateLabel = (
  frame: BrakeCueFrame,
  layout: BrakePointLayout = 'countdown'
): string => {
  switch (frame.mode) {
    case 'countdown':
      return layout === 'meters' ? metresLabel(frame) : String(frame.beat);
    case 'brake':
      return 'BRAKE';
    case 'idle':
      return metresLabel(frame);
    default:
      return '';
  }
};
