//! Reference laps from outside the recorder (ADR-0013): the service, and the
//! watcher that resolves a reference for every new session and hands it to
//! the telemetry thread.
//!
//! The Garage 61 token is read from the credential store here, in Rust, and
//! never crosses IPC.

use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use mt_model::computed::reference_lap::TrackCondition;
use mt_model::contract::event_sink::EventSink;
use mt_model::contract::events::EVENT_REFLAPS_STATUS;
use mt_model::sim::session::SessionSnapshot;
use mt_reflaps::buckets::to_reference_data;
use mt_reflaps::garage61::{Garage61Client, PRODUCTION_BASE};
use mt_reflaps::matching::SessionKey;
use mt_reflaps::net::{Allowlist, ReqwestTransport};
use mt_reflaps::service::{ReferenceLapService, ReferencePolicy, ResolveNote};
use mt_reflaps::token::KeyringTokenStore;
use mt_telemetry::control::{ExternalReference, TelemetryCommand};
use mt_telemetry::state::TelemetryState;
use serde::Serialize;
use tauri::{AppHandle, Manager};
use tokio::sync::{Mutex, Notify};
use tracing::{error, info};

use crate::sink::TauriSink;

/// The driver's choice of reference, kept beside the library rather than in
/// `settings.json` so it needs no settings migration.
const POLICY_FILE: &str = "policy.json";

/// How often the watcher looks at the session the telemetry thread holds.
const WATCH_INTERVAL: Duration = Duration::from_secs(1);

pub type Service = ReferenceLapService<ReqwestTransport, KeyringTokenStore>;

pub struct ReflapsState {
    policy_path: std::path::PathBuf,
    pub service: Mutex<Service>,
    pub policy: Mutex<ReferencePolicy>,
    /// Wakes the watcher to resolve again (token, policy or library changed).
    pub dirty: Notify,
    pub last_status: Mutex<Option<ReflapsStatus>>,
}

/// What the settings page shows about the session's reference.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReflapsStatus {
    pub note: ResolveNote,
    pub track_id: i32,
    pub car_id: i32,
    /// `None`: the personal best is used.
    pub entry_id: Option<String>,
    pub source: Option<&'static str>,
    pub lap_time: Option<f64>,
    pub driver: Option<String>,
}

pub fn now_unix() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |elapsed| elapsed.as_secs())
}

/// The session's identity as the providers need it.
pub fn session_key(snapshot: &SessionSnapshot) -> Option<SessionKey> {
    let car = snapshot
        .cars
        .iter()
        .find(|car| car.car_idx == snapshot.player_car_idx)?;

    Some(SessionKey {
        track_id: snapshot.track_id,
        car_id: car.car_id,
        track_name: snapshot.track_display_name.clone(),
        track_config: snapshot.track_config_name.clone(),
        car_name: car.car_screen_name.clone(),
        track_length_m: f64::from(snapshot.track_length_m),
    })
}

impl ReflapsState {
    pub fn new(app: &AppHandle) -> Result<Self, String> {
        let data_dir = app
            .path()
            .app_data_dir()
            .map_err(|error| error.to_string())?;
        let transport =
            ReqwestTransport::new(Allowlist::production()).map_err(|error| error.to_string())?;
        let client = Garage61Client::new(transport, PRODUCTION_BASE);

        let policy_path = data_dir
            .join(mt_reflaps::library::LIBRARY_DIR)
            .join(POLICY_FILE);
        let policy = std::fs::read_to_string(&policy_path)
            .ok()
            .and_then(|text| serde_json::from_str::<ReferencePolicy>(&text).ok())
            .unwrap_or_default();

        Ok(Self {
            policy_path,
            service: Mutex::new(ReferenceLapService::new(
                &data_dir,
                client,
                KeyringTokenStore,
            )),
            policy: Mutex::new(policy),
            dirty: Notify::new(),
            last_status: Mutex::new(None),
        })
    }
}

impl ReflapsState {
    /// Sets and persists the policy; a failed write keeps it for this run.
    pub async fn set_policy(&self, policy: ReferencePolicy) {
        if let Ok(json) = serde_json::to_vec(&policy) {
            if let Some(parent) = self.policy_path.parent() {
                let _ = tokio::fs::create_dir_all(parent).await;
            }

            if let Err(error) = tokio::fs::write(&self.policy_path, json).await {
                error!("could not save the reference policy: {error}");
            }
        }

        *self.policy.lock().await = policy;
    }
}

/// Starts the watcher: on every new track+car (and whenever woken) it
/// resolves the reference and sends it to the telemetry thread.
pub fn spawn_watcher(app: &AppHandle) {
    let app = app.clone();

    tauri::async_runtime::spawn(async move {
        let mut last: Option<(i32, i32)> = None;

        loop {
            let Some(state) = app.try_state::<Arc<ReflapsState>>() else {
                return;
            };
            let state = Arc::clone(&state);
            let woken = tokio::select! {
                () = state.dirty.notified() => true,
                () = tokio::time::sleep(WATCH_INTERVAL) => false,
            };
            let session = app.state::<TelemetryState>().service.session();
            let key = session.as_deref().and_then(session_key);
            let identity = key.as_ref().map(|key| (key.track_id, key.car_id));

            if identity.is_none() {
                last = None;
                continue;
            }

            if identity == last && !woken {
                continue;
            }

            last = identity;

            if let Some(key) = key {
                resolve_and_send(&app, &state, &key).await;
            }
        }
    });
}

async fn resolve_and_send(app: &AppHandle, state: &ReflapsState, key: &SessionKey) {
    let policy = state.policy.lock().await.clone();
    // Dry: a wet session keeps the personal wet lap (ReferenceSelection).
    let resolution = state
        .service
        .lock()
        .await
        .resolve(key, false, &policy, now_unix())
        .await;
    let external = resolution
        .reference
        .as_ref()
        .map(|resolved| ExternalReference {
            buckets: Arc::new(to_reference_data(
                &resolved.lap,
                key.track_id,
                &key.car_name,
                TrackCondition::Dry,
            )),
            lap: Arc::clone(&resolved.lap),
        });
    let status = ReflapsStatus {
        note: resolution.note,
        track_id: key.track_id,
        car_id: key.car_id,
        entry_id: resolution
            .reference
            .as_ref()
            .map(|resolved| resolved.entry.id.clone()),
        source: resolution
            .reference
            .as_ref()
            .map(|resolved| match resolved.entry.source {
                mt_reflaps::library::LapSource::Garage61 { .. } => "garage61",
                mt_reflaps::library::LapSource::File => "file",
            }),
        lap_time: resolution
            .reference
            .as_ref()
            .map(|resolved| resolved.entry.lap_time),
        driver: resolution
            .reference
            .as_ref()
            .and_then(|resolved| resolved.entry.driver.clone()),
    };

    info!(note = ?status.note, track = key.track_id, car = key.car_id, "reference resolved");

    app.state::<TelemetryState>()
        .service
        .send(TelemetryCommand::ExternalReference(external));

    let sink: &dyn EventSink = &TauriSink(app.clone());

    if let Err(error) = sink.emit(EVENT_REFLAPS_STATUS, &status) {
        error!("failed to emit the reference status: {error}");
    }

    *state.last_status.lock().await = Some(status);
}
