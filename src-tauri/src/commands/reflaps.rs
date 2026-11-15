//! Commands for reference laps and the brake-point cue (ADR-0013, ADR-0014).
//!
//! Every input is an id, a bounded string or a typed value: no path from the
//! webview is ever opened (the CSV import shows a dialog from Rust), and the
//! Garage 61 token is write-only — no command returns it.

use std::sync::Arc;

use mt_reflaps::cue::CueConfig;
use mt_reflaps::lap::{parse_garage61_csv, MAX_CSV_BYTES};
use mt_reflaps::library::{valid_id, LapSource, NewEntry};
use mt_reflaps::matching::MatchStatus;
use mt_reflaps::service::ReferencePolicy;
use mt_reflaps::token::{Token, TokenStore};
use mt_telemetry::control::TelemetryCommand;
use mt_telemetry::state::TelemetryState;
use serde::Serialize;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;
use tracing::info;

use crate::reflaps::{now_unix, session_key, ReflapsState, ReflapsStatus};

/// One library lap as the settings list shows it.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryLapView {
    pub id: String,
    pub source: &'static str,
    pub track_name: Option<String>,
    pub car_name: Option<String>,
    pub driver: Option<String>,
    pub lap_time: f64,
    pub added_at: u64,
    pub status: MatchStatus,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReflapsOverview {
    pub has_token: bool,
    pub policy: ReferencePolicy,
    pub status: Option<ReflapsStatus>,
    pub laps: Vec<LibraryLapView>,
    /// The folder Garage 61 CSV exports are picked up from.
    pub inbox_folder: String,
}

fn check_policy(policy: &ReferencePolicy) -> Result<(), String> {
    match policy {
        ReferencePolicy::Pinned(id) if !valid_id(id) => Err("malformed lap id".into()),
        _ => Ok(()),
    }
}

#[tauri::command]
pub async fn reflaps_overview(
    reflaps: State<'_, Arc<ReflapsState>>,
    telemetry: State<'_, TelemetryState>,
) -> Result<ReflapsOverview, String> {
    let session = telemetry.service.session();
    let key = session.as_deref().and_then(session_key);
    let service = reflaps.service.lock().await;
    let laps = service
        .library()
        .sorted_for(key.as_ref())
        .into_iter()
        .map(|(entry, status)| LibraryLapView {
            id: entry.id.clone(),
            source: match entry.source {
                LapSource::Garage61 { .. } => "garage61",
                LapSource::File => "file",
            },
            track_name: entry.track_name.clone(),
            car_name: entry.car_name.clone(),
            driver: entry.driver.clone(),
            lap_time: entry.lap_time,
            added_at: entry.added_at,
            status,
        })
        .collect();

    Ok(ReflapsOverview {
        has_token: service.tokens().has_token(),
        policy: reflaps.policy.lock().await.clone(),
        status: reflaps.last_status.lock().await.clone(),
        laps,
        inbox_folder: reflaps.inbox.display().to_string(),
    })
}

/// Stores the Garage 61 personal access token in the credential store.
#[tauri::command]
pub async fn reflaps_set_token(
    reflaps: State<'_, Arc<ReflapsState>>,
    token: String,
) -> Result<(), String> {
    let token = Token::parse(&token).ok_or("the token looks malformed")?;
    let mut service = reflaps.service.lock().await;

    if !service.tokens().save(&token) {
        return Err("the Windows credential store refused the token".into());
    }

    service.forget_searches();
    drop(service);
    reflaps.dirty.notify_one();
    info!("garage61 token stored");

    Ok(())
}

#[tauri::command]
pub async fn reflaps_clear_token(reflaps: State<'_, Arc<ReflapsState>>) -> Result<(), String> {
    reflaps.service.lock().await.tokens().clear();
    reflaps.dirty.notify_one();

    Ok(())
}

#[tauri::command]
pub async fn reflaps_set_policy(
    reflaps: State<'_, Arc<ReflapsState>>,
    policy: ReferencePolicy,
) -> Result<(), String> {
    check_policy(&policy)?;
    reflaps.set_policy(policy).await;
    reflaps.dirty.notify_one();

    Ok(())
}

/// Searches Garage 61 again now, ignoring the refresh interval.
#[tauri::command]
pub async fn reflaps_refresh(reflaps: State<'_, Arc<ReflapsState>>) -> Result<(), String> {
    reflaps.service.lock().await.forget_searches();
    reflaps.dirty.notify_one();

    Ok(())
}

#[tauri::command]
pub async fn reflaps_delete(
    reflaps: State<'_, Arc<ReflapsState>>,
    id: String,
) -> Result<(), String> {
    if !valid_id(&id) {
        return Err("malformed lap id".into());
    }

    reflaps
        .service
        .lock()
        .await
        .library_mut()
        .remove(&id)
        .map_err(|error| error.to_string())?;
    reflaps.dirty.notify_one();

    Ok(())
}

/// Shows an open dialog from Rust and imports the chosen Garage 61 CSV. The
/// path never crosses IPC. Returns the new lap's id, or `None` if cancelled.
#[tauri::command]
pub async fn reflaps_import_csv(
    app: AppHandle,
    reflaps: State<'_, Arc<ReflapsState>>,
) -> Result<Option<String>, String> {
    let picked = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .add_filter("Garage 61 CSV", &["csv"])
            .blocking_pick_file()
    })
    .await
    .map_err(|error| error.to_string())?;
    let Some(path) = picked.and_then(|file| file.into_path().ok()) else {
        return Ok(None);
    };
    let size = tokio::fs::metadata(&path)
        .await
        .map_err(|error| error.to_string())?
        .len();

    if size > MAX_CSV_BYTES as u64 {
        return Err("the file is too large to be a lap".into());
    }

    let text = tokio::fs::read_to_string(&path)
        .await
        .map_err(|error| error.to_string())?;
    let file_name = path
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default();
    let lap = parse_garage61_csv(&text, &file_name).map_err(|error| error.to_string())?;
    let entry = reflaps
        .service
        .lock()
        .await
        .library_mut()
        .insert(&lap, NewEntry::default(), now_unix())
        .map_err(|error| error.to_string())?;

    reflaps.dirty.notify_one();
    info!(lap_time = entry.lap_time, "lap imported from CSV");

    Ok(Some(entry.id))
}

/// The brake-point widget's settings, and whether any layout shows it.
#[tauri::command]
pub async fn brake_cue_configure(
    telemetry: State<'_, TelemetryState>,
    enabled: bool,
    config: CueConfig,
) -> Result<(), String> {
    telemetry.service.send(TelemetryCommand::BrakeCue {
        enabled,
        config: config.sanitized(),
    });

    Ok(())
}

/// Opens the laps folder in Explorer. The path comes from Rust, never from
/// the webview.
#[tauri::command]
pub async fn reflaps_open_inbox(
    app: AppHandle,
    reflaps: State<'_, Arc<ReflapsState>>,
) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;

    std::fs::create_dir_all(&reflaps.inbox).map_err(|error| error.to_string())?;
    app.opener()
        .open_path(reflaps.inbox.display().to_string(), None::<&str>)
        .map_err(|error| error.to_string())
}
