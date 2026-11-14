//! The local lap library: `index.json` plus one compact CSV per lap under
//! `<app data>/reflaps/`. Laps are addressed by a content id (SHA-256 of the
//! stored CSV), never by path, so the frontend can only name a lap by id.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tracing::warn;

use crate::lap::{parse_stored_csv, LapMeta, RefLap};
use crate::matching::{self, MatchStatus, SessionKey};

pub const LIBRARY_DIR: &str = "reflaps";
const INDEX_FILE: &str = "index.json";
const LAPS_DIR: &str = "laps";
const INDEX_VERSION: u32 = 1;
/// Most laps kept; the oldest unpinned ones go first.
pub const MAX_ENTRIES: usize = 500;
/// The index is refused past this size.
const MAX_INDEX_BYTES: u64 = 8 * 1024 * 1024;

/// Where a lap came from.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum LapSource {
    /// Downloaded through the API.
    #[serde(rename_all = "camelCase")]
    Garage61 { lap_id: String },
    /// Imported from a CSV file.
    File,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryEntry {
    /// 64 lowercase hex characters.
    pub id: String,
    pub source: LapSource,
    pub iracing_track_id: Option<i32>,
    pub iracing_car_id: Option<i32>,
    pub track_name: Option<String>,
    pub car_name: Option<String>,
    pub driver: Option<String>,
    pub lap_time: f64,
    pub track_length_est: Option<f64>,
    pub wet: bool,
    /// Unix seconds.
    pub added_at: u64,
    pub meta: LapMeta,
}

impl LibraryEntry {
    /// How this lap relates to the session. API laps carry IDs; imported laps
    /// are matched by length and names.
    pub fn status(&self, session: Option<&SessionKey>) -> MatchStatus {
        let Some(session) = session else {
            return MatchStatus::Unknown;
        };

        if let (Some(track), Some(car)) = (self.iracing_track_id, self.iracing_car_id) {
            return match (track == session.track_id, car == session.car_id) {
                (true, true) => MatchStatus::Match,
                (true, false) => MatchStatus::DifferentCar,
                _ => MatchStatus::DifferentTrack,
            };
        }

        matching::status(
            self.track_name.as_deref(),
            self.car_name.as_deref(),
            self.track_length_est,
            Some(session),
        )
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Index {
    version: u32,
    entries: Vec<LibraryEntry>,
}

/// A lap to add, with what is known about it.
#[derive(Debug, Clone, Default)]
pub struct NewEntry {
    pub source: Option<LapSource>,
    pub iracing_track_id: Option<i32>,
    pub iracing_car_id: Option<i32>,
    pub track_name: Option<String>,
    pub car_name: Option<String>,
    pub driver: Option<String>,
    pub wet: bool,
}

#[derive(Debug)]
pub enum LibraryError {
    Io(io::Error),
    NotFound,
    BadId,
    Corrupt(String),
}

impl std::fmt::Display for LibraryError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io(error) => write!(formatter, "library I/O failed: {error}"),
            Self::NotFound => write!(formatter, "no such lap in the library"),
            Self::BadId => write!(formatter, "malformed lap id"),
            Self::Corrupt(detail) => write!(formatter, "stored lap is unreadable: {detail}"),
        }
    }
}

impl std::error::Error for LibraryError {}

impl From<io::Error> for LibraryError {
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}

/// Ids are content hashes: 64 lowercase hex characters, nothing else.
pub fn valid_id(id: &str) -> bool {
    id.len() == 64
        && id
            .bytes()
            .all(|byte| matches!(byte, b'0'..=b'9' | b'a'..=b'f'))
}

