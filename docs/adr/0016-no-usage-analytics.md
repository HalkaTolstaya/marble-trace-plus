# ADR 0016: No usage analytics

**Status:** accepted, 2026-11-14 — supersedes upstream's Aptabase integration
**Context:** `src-tauri/src/lib.rs` (`track_app_started`), `tauri-plugin-aptabase`

## Decision

Aptabase is removed entirely: the plugin, the capability, the build-time key
and the `app_started` event. Nothing replaces it.

## Why

- Upstream sent screen size, DPI and locale (plus the IP address the server
  sees) on every launch, with no consent screen.
- The key belonged to the upstream author's Aptabase project. This fork has no
  analytics account, so an opt-in switch would either send our users' data to
  a third party's project or send nothing — both worse than no code.
- Fewer network destinations, fewer things to explain in the privacy section.

## Considered

- **Opt-in toggle, off by default** — rejected for the reasons above; can be
  reintroduced with our own endpoint if ever needed, behind an explicit
  consent dialog listing every event.
