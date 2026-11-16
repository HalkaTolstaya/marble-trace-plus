import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import styles from '@features/widget-settings/WidgetSettings.module.scss';
import { Card } from '@features/widget-settings/Card';
import { schemaRows } from '@features/widget-settings/schema-rows';
import { BRAKE_POINT_SETTINGS } from './settings-schema';

// Widget ids this panel configures — read by the panel registry.
export const PANEL_WIDGET_IDS = ['brake-point'];

const { Row } = schemaRows(BRAKE_POINT_SETTINGS);

export const BrakePointSettingsPanel = observer(() => {
  const { t } = useTranslation('widgets');

  return (
    <>
      <Card title={t('settingsPanels.brakePoint.layoutBlock')} defaultOpen>
        <Row setting="layout" />
        <Row setting="smoothMotion" />
      </Card>

      <Card title={t('settingsPanels.brakePoint.countdown')}>
        <Row setting="countdownSeconds" />
        <Row setting="reactionSeconds" />
        <Row setting="minPeakPercent" />
      </Card>

      <Card title={t('settingsPanels.brakePoint.grading')}>
        <Row setting="goodWindowMs" />
        <Row setting="perfectWindowMs" />
      </Card>

      <Card title={t('settingsPanels.brakePoint.display')}>
        <div className={styles.fieldGroup}>
          <Row setting="showTiming" />
        </div>

        <div className={styles.fieldGroup}>
          <Row setting="showTarget" />
        </div>

        <div className={styles.fieldGroup}>
          <Row setting="showPips" />
        </div>
      </Card>
    </>
  );
});
