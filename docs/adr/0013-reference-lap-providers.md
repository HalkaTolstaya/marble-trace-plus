# ADR 0013: Reference laps come from providers into one local library

**Status:** accepted, 2026-11-14
**Context:** `src-tauri/crates/mt-reflaps`; `mt-computations/src/timing/reference_selection.rs`

## Decision

One abstraction, `ReferenceLapProvider`, with two implementations:

| Provider            | Source                                                                                         |
| ------------------- | ---------------------------------------------------------------------------------------------- |
| `Garage61Provider`  | Garage 61 REST API (`https://garage61.net/api/v1`), personal access token, `Authorization: Bearer` |
| `LocalFileProvider` | A Garage 61 CSV export (or any CSV with `LapDistPct, Brake, Throttle`) the user imports         |

Both produce a `RefLap` (full-rate samples + brake zones) that is stored in a
**local library** under `AppData/reflaps/` (`index.json` + one compact CSV per
lap, id = SHA-256 of the samples). The library is the cache: the network is
only asked when the library has nothing for the session or the cached lap is
older than the configured refresh interval.

**Selection by IDs, not names.** On every new session the iRacing `TrackID`
and the player's `CarID` are read from the session YAML. Garage 61 publishes
`platform` + `platform_id` for every track and car (`GET /tracks`, `GET /cars`),
which maps iRacing IDs to Garage 61 IDs exactly; that map is cached for a week.
Then:

```
GET /laps?tracks={g61Track}&cars={g61Car}&age=-1&group=none&lapTypes=1&limit=1000
  → keep clean, complete, on-track laps with canViewTelemetry
  → fastest lapTime
GET /laps/{id}/csv  → parse → library → active reference
```

`age=-1` is the API's "current season". A layout is a separate Garage 61
track (`variant`), so `trackId` alone identifies track + layout. Imported CSVs
carry no IDs; they are matched to the session by car name and lap length as
ITO did, and the user can pin one explicitly.

**Policy** (setting `referenceLaps.source`): `auto` (default — Garage 61 for
the session if available, else personal best), `personalBest`, `library`
(auto-pick from the library only, no network), `pinned` (one library lap).
The personal-best recorder is untouched: it keeps comparing against and
writing the *personal* files only, so a downloaded lap never blocks or
overwrites a personal best.

## Why

- iRacing and Garage 61 name tracks differently ("Silverstone Circuit" /
  "Arena Grand Prix" vs "Silverstone Circuit (Grand Prix)"); IDs remove the
  guesswork for the API path.
- The brake cue grades to ±0.03 s; Marble's 1000-bucket model is ~5 m per
  bucket, so the library keeps full-rate samples and converts to buckets only
  for the coach/delta consumers.

## Limits stated to the user

- A personal access token sees the user's own laps and their teammates' laps;
  searching all visible laps needs an application approved by Garage 61.
- Telemetry of other drivers' laps needs a Garage 61 Pro plan
  (`canViewTelemetry`).
- Requests are rate-limited (429 → back off, honour `Retry-After`).

## Considered

- **OAuth2 authorisation-code flow** — the API offers it, but needs a
  registered client and a redirect listener; a PAT pasted once into settings
  is simpler and the scope (`driving_data`) is the same. Can be added later
  behind the same trait.
- **`ghost.bin`** instead of CSV — undocumented binary format; CSV is
  documented and what ITO already parses.
