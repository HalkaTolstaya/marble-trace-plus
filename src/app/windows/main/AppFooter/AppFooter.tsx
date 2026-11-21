import { observer } from 'mobx-react-lite';
import { useAppSettingsStore } from '@entities/app-settings/app-settings-context';
import styles from './AppFooter.module.scss';

export const AppFooter = observer(() => {
  const appSettings = useAppSettingsStore();

  return (
    <footer className={styles.footer}>
      {appSettings.currentVersion && (
        <span className={styles.version}>v{appSettings.currentVersion}</span>
      )}
    </footer>
  );
});
