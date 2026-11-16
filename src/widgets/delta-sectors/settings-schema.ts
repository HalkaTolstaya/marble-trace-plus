import {
  bool,
  defineSettings,
  num,
  type SettingsOf,
} from '@shared/lib/widget-settings-dsl';

export const DELTA_SECTORS_SETTINGS = defineSettings('deltaSectors', {
  /**
   * Sector rows on screen. A lap with more sectors than this is shown as a
   * window that follows the car.
   */
  visibleSectors: num(3, { min: 2, max: 8, step: 1 }),
  /** The card under the sectors: best, last and the reference lap. */
  showLapCard: bool(true),
  /**
   * Eases the running sector's bar between telemetry ticks instead of stepping
   * it — the user's own exception to the one-clock rule (ADR-0017). Off under
   * reduced motion whatever this says.
   */
  smoothMotion: bool(true, { label: 'common.smoothMotion' }),
});

export type DeltaSectorsSettings = SettingsOf<
  typeof DELTA_SECTORS_SETTINGS.shape
>;
