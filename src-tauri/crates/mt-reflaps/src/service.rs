//! Which reference lap the session gets, and fetching it from Garage 61 when
//! the policy says so (ADR-0013). Runs off the telemetry thread; the result is
//! handed to the telemetry runtime as an external reference.

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tracing::{info, warn};

use crate::garage61::{self, CarInfo, Garage61Client, TrackInfo};
use crate::lap::{parse_garage61_csv, RefLap};
use crate::library::{LapSource, Library, LibraryEntry, NewEntry};
use crate::matching::SessionKey;
use crate::net::{HttpTransport, NetError};
use crate::token::TokenStore;

const CATALOG_FILE: &str = "garage61-catalog.json";
/// The track/car catalogue is re-read after a week…
const CATALOG_TTL_S: u64 = 7 * 24 * 3600;
/// …or after a day when a session's track or car is missing from it (new content).
const CATALOG_MISS_TTL_S: u64 = 24 * 3600;
/// A track+car is searched again at most this often.
pub const DEFAULT_REFRESH_S: u64 = 6 * 3600;
const MAX_CATALOG_BYTES: u64 = 16 * 1024 * 1024;

/// What the driver chose in settings.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "source", content = "lapId")]
pub enum ReferencePolicy {
    /// Garage 61 for the session when possible, else the library, else the
    /// personal best.
    #[default]
    Auto,
    /// Only the player's own recorded best.
    PersonalBest,
    /// Best matching lap already in the library; no network.
    Library,
    /// This library lap, whatever the session.
    Pinned(String),
}

/// Why the session has the reference it has; shown in settings.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ResolveNote {
    Fetched,
    Cached,
    /// Network failed; an older download is used.
    Offline,
    NoToken,
    TokenRejected,
    TrackNotOnGarage61,
    CarNotOnGarage61,
    NoLapsThisSeason,
    RateLimited,
    NetworkError,
    PersonalBestChosen,
    PinnedMissing,
    NoMatchInLibrary,
}

#[derive(Debug, Clone)]
pub struct Resolved {
    pub entry: LibraryEntry,
    pub lap: Arc<RefLap>,
}

#[derive(Debug, Clone)]
pub struct Resolution {
    /// `None`: fall back to the personal best.
    pub reference: Option<Resolved>,
    pub note: ResolveNote,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct Catalog {
    fetched_at: u64,
    tracks: Vec<TrackInfo>,
    cars: Vec<CarInfo>,
    /// `"track:car:dry|wet"` → unix seconds of the last search.
    #[serde(default)]
    searched: HashMap<String, u64>,
}

pub struct ReferenceLapService<T, S> {
    library: Library,
    client: Garage61Client<T>,
    tokens: S,
    catalog: Catalog,
    catalog_path: PathBuf,
    refresh_s: u64,
}

impl<T: HttpTransport, S: TokenStore> ReferenceLapService<T, S> {
    pub fn new(data_dir: &Path, client: Garage61Client<T>, tokens: S) -> Self {
        let library = Library::open(data_dir);
        let catalog_path = data_dir
            .join(crate::library::LIBRARY_DIR)
            .join(CATALOG_FILE);
        let catalog = fs::metadata(&catalog_path)
            .ok()
            .filter(|meta| meta.len() <= MAX_CATALOG_BYTES)
            .and_then(|_| fs::read_to_string(&catalog_path).ok())
            .and_then(|text| serde_json::from_str(&text).ok())
            .unwrap_or_default();

        Self {
            library,
            client,
            tokens,
            catalog,
            catalog_path,
            refresh_s: DEFAULT_REFRESH_S,
        }
    }

    pub fn set_refresh_interval(&mut self, seconds: u64) {
        self.refresh_s = seconds.clamp(600, 7 * 24 * 3600);
    }

    /// The next `Auto` resolve asks Garage 61 again, whatever the interval.
    pub fn forget_searches(&mut self) {
        self.catalog.searched.clear();
    }

    pub fn library(&self) -> &Library {
        &self.library
    }

    pub fn library_mut(&mut self) -> &mut Library {
        &mut self.library
    }

    pub fn tokens(&self) -> &S {
        &self.tokens
    }

