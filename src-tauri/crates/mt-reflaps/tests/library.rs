// Test helpers outside `#[test]` fns are not covered by clippy.toml's
// allow-*-in-tests; a panic in a helper is still how a test fails.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use mt_reflaps::garage61::Garage61Client;
use mt_reflaps::lap::parse_garage61_csv;
use mt_reflaps::library::{valid_id, LapSource, Library, LibraryError, NewEntry};
use mt_reflaps::matching::{MatchStatus, SessionKey};
use mt_reflaps::net::{Allowlist, ReqwestTransport};
use mt_reflaps::service::{ReferenceLapService, ReferencePolicy, ResolveNote};
use mt_reflaps::token::MemoryTokenStore;

const SAMPLE: &str = include_str!("fixtures/silverstone-gp-ferrari-296-gt3.csv");
const NAME: &str =
    "Garage 61 - Sample Lap - Ferrari 296 GT3 - Silverstone Circuit (Grand Prix) - 01.55.992 - SAMPLE.csv";

fn session(length: f64) -> SessionKey {
    SessionKey {
        track_id: 341,
        car_id: 173,
        track_name: "Silverstone Circuit".into(),
        track_config: "Grand Prix".into(),
        car_name: "Ferrari 296 GT3".into(),
        track_length_m: length,
    }
}

#[test]
fn imported_laps_match_by_length_and_car() {
    let dir = tempfile::tempdir().unwrap();
    let mut library = Library::open(dir.path());
    let lap = parse_garage61_csv(SAMPLE, NAME).unwrap();
    let length = lap.track_length_est.unwrap();
    let entry = library.insert(&lap, NewEntry::default(), 1).unwrap();

    assert!(valid_id(&entry.id));
    assert_eq!(entry.source, LapSource::File);
    assert_eq!(entry.status(Some(&session(length))), MatchStatus::Match);
    assert_eq!(
        entry.status(Some(&session(length * 0.6))),
        MatchStatus::DifferentTrack
    );
    assert!(library.best_for(&session(length), false).is_some());

    // Same samples again: one entry, not two.
    library.insert(&lap, NewEntry::default(), 2).unwrap();
    assert_eq!(library.entries().len(), 1);
}

#[test]
fn ids_are_checked_before_touching_the_disk() {
    let dir = tempfile::tempdir().unwrap();
    let mut library = Library::open(dir.path());

    assert!(matches!(
        library.load_lap("../../etc/passwd"),
        Err(LibraryError::BadId)
    ));
    assert!(matches!(library.remove("..\\x"), Err(LibraryError::BadId)));
    assert!(matches!(
        library.remove(&"a".repeat(64)),
        Err(LibraryError::NotFound)
    ));
}

#[test]
fn removal_deletes_the_file() {
    let dir = tempfile::tempdir().unwrap();
    let mut library = Library::open(dir.path());
    let lap = parse_garage61_csv(SAMPLE, NAME).unwrap();
    let entry = library.insert(&lap, NewEntry::default(), 1).unwrap();

    library.remove(&entry.id).unwrap();

    assert!(library.entries().is_empty());
    assert!(Library::open(dir.path()).entries().is_empty());
}

#[test]
fn a_corrupt_index_is_set_aside() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().join("reflaps");

    std::fs::create_dir_all(&root).unwrap();
    std::fs::write(root.join("index.json"), "{ not json").unwrap();

    let library = Library::open(dir.path());

    assert!(library.entries().is_empty());
    assert!(root.join("index.json.bad").exists());
}

#[tokio::test]
async fn pinned_and_library_policies_use_the_library_only() {
    let dir = tempfile::tempdir().unwrap();
    let transport = ReqwestTransport::new(Allowlist::for_tests("127.0.0.1")).unwrap();
    // Port 9 (discard): any request would fail — none must be made.
    let client = Garage61Client::new(transport, "http://127.0.0.1:9/api/v1");
    let mut service = ReferenceLapService::new(dir.path(), client, MemoryTokenStore::default());
    let lap = parse_garage61_csv(SAMPLE, NAME).unwrap();
    let length = lap.track_length_est.unwrap();
    let entry = service
        .library_mut()
        .insert(&lap, NewEntry::default(), 1)
        .unwrap();

    let pinned = service
        .resolve(
            &session(1.0),
            false,
            &ReferencePolicy::Pinned(entry.id.clone()),
            2,
        )
        .await;

    assert_eq!(pinned.note, ResolveNote::Cached);
    assert!(pinned.reference.is_some());

    let from_library = service
        .resolve(&session(length), false, &ReferencePolicy::Library, 2)
        .await;

    assert!(from_library.reference.is_some());

    let missing = service
        .resolve(
            &session(length),
            false,
            &ReferencePolicy::Pinned("f".repeat(64)),
            2,
        )
        .await;

    assert_eq!(missing.note, ResolveNote::PinnedMissing);

    // Auto without a token still finds the imported lap for this session.
    let auto = service
        .resolve(&session(length), false, &ReferencePolicy::Auto, 2)
        .await;

    assert_eq!(auto.note, ResolveNote::NoToken);
    assert!(auto.reference.is_some());
}
