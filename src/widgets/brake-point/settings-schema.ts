import {
  bool,
  defineSettings,
  num,
  type SettingsOf,
} from '@shared/lib/widget-settings-dsl';

export const BRAKE_POINT_SETTINGS = defineSettings('brakePoint', {
  /** Seconds the three counts take before each reference brake point. */
  countdownSeconds: num(3, { min: 1, max: 6, step: 0.5 }),
  /** Show BRAKE this much earlier than the reference, for reaction time. */
  reactionSeconds: num(0, { min: 0, max: 0.5, step: 0.05 }),
  /** Zones whose reference peak is below this get no countdown, percent. */
  minPeakPercent: num(15, { min: 0, max: 60, step: 5 }),
  /** ± window graded good, milliseconds; very early/late past three times it. */
  goodWindowMs: num(80, { min: 20, max: 300, step: 10 }),
  /** ± window graded perfect, milliseconds, inside the good one. */
  perfectWindowMs: num(30, { min: 10, max: 150, step: 5 }),
  /** The row with the last grade, the timing in seconds and metres. */
  showTiming: bool(true),
  /** The target peak pressure and the live pedal gauge. */
  showTarget: bool(true),
  /** One pip per counted zone, this lap's grade. */
  showPips: bool(true),
  /**
   * Eases the moving parts between telemetry ticks instead of stepping them —
   * the user's own exception to the one-clock rule (ADR-0017). Off under
   * reduced motion whatever this says.
   */
  smoothMotion: bool(true, { label: 'common.smoothMotion' }),
});

export type BrakePointSettings = SettingsOf<typeof BRAKE_POINT_SETTINGS.shape>;
