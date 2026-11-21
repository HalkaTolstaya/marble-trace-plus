//! Commands that read, write, back up and reset the main settings file.

use mt_model::contract::windows::MAIN_WINDOW_LABEL;
use serde_json::Value;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, WebviewWindow};
use tracing::info;

use crate::{settings_disk, settings_snapshot};

fn settings_dir(window: &WebviewWindow) -> Result<PathBuf, String> {
    if window.label() != MAIN_WINDOW_LABEL {
        return Err("settings are owned by the main window".into());
    }

    settings_disk::executable_dir().map_err(|error| error.to_string())
}

fn source_path(app: &AppHandle, dir: &Path) -> Result<PathBuf, String> {
    let legacy_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;

    settings_disk::source_path(dir, &legacy_dir).map_err(|error| error.to_string())
}

pub(crate) fn read_for_app(app: &AppHandle) -> Result<Option<Value>, String> {
    let dir = settings_disk::executable_dir().map_err(|error| error.to_string())?;

    settings_disk::read(&source_path(app, &dir)?).map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn log_settings_snapshot(settings: Value) -> Result<(), String> {
    settings_snapshot::log_settings_snapshot(&settings);

    Ok(())
}

#[tauri::command]
pub fn read_settings_file(window: WebviewWindow) -> Result<Option<Value>, String> {
    let dir = settings_dir(&window)?;
    settings_disk::read(&source_path(window.app_handle(), &dir)?).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_settings_file(window: WebviewWindow, settings: Value) -> Result<(), String> {
    let dir = settings_dir(&window)?;
    settings_disk::write(&dir, settings).map_err(|e| e.to_string())
}

/// Copies `settings.json` aside before the frontend writes a newly migrated
/// version over it.
///
/// Best effort by design: a failed backup must not stop the migration, or a
/// user with a read-only config directory could never upgrade.
#[tauri::command]
pub async fn backup_settings_file(window: WebviewWindow, suffix: String) -> Result<(), String> {
    if !suffix.chars().all(|c| c.is_ascii_alphanumeric()) {
        return Err(format!("refusing suffix {suffix:?}"));
    }

    let dir = settings_dir(&window)?;

    let source = source_path(window.app_handle(), &dir)?;

    if !source.try_exists().map_err(|error| error.to_string())? {
        return Ok(());
    }

    let target = dir.join(format!("settings.{suffix}.bak"));

    std::fs::copy(&source, &target).map_err(|e| format!("copy failed: {e}"))?;

    info!("settings backed up to {}", target.display());

    Ok(())
}

/// Writes an empty local store to prevent reimporting legacy settings after a reset.
#[tauri::command]
pub fn reset_settings_file(window: WebviewWindow) -> Result<(), String> {
    let dir = settings_dir(&window)?;

    settings_disk::reset(&dir).map_err(|error| error.to_string())
}
