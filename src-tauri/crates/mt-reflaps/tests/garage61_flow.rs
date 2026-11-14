//! The Garage 61 path end to end against a local mock server: catalogue →
//! iRacing ID mapping → current-season search → CSV → library → reference.

// Test helpers outside `#[test]` fns are not covered by clippy.toml's
// allow-*-in-tests; a panic in a helper is still how a test fails.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use mt_reflaps::garage61::Garage61Client;
use mt_reflaps::library::{LapSource, Library};
use mt_reflaps::matching::SessionKey;
use mt_reflaps::net::{Allowlist, ReqwestTransport};
use mt_reflaps::service::{ReferenceLapService, ReferencePolicy, ResolveNote};
use mt_reflaps::token::{MemoryTokenStore, TokenStore};
use serde_json::json;
use wiremock::matchers::{header, method, path, query_param};
use wiremock::{Mock, MockServer, ResponseTemplate};

const SAMPLE: &str = include_str!("fixtures/silverstone-gp-ferrari-296-gt3.csv");
const TOKEN: &str = "test-token-123456";
const NOW: u64 = 1_800_000_000;

fn session() -> SessionKey {
    SessionKey {
        track_id: 341,
        car_id: 173,
        track_name: "Silverstone Circuit".into(),
        track_config: "Grand Prix".into(),
        car_name: "Ferrari 296 GT3".into(),
        track_length_m: 5891.0,
    }
}

fn lap_json(id: &str, time: f64, clean: bool) -> serde_json::Value {
    json!({
        "id": id, "lapTime": time, "clean": clean, "incomplete": false, "missing": false,
        "discontinuity": false, "offtrack": false, "pitlane": false, "canViewTelemetry": true,
        "trackWetness": 0, "driver": {"id": "u", "slug": "u", "firstName": "Ada", "lastName": "Lovelace"}
    })
}

async fn mount_catalog(server: &MockServer) {
    Mock::given(method("GET"))
        .and(path("/api/v1/tracks"))
        .and(header("authorization", format!("Bearer {TOKEN}").as_str()))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "items": [
                {"id": 11, "name": "Silverstone Circuit", "variant": "Grand Prix", "platform": "iracing", "platform_id": "341"},
                {"id": 12, "name": "Monza", "variant": "GP", "platform": "iracing", "platform_id": "239"}
            ],
            "total": 2
        })))
        .mount(server)
        .await;
    Mock::given(method("GET"))
        .and(path("/api/v1/cars"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "items": [{"id": 77, "name": "Ferrari 296 GT3", "platform": "iracing", "platform_id": "173"}],
            "total": 1
        })))
        .mount(server)
        .await;
}

fn service(
    server: &MockServer,
    dir: &std::path::Path,
    tokens: MemoryTokenStore,
) -> ReferenceLapService<ReqwestTransport, MemoryTokenStore> {
    let host = server.address().ip().to_string();
    let transport = ReqwestTransport::new(Allowlist::for_tests(&host)).unwrap();
    let client = Garage61Client::new(transport, &format!("{}/api/v1", server.uri()));

    ReferenceLapService::new(dir, client, tokens)
}

#[tokio::test]
async fn downloads_the_fastest_clean_lap_of_the_current_season() {
    let server = MockServer::start().await;
    let dir = tempfile::tempdir().unwrap();

    mount_catalog(&server).await;
    Mock::given(method("GET"))
        .and(path("/api/v1/laps"))
        .and(query_param("tracks", "11"))
        .and(query_param("cars", "77"))
        .and(query_param("age", "-1"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "items": [lap_json("SLOW", 117.0, true), lap_json("DIRTY", 114.0, false), lap_json("BEST", 115.992, true)],
            "total": 3
        })))
        .expect(1)
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/api/v1/laps/BEST/csv"))
        .respond_with(ResponseTemplate::new(200).set_body_string(SAMPLE))
        .expect(1)
        .mount(&server)
        .await;

    let mut service = service(&server, dir.path(), MemoryTokenStore::with(TOKEN));
    let first = service
        .resolve(&session(), false, &ReferencePolicy::Auto, NOW)
        .await;

    assert_eq!(first.note, ResolveNote::Fetched);

    let reference = first.reference.unwrap();

    assert!((reference.lap.lap_time - 115.992).abs() < 1e-6);
    assert_eq!(
        reference.entry.source,
        LapSource::Garage61 {
            lap_id: "BEST".into()
        }
    );
    assert_eq!(reference.entry.driver.as_deref(), Some("Ada Lovelace"));
    assert!(!reference.lap.zones.is_empty());

    // Within the refresh interval the library answers; the mocks' `expect(1)`
    // fail the test if the network is asked again.
    let second = service
        .resolve(&session(), false, &ReferencePolicy::Auto, NOW + 60)
        .await;

    assert_eq!(second.note, ResolveNote::Cached);

    // And it survives a restart.
    let reopened = Library::open(dir.path());

    assert_eq!(reopened.entries().len(), 1);
    assert!(reopened.load_lap(&reference.entry.id).is_ok());
}