    fn save_catalog(&self) {
        let Ok(json) = serde_json::to_vec(&self.catalog) else {
            return;
        };

        if let Some(parent) = self.catalog_path.parent() {
            let _ = fs::create_dir_all(parent);
        }

        if let Err(error) = fs::write(&self.catalog_path, json) {
            warn!("could not save the Garage 61 catalogue: {error}");
        }
    }

    fn resolved(&self, entry: &LibraryEntry) -> Option<Resolved> {
        match self.library.load_lap(&entry.id) {
            Ok(lap) => Some(Resolved {
                entry: entry.clone(),
                lap: Arc::new(lap),
            }),
            Err(error) => {
                warn!(id = %entry.id, "library lap unreadable: {error}");

                None
            }
        }
    }

    /// Picks the reference for `session` under `policy`, fetching from
    /// Garage 61 when the policy allows and the cache is stale.
    pub async fn resolve(
        &mut self,
        session: &SessionKey,
        wet: bool,
        policy: &ReferencePolicy,
        now: u64,
    ) -> Resolution {
        match policy {
            ReferencePolicy::PersonalBest => Resolution {
                reference: None,
                note: ResolveNote::PersonalBestChosen,
            },
            ReferencePolicy::Pinned(id) => {
                let reference = self
                    .library
                    .get(id)
                    .cloned()
                    .and_then(|entry| self.resolved(&entry));
                let note = if reference.is_some() {
                    ResolveNote::Cached
                } else {
                    ResolveNote::PinnedMissing
                };

                Resolution { reference, note }
            }
            ReferencePolicy::Library => {
                let reference = self
                    .library
                    .best_for(session, wet)
                    .cloned()
                    .and_then(|entry| self.resolved(&entry));
                let note = if reference.is_some() {
                    ResolveNote::Cached
                } else {
                    ResolveNote::NoMatchInLibrary
                };

                Resolution { reference, note }
            }
            ReferencePolicy::Auto => self.resolve_auto(session, wet, now).await,
        }
    }

    async fn resolve_auto(&mut self, session: &SessionKey, wet: bool, now: u64) -> Resolution {
        let search_key = format!(
            "{}:{}:{}",
            session.track_id,
            session.car_id,
            if wet { "wet" } else { "dry" }
        );
        // Garage 61 downloads (matched by iRacing IDs) and CSVs from the laps
        // folder (matched by car and lap length) compete on lap time.
        let cached = self.library.best_for(session, wet).cloned();
        let fresh_enough = self
            .catalog
            .searched
            .get(&search_key)
            .is_some_and(|&at| now.saturating_sub(at) < self.refresh_s);

        if fresh_enough {
            if let Some(entry) = cached.as_ref() {
                return Resolution {
                    reference: self.resolved(entry),
                    note: ResolveNote::Cached,
                };
            }
        }

        let Some(token) = self.tokens.load() else {
            return self.fallback(cached, ResolveNote::NoToken);
        };

        match self.fetch_best(session, wet, &token, now).await {
            Ok(Some(resolved)) => {
                self.catalog.searched.insert(search_key, now);
                self.save_catalog();

                // A faster lap already in the library (a CSV the driver
                // exported from the full Garage 61 search) still wins.
                match self.library.best_for(session, wet).cloned() {
                    Some(best)
                        if best.id != resolved.entry.id
                            && best.lap_time < resolved.entry.lap_time =>
                    {
                        Resolution {
                            reference: self.resolved(&best).or(Some(resolved)),
                            note: ResolveNote::Cached,
                        }
                    }
                    _ => Resolution {
                        reference: Some(resolved),
                        note: ResolveNote::Fetched,
                    },
                }
            }
            Ok(None) => {
                self.catalog.searched.insert(search_key, now);
                self.save_catalog();

                self.fallback(cached, ResolveNote::NoLapsThisSeason)
            }
            Err(FetchError::Note(note)) => self.fallback(cached, note),
            Err(FetchError::Net(error)) => {
                let note = match error {
                    NetError::Unauthorized => ResolveNote::TokenRejected,
                    NetError::RateLimited => ResolveNote::RateLimited,
                    _ => ResolveNote::NetworkError,
                };

                self.fallback(cached, note)
            }
        }
    }

