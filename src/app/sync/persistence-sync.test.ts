import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MainRoot } from '@app/roots/main-root';
import {
  readSettingsFile,
  writeSettingsFile,
} from '@shared/api/settings.service';
import { CURRENT_SCHEMA_VERSION } from '@shared/settings-schema/migrate';
import { createSaveHandle, hydrateFromDisk } from './persistence-sync';

vi.mock('@shared/api/settings.service', () => ({
  readSettingsFile: vi.fn(),
  writeSettingsFile: vi.fn(),
  setCarLengthSilent: vi.fn(),
}));

describe('settings startup and saving', () => {
  let root: MainRoot;

  beforeEach(() => {
    vi.resetAllMocks();
    root = new MainRoot({ skipInit: true });
  });

  afterEach(() => {
    root.dispose();
    vi.restoreAllMocks();
  });

  it('saves a new settings file when the reader reports no settings', async () => {
    vi.mocked(readSettingsFile).mockResolvedValue(null);

    await hydrateFromDisk(root);
    await createSaveHandle(root)();

    expect(root.appSettings.settingsLocked).toBe(false);
    expect(writeSettingsFile).toHaveBeenCalledWith(
      expect.objectContaining({ schemaVersion: CURRENT_SCHEMA_VERSION })
    );
  });

  it('locks settings and skips writes when the reader rejects damaged data', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(readSettingsFile).mockRejectedValue(new Error('invalid JSON'));

    await hydrateFromDisk(root);
    await createSaveHandle(root)();

    expect(root.appSettings.settingsLockReason).toBe('corrupt');
    expect(writeSettingsFile).not.toHaveBeenCalled();
  });

  it('preserves settings from a newer build', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(readSettingsFile).mockResolvedValue({
      schemaVersion: CURRENT_SCHEMA_VERSION + 1,
    });

    await hydrateFromDisk(root);
    await createSaveHandle(root)();

    expect(root.appSettings.settingsLockReason).toBe('from-the-future');
    expect(writeSettingsFile).not.toHaveBeenCalled();
  });
  it('reports a write failure and clears it after the next successful save', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(writeSettingsFile).mockRejectedValueOnce(
      new Error('access denied')
    );
    const save = createSaveHandle(root);

    await save();

    expect(root.appSettings.settingsSaveFailed).toBe(true);
    expect(root.appSettings.settingsLocked).toBe(false);

    await save();

    expect(root.appSettings.settingsSaveFailed).toBe(false);
  });
});
