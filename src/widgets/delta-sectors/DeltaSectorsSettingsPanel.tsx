import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import { Card } from '@features/widget-settings/Card';
import { schemaRows } from '@features/widget-settings/schema-rows';
import { DELTA_SECTORS_SETTINGS } from './settings-schema';

// Widget ids this panel configures — read by the panel registry.
export const PANEL_WIDGET_IDS = ['delta-sectors'];

const { Row } = schemaRows(DELTA_SECTORS_SETTINGS);

export const DeltaSectorsSettingsPanel = observer(() => {
  const { t } = useTranslation('widgets');

  return (
    <Card title={t('settingsPanels.deltaSectors.layout')} defaultOpen>
      <Row setting="visibleSectors" />
      <Row setting="showLapCard" />
      <Row setting="smoothMotion" />
    </Card>
  );
});