    /// A cached lap when there is one (noted as offline if the network was the
    /// problem), else the personal best.
    fn fallback(&self, cached: Option<LibraryEntry>, note: ResolveNote) -> Resolution {
        let reference = cached.and_then(|entry| self.resolved(&entry));
        let note = match (&reference, note) {
            (Some(_), ResolveNote::NetworkError | ResolveNote::RateLimited) => ResolveNote::Offline,
            (_, note) => note,
        };

        Resolution { reference, note }
    }

    async fn ensure_catalog(
        &mut self,
        token: &crate::token::Token,
        now: u64,
        missing: bool,
    ) -> Result<(), NetError> {
        let age = now.saturating_sub(self.catalog.fetched_at);
        let stale = self.catalog.tracks.is_empty()
            || age >= CATALOG_TTL_S
            || (missing && age >= CATALOG_MISS_TTL_S);

        if !stale {
            return Ok(());
        }

        let tracks = self.client.tracks(token).await?;
        let cars = self.client.cars(token).await?;

        self.catalog.tracks = tracks;
        self.catalog.cars = cars;
        self.catalog.fetched_at = now;
        self.save_catalog();

        Ok(())
    }

    async fn fetch_best(
        &mut self,
        session: &SessionKey,
        wet: bool,
        token: &crate::token::Token,
        now: u64,
    ) -> Result<Option<Resolved>, FetchError> {
        self.ensure_catalog(token, now, false).await?;

        let mapped = |catalog: &Catalog| {
            (
                garage61::find_track(&catalog.tracks, session.track_id).map(|track| track.id),
                garage61::find_car(&catalog.cars, session.car_id).map(|car| car.id),
            )
        };
        let (mut track, mut car) = mapped(&self.catalog);

        if track.is_none() || car.is_none() {
            self.ensure_catalog(token, now, true).await?;
            (track, car) = mapped(&self.catalog);
        }

        let track = track.ok_or(FetchError::Note(ResolveNote::TrackNotOnGarage61))?;
        let car = car.ok_or(FetchError::Note(ResolveNote::CarNotOnGarage61))?;
        let laps = self.client.current_season_laps(token, track, car).await?;
        let Some(best) = garage61::pick_best(&laps, wet).cloned() else {
            return Ok(None);
        };

        let already = self
            .library
            .entries()
            .iter()
            .find(|entry| matches!(&entry.source, LapSource::Garage61 { lap_id } if *lap_id == best.id))
            .cloned();

        if let Some(entry) = already {
            return Ok(self.resolved(&entry));
        }

        let csv = self.client.lap_csv(token, &best.id).await?;
        let file_name = format!(
            "Garage 61 - {} - {} - {} - {} - {}.csv",
            best.driver_name().unwrap_or_else(|| "Unknown".into()),
            session.car_name,
            session.track_name,
            crate::lap::format_lap_time(best.lap_time).replace(':', "."),
            best.id
        );
        let mut lap = parse_garage61_csv(&csv, &file_name).map_err(|error| {
            FetchError::Net(NetError::Transport(format!("lap CSV unusable: {error}")))
        })?;

        // The API's lap time is authoritative; the samples set the rate.
        lap.lap_time = best.lap_time;
        lap.hz = (lap.len() as f64 / best.lap_time).clamp(20.0, 400.0);
        lap.meta.lap_time = Some(best.lap_time);

        let entry = self
            .library
            .insert(
                &lap,
                NewEntry {
                    source: Some(LapSource::Garage61 {
                        lap_id: best.id.clone(),
                    }),
                    iracing_track_id: Some(session.track_id),
                    iracing_car_id: Some(session.car_id),
                    track_name: Some(session.track_name.clone()),
                    car_name: Some(session.car_name.clone()),
                    driver: best.driver_name(),
                    wet,
                },
                now,
            )
            .map_err(|error| FetchError::Net(NetError::Transport(error.to_string())))?;

        info!(
            lap_time = best.lap_time,
            track = session.track_id,
            car = session.car_id,
            "garage61 reference downloaded"
        );

        Ok(Some(Resolved {
            entry,
            lap: Arc::new(lap),
        }))
    }
}

enum FetchError {
    Note(ResolveNote),
    Net(NetError),
}

impl From<NetError> for FetchError {
    fn from(error: NetError) -> Self {
        Self::Net(error)
    }
}
