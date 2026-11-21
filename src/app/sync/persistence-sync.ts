import { runInAction } from 'mobx';

import { readSettingsFile } from '@shared/api/settings.service';
import {
  backupSettingsFile,
  hydrateStores,
  saveSettings,
  type Settings,
} from './persistence';
import { runMigrations } from '@shared/settings-schema/migrate';
import type { MigrationResult } from '@shared/settings-schema/types';
import type { MainRoot } from '@app/roots/main-root';

/** Load and migrate settings before registering any save reactions. */
export const hydrateFromDisk = async (root: MainRoot) => {
  let loaded: unknown;

  try {
    loaded = await readSettingsFile();
  } catch (error) {
    console.error('Settings locked: could not read the settings file:', error);
    root.appSettings.lockSettings('corrupt');

    return;
  }

  if (loaded === null) {
    return;
  }

  // A migration step reads shapes that no current type describes, straight out
  // of a file the user may have hand-edited. A step that throws on one would
  // otherwise take the whole window down with it — no hydration, but no lock
  // and no banner either, which is the one outcome this path exists to avoid.
  let result: MigrationResult;

  try {
    result = runMigrations(loaded);
  } catch (error) {
    console.error('Settings locked: the migration chain threw:', error);
    root.appSettings.lockSettings('corrupt');

    return;
  }

  if (
    result.status === 'from-the-future' ||
    result.status === 'too-old' ||
    result.status === 'corrupt'
  ) {
    console.error(`Settings locked: ${result.status}`);
    root.appSettings.lockSettings(result.status);

    return;
  }

  if (result.status === 'migrated') {
    await backupSettingsFile(result.from);
  }

  try {
    hydrateStores(root, result.blob as Partial<Settings>);
  } catch (error) {
    console.error('Failed to hydrate settings:', error);
    root.appSettings.lockSettings('corrupt');
  }
};

export const createSaveHandle = (root: MainRoot): (() => Promise<void>) => {
  let pending = Promise.resolve();

  return () => {
    pending = pending.then(async () => {
      if (root.appSettings.settingsLocked) {
        return;
      }

      try {
        await saveSettings(root);
        runInAction(() => {
          root.appSettings.settingsSaveFailed = false;
        });
      } catch (error) {
        console.error('Failed to save settings:', error);
        runInAction(() => {
          root.appSettings.settingsSaveFailed = true;
        });
      }
    });

    return pending;
  };
};
