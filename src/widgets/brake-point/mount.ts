import type { WidgetMount } from '@widgets/widget-mount';
import { BRAKE_POINT_MANIFEST } from './manifest';
import { BrakePointWidget } from './BrakePointWidget';
import { BrakePointWidgetStore } from './brake-point.store';

export const mount: WidgetMount = {
  id: BRAKE_POINT_MANIFEST.id,
  component: BrakePointWidget,
  store: (context) => new BrakePointWidgetStore(context),
};
