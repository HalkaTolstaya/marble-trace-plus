import type { WidgetManifest } from '@shared/contracts/widget-settings';
import {
  COMMON_WIDGET_DEFAULTS,
  PANEL_APPEARANCE_DEFAULTS,
} from '@widgets/widget-manifest';
import { BRAKE_POINT_SETTINGS } from './settings-schema';

const DESIGN_WIDTH = 340;
// One plate; the optional rows above and below it share this height.
const DESIGN_HEIGHT = 84;

export const BRAKE_POINT_MANIFEST: WidgetManifest = {
  id: 'brake-point',
  // The cue arrives on its own event (reflaps://brake-cue), switched on by the
  // widget's store while an instance is mounted — not a bundle field.
  telemetryEvents: [],
  requiredCapabilities: ['playerDynamics'],
  label: 'Brake Point',
  description:
    'Counts 3-2-1-BRAKE into each reference brake point and grades your brake-on.',
  designWidth: DESIGN_WIDTH,
  designHeight: DESIGN_HEIGHT,
  userSettings: {
    enabled: false,
    x: 790,
    y: 760,
    currentWidth: DESIGN_WIDTH,
    currentHeight: DESIGN_HEIGHT,
    ...COMMON_WIDGET_DEFAULTS,
    ...PANEL_APPEARANCE_DEFAULTS,
    ...BRAKE_POINT_SETTINGS.defaults,
  },
  settingsSchema: BRAKE_POINT_SETTINGS,
};
