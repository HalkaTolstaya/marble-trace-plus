import type { WidgetManifest } from '@shared/contracts/widget-settings';
import {
  COMMON_WIDGET_DEFAULTS,
  PANEL_APPEARANCE_DEFAULTS,
} from '@widgets/widget-manifest';
import { DELTA_SECTORS_SETTINGS } from './settings-schema';

const DESIGN_WIDTH = 270;
const DESIGN_HEIGHT = 210;

export const DELTA_SECTORS_MANIFEST: WidgetManifest = {
  id: 'delta-sectors',
  // The sector the car is in and this lap's sector times.
  telemetryEvents: ['lapDelta'],
  label: 'Delta Sectors',
  description:
    'Sector by sector against the reference lap: where time is won and lost.',
  requiredCapabilities: ['sectors'],
  autoHeight: true,
  // Two cards over the game, as Standings is built: the frame carries no
  // plate of its own, each card paints one from --widget-bg.
  transparentContainer: true,
  designWidth: DESIGN_WIDTH,
  designHeight: DESIGN_HEIGHT,
  userSettings: {
    enabled: false,
    x: 100,
    y: 520,
    currentWidth: DESIGN_WIDTH,
    currentHeight: DESIGN_HEIGHT,
    ...COMMON_WIDGET_DEFAULTS,
    ...PANEL_APPEARANCE_DEFAULTS,
    ...DELTA_SECTORS_SETTINGS.defaults,
  },
  settingsSchema: DELTA_SECTORS_SETTINGS,
};