#[tokio::test]
async fn without_a_token_nothing_is_requested() {
    let server = MockServer::start().await;
    let dir = tempfile::tempdir().unwrap();
    let mut service = service(&server, dir.path(), MemoryTokenStore::default());
    let result = service
        .resolve(&session(), false, &ReferencePolicy::Auto, NOW)
        .await;

    assert_eq!(result.note, ResolveNote::NoToken);
    assert!(result.reference.is_none());
    assert!(server
        .received_requests()
        .await
        .unwrap_or_default()
        .is_empty());
}

#[tokio::test]
async fn a_rejected_token_is_reported() {
    let server = MockServer::start().await;
    let dir = tempfile::tempdir().unwrap();

    Mock::given(method("GET"))
        .respond_with(
            ResponseTemplate::new(401).set_body_json(json!({"message": "no", "trace": "t"})),
        )
        .mount(&server)
        .await;

    let mut service = service(&server, dir.path(), MemoryTokenStore::with(TOKEN));
    let result = service
        .resolve(&session(), false, &ReferencePolicy::Auto, NOW)
        .await;

    assert_eq!(result.note, ResolveNote::TokenRejected);
    // 401 is not retried.
    assert_eq!(server.received_requests().await.unwrap().len(), 1);
}

#[tokio::test]
async fn unknown_track_is_reported() {
    let server = MockServer::start().await;
    let dir = tempfile::tempdir().unwrap();

    mount_catalog(&server).await;

    let mut service = service(&server, dir.path(), MemoryTokenStore::with(TOKEN));
    let unknown = SessionKey {
        track_id: 9999,
        ..session()
    };
    let result = service
        .resolve(&unknown, false, &ReferencePolicy::Auto, NOW)
        .await;

    assert_eq!(result.note, ResolveNote::TrackNotOnGarage61);
}

#[tokio::test]
async fn server_errors_are_retried_then_fall_back() {
    let server = MockServer::start().await;
    let dir = tempfile::tempdir().unwrap();

    Mock::given(method("GET"))
        .respond_with(ResponseTemplate::new(503))
        .mount(&server)
        .await;

    let mut service = service(&server, dir.path(), MemoryTokenStore::with(TOKEN));
    let result = service
        .resolve(&session(), false, &ReferencePolicy::Auto, NOW)
        .await;

    assert_eq!(result.note, ResolveNote::NetworkError);
    assert!(result.reference.is_none());
    assert_eq!(server.received_requests().await.unwrap().len(), 4);
}

#[tokio::test]
async fn personal_best_policy_never_touches_the_network() {
    let server = MockServer::start().await;
    let dir = tempfile::tempdir().unwrap();
    let mut service = service(&server, dir.path(), MemoryTokenStore::with(TOKEN));
    let result = service
        .resolve(&session(), false, &ReferencePolicy::PersonalBest, NOW)
        .await;

    assert_eq!(result.note, ResolveNote::PersonalBestChosen);
    assert!(server
        .received_requests()
        .await
        .unwrap_or_default()
        .is_empty());
    assert!(service.tokens().has_token());
}

#[tokio::test]
async fn oversized_responses_are_refused() {
    let server = MockServer::start().await;
    let dir = tempfile::tempdir().unwrap();

    Mock::given(method("GET"))
        .and(path("/api/v1/tracks"))
        .respond_with(ResponseTemplate::new(200).set_body_string("x".repeat(5 * 1024 * 1024)))
        .mount(&server)
        .await;

    let mut service = service(&server, dir.path(), MemoryTokenStore::with(TOKEN));
    let result = service
        .resolve(&session(), false, &ReferencePolicy::Auto, NOW)
        .await;

    assert_eq!(result.note, ResolveNote::NetworkError);
}
