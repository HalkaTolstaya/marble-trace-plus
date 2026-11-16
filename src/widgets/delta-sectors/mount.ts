import type { WidgetMount } from '@widgets/widget-mount';
import { DELTA_SECTORS_MANIFEST } from './manifest';
import { DeltaSectorsWidget } from './DeltaSectorsWidget';
import { DeltaSectorsWidgetStore } from './delta-sectors.store';

export const mount: WidgetMount = {
  id: DELTA_SECTORS_MANIFEST.id,
  component: DeltaSectorsWidget,
  store: (context) => new DeltaSectorsWidgetStore(context),
};
