import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import { Button } from 'antd';
import { Check } from 'lucide-react';
import { WidgetPicker } from '@app/windows/overlay/components/WidgetPicker/WidgetPicker';
import { useAppSettingsStore } from '@entities/app-settings/app-settings-context';
import styles from './DragModeBar.module.scss';

/**
 * The controls drag mode puts at the top of the overlay. Loaded lazily by
 * `OverlayCanvas`, so antd reaches the overlay only once drag mode is first
 * switched on — a race spent without it never parses the library.
 */
export const DragModeBar = observer(() => {
  const appSettings = useAppSettingsStore();
  const { t } = useTranslation('main-app');

  const handleExitDragMode = () => {
    appSettings.setDragMode(false);
  };

  return (
    <>
      <div className={styles.title}>
        <span className={styles.heading}>
          {t('overlayCanvas.configureTitle')}
        </span>
        <span className={styles.hint}>{t('overlayCanvas.configureHint')}</span>
      </div>

      <WidgetPicker />

      <Button
        type="primary"
        icon={<Check size={16} />}
        onClick={handleExitDragMode}
        size="large"
        className={styles.done}
      >
        {t('overlayCanvas.exitEditMode')}
      </Button>
    </>
  );
});
