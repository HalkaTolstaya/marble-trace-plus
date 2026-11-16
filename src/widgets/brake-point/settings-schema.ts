import {
  bool,
  choice,
  defineSettings,
  num,
  type SettingsOf,
} from '@shared/lib/widget-settings-dsl';

export const BRAKE_POINT_LAYOUT = ['countdown', 'meters'] as const;

export const BRAKE_POINT_SETTINGS = defineSettings('brakePoint', {
  /**
   * What the plate reads on the way in: the count 3-2-1, or the metres left
   * to the brake point.
   */
  layout: choice(BRAKE_POINT_LAYOUT, 'countdown'),
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
  showTiming: bool(false),
  /** The target peak pressure and the live pedal gauge. */
  showTarget: bool(false),
  /** One pip per counted zone, this lap's grade. */
  showPips: bool(false),
  /**
   * Eases the moving parts between telemetry ticks instead of stepping them —
   * the user's own exception to the one-clock rule (ADR-0017). Off under
   * reduced motion whatever this says.
   */
  smoothMotion: bool(true, { label: 'common.smoothMotion' }),
});

export type BrakePointSettings = SettingsOf<typeof BRAKE_POINT_SETTINGS.shape>;
