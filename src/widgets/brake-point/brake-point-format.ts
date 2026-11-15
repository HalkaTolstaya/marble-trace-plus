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

/** What the bar's big label reads. */
export const barLabel = (frame: BrakeCueFrame): string => {
  switch (frame.mode) {
    case 'countdown':
      return String(frame.beat);
    case 'brake':
      return 'BRAKE';
    case 'idle':
      return frame.dist > 0 ? `${Math.round(frame.dist)} m` : '';
    default:
      return '';
  }
};
