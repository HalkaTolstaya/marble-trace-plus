import {
  bool,
  defineSettings,
  type SettingsOf,
} from '@shared/lib/widget-settings-dsl';

export const WEATHER_SETTINGS = defineSettings('weather', {
  showCompass: bool(true),
  showCompassRing: bool(true),
  showAirTemp: bool(true),
  showTrackTemp: bool(true),
  showWind: bool(true),
  showHumidity: bool(true),
  showForecast: bool(true),
  showTrackWetness: bool(true),
  showWindBearing: bool(true),
  /** Wide layout: compass and conditions on one row, stats and forecast below. */
  horizontal: bool(false),
  /**
   * Eases the moving parts between telemetry ticks instead of stepping them —
   * the user's own exception to the one-clock rule (ADR-0017). Off under
   * reduced motion whatever this says.
   */
  smoothMotion: bool(true, { label: 'common.smoothMotion' }),
});

export type WeatherWidgetSettings = SettingsOf<typeof WEATHER_SETTINGS.shape>;
