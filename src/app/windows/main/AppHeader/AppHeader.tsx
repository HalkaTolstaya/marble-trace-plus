import { observer } from 'mobx-react-lite';
import { Button, Segmented, Tooltip } from 'antd';
import { Check, FileUp, Move } from 'lucide-react';
import { useAppSettingsStore } from '@entities/app-settings/app-settings-context';
import { useReferenceLapsStore } from '@features/reference-laps/reference-laps-context';
import { useTranslation } from 'react-i18next';
import { AppStatus } from '../AppStatus/AppStatus';
import { HeaderTrace } from './HeaderTrace';
import { WindowControls } from './WindowControls';
import Logo from '@assets/brand-mark.svg?react';
import styles from './AppHeader.module.scss';

export type AppSection = 'layouts' | 'widgets' | 'crew' | 'settings';

interface AppHeaderProps {
  activeSection: AppSection;
  onSectionChange: (section: AppSection) => void;
}

// Single unified header row: brand (left), section switcher (center), live
// status (right). An ambient telemetry waveform animates behind it.
export const AppHeader = observer(
  ({ activeSection, onSectionChange }: AppHeaderProps) => {
    const { t } = useTranslation('main-app');
    const appSettings = useAppSettingsStore();
    const referenceLaps = useReferenceLapsStore();

    const sectionOptions = [
      { label: t('appHeader.sections.layouts'), value: 'layouts' },
      { label: t('appHeader.sections.widgets'), value: 'widgets' },
      { label: t('appHeader.sections.crew'), value: 'crew' },
      { label: t('appHeader.sections.settings'), value: 'settings' },
    ];

    return (
      <header className={styles.header} data-tauri-drag-region>
        <HeaderTrace />

        <div className={styles.brand} data-tauri-drag-region>
          <Logo className={styles.logo} />
          <span className={styles.name}>Trailbrake</span>
        </div>

        <div className={styles.nav}>
          <Segmented
            value={activeSection}
            onChange={(value) => onSectionChange(value as AppSection)}
            options={sectionOptions}
          />
        </div>

        <div className={styles.status} data-tauri-drag-region>
          <div className={styles.actions}>
            <Tooltip title={t('appHeader.loadLapHint')}>
              <Button
                size="small"
                icon={<FileUp size={14} />}
                disabled={referenceLaps.busy}
                onClick={() => void referenceLaps.importCsv()}
              >
                {t('appHeader.loadLap')}
              </Button>
            </Tooltip>

            <Button
              size="small"
              type="primary"
              className={
                appSettings.dragMode
                  ? styles.doneButton
                  : styles.configureButton
              }
              icon={
                appSettings.dragMode ? <Check size={14} /> : <Move size={14} />
              }
              onClick={() => appSettings.toggleDragMode()}
            >
              {appSettings.dragMode
                ? t('appHeader.configureDone')
                : t('appHeader.configureOverlays')}
            </Button>
          </div>

          <div className={styles.statusInfo} data-tauri-drag-region>
            <AppStatus />
          </div>

          <WindowControls />
        </div>
      </header>
    );
  }
);