fn content_id(csv: &str) -> String {
    let digest = Sha256::digest(csv.as_bytes());

    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

/// Writes through a temporary file and a rename, so a crash never leaves a
/// half-written file behind.
fn write_atomic(path: &Path, contents: &[u8]) -> io::Result<()> {
    let temporary = path.with_extension("tmp");

    fs::write(&temporary, contents)?;
    fs::rename(&temporary, path)
}

#[derive(Debug)]
pub struct Library {
    root: PathBuf,
    index: Index,
}

impl Library {
    /// Opens (or starts) the library under `data_dir`. An unreadable index is
    /// set aside as `index.json.bad` and a fresh one started.
    pub fn open(data_dir: &Path) -> Self {
        let root = data_dir.join(LIBRARY_DIR);
        let index_path = root.join(INDEX_FILE);
        let index = match fs::metadata(&index_path) {
            Ok(meta) if meta.len() > MAX_INDEX_BYTES => {
                warn!("lap library index too large; starting a new one");
                let _ = fs::rename(&index_path, index_path.with_extension("json.bad"));

                Index::default()
            }
            Ok(_) => match fs::read_to_string(&index_path)
                .ok()
                .and_then(|text| serde_json::from_str::<Index>(&text).ok())
            {
                Some(index) => index,
                None => {
                    warn!("lap library index unreadable; starting a new one");
                    let _ = fs::rename(&index_path, index_path.with_extension("json.bad"));

                    Index::default()
                }
            },
            Err(_) => Index::default(),
        };
        let mut library = Self { root, index };

        library.index.entries.retain(|entry| valid_id(&entry.id));

        library
    }

    fn laps_dir(&self) -> PathBuf {
        self.root.join(LAPS_DIR)
    }

    fn lap_path(&self, id: &str) -> PathBuf {
        self.laps_dir().join(format!("{id}.csv"))
    }

    fn save(&mut self) -> Result<(), LibraryError> {
        fs::create_dir_all(&self.root)?;
        self.index.version = INDEX_VERSION;

        let json = serde_json::to_vec_pretty(&self.index)
            .map_err(|error| LibraryError::Corrupt(error.to_string()))?;

        write_atomic(&self.root.join(INDEX_FILE), &json)?;

        Ok(())
    }

    pub fn entries(&self) -> &[LibraryEntry] {
        &self.index.entries
    }

    pub fn get(&self, id: &str) -> Option<&LibraryEntry> {
        self.index.entries.iter().find(|entry| entry.id == id)
    }

    /// Stores `lap` and returns its entry. Adding the same samples twice
    /// returns the existing entry, updated with anything newly known.
    pub fn insert(
        &mut self,
        lap: &RefLap,
        new: NewEntry,
        now: u64,
    ) -> Result<LibraryEntry, LibraryError> {
        let csv = lap.to_compact_csv();
        let id = content_id(&csv);

        fs::create_dir_all(self.laps_dir())?;
        write_atomic(&self.lap_path(&id), csv.as_bytes())?;

        let entry = LibraryEntry {
            id: id.clone(),
            source: new.source.unwrap_or(LapSource::File),
            iracing_track_id: new.iracing_track_id,
            iracing_car_id: new.iracing_car_id,
            track_name: new.track_name.or_else(|| lap.meta.track.clone()),
            car_name: new.car_name.or_else(|| lap.meta.car.clone()),
            driver: new.driver.or_else(|| lap.meta.driver.clone()),
            lap_time: lap.lap_time,
            track_length_est: lap.track_length_est,
            wet: new.wet,
            added_at: now,
            meta: lap.meta.clone(),
        };

        self.index.entries.retain(|existing| existing.id != id);
        self.index.entries.push(entry.clone());
        self.evict();
        self.save()?;

        Ok(entry)
    }

    fn evict(&mut self) {
        while self.index.entries.len() > MAX_ENTRIES {
            let Some(oldest) = self
                .index
                .entries
                .iter()
                .enumerate()
                .min_by_key(|(_, entry)| entry.added_at)
                .map(|(index, _)| index)
            else {
                return;
            };
            let removed = self.index.entries.remove(oldest);
            let _ = fs::remove_file(self.lap_path(&removed.id));
        }
    }

    pub fn load_lap(&self, id: &str) -> Result<RefLap, LibraryError> {
        if !valid_id(id) {
            return Err(LibraryError::BadId);
        }

        let entry = self.get(id).ok_or(LibraryError::NotFound)?;
        let text = fs::read_to_string(self.lap_path(id))?;
        let mut meta = entry.meta.clone();

        meta.lap_time = Some(entry.lap_time);

        parse_stored_csv(&text, meta).map_err(|error| LibraryError::Corrupt(error.to_string()))
    }

    pub fn remove(&mut self, id: &str) -> Result<(), LibraryError> {
        if !valid_id(id) {
            return Err(LibraryError::BadId);
        }

        let before = self.index.entries.len();

        self.index.entries.retain(|entry| entry.id != id);

        if self.index.entries.len() == before {
            return Err(LibraryError::NotFound);
        }

        match fs::remove_file(self.lap_path(id)) {
            Ok(()) => {}
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.into()),
        }

        self.save()
    }

    /// The fastest lap of this exact track and car fetched from Garage 61.
    pub fn best_garage61(&self, track_id: i32, car_id: i32, wet: bool) -> Option<&LibraryEntry> {
        self.index
            .entries
            .iter()
            .filter(|entry| matches!(entry.source, LapSource::Garage61 { .. }))
            .filter(|entry| {
                entry.iracing_track_id == Some(track_id)
                    && entry.iracing_car_id == Some(car_id)
                    && entry.wet == wet
            })
            .min_by(|left, right| left.lap_time.total_cmp(&right.lap_time))
    }

    /// The fastest lap of any source that matches the session exactly.
    pub fn best_for(&self, session: &SessionKey, wet: bool) -> Option<&LibraryEntry> {
        self.index
            .entries
            .iter()
            .filter(|entry| entry.wet == wet && entry.status(Some(session)) == MatchStatus::Match)
            .min_by(|left, right| left.lap_time.total_cmp(&right.lap_time))
    }

    /// Entries ordered for the settings list: matches first, then by time.
    pub fn sorted_for(&self, session: Option<&SessionKey>) -> Vec<(&LibraryEntry, MatchStatus)> {
        let rank = |status: MatchStatus| match status {
            MatchStatus::Match => 0,
            MatchStatus::DifferentCar => 1,
            MatchStatus::Unknown => 2,
            MatchStatus::DifferentTrack => 3,
        };
        let mut list: Vec<(&LibraryEntry, MatchStatus)> = self
            .index
            .entries
            .iter()
            .map(|entry| (entry, entry.status(session)))
            .collect();

        list.sort_by(|left, right| {
            rank(left.1)
                .cmp(&rank(right.1))
                .then(left.0.lap_time.total_cmp(&right.0.lap_time))
        });

        list
    }
}
