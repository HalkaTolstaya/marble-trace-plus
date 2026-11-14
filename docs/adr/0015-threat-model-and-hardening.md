# ADR 0015: Threat model and the hardening it requires

**Status:** accepted, 2026-11-14
**Context:** `docs/threat-model.md`; `src-tauri/tauri.conf.json`, `src-tauri/capabilities/`

## Decision

The measures in `docs/threat-model.md` are implemented as follows:

| Measure | Implementation |
| ------- | -------------- |
| Garage 61 token in the OS keychain | `mt-reflaps::token::KeyringTokenStore` (Windows Credential Manager via `keyring`); settings only hold `hasToken: bool`. The token is write-only over IPC (`g61_set_token`), never returned, never logged (`Debug` redacts). |
| API calls only from Rust | `Garage61Provider` lives in Rust; the webview CSP has no `garage61.net` in `connect-src`. |
| Network allowlist | `mt-reflaps::net::Allowlist` rejects any URL whose scheme is not `https` or whose host is not `garage61.net`; redirects are disabled. reqwest with `rustls` only, 10 s connect / 30 s total timeout, 3 retries with exponential backoff + jitter on 5xx/429/timeouts, `Retry-After` honoured, response bodies capped (JSON 4 MiB, CSV 32 MiB). |
| Least-privilege capabilities | `capabilities/main.json` (settings window) and `capabilities/overlay.json` (overlays, HUD) instead of one shared file; overlays lose window creation, updater, dialogs, opener, and fs write. |
| `withGlobalTauri` | `false`. |
| MCP bridge | dependency optional, enabled only by `--features dev`; permission removed from the release capability. |
| CSP | unchanged strictness (`script-src 'self'`, no `unsafe-eval`, `object-src 'none'`); CI fails if it is weakened. |
| devtools | Tauri's `devtools` feature is not enabled, so release builds have none. |
| IPC validation | every new command takes IDs (`[0-9a-f]{64}`) or bounded strings, never paths; file import uses a Rust-side dialog so the path never crosses IPC. |
| Untrusted parsing | CSV parser: size cap, row cap, column cap, no panics (`unwrap`/`expect`/`panic` are denied by workspace lints), fuzzed with `cargo fuzz` and `proptest`. |
| Analytics | removed (ADR-0016). |
| Updater | endpoint and minisign public key point to this repository; private key only in GitHub Secrets. |
| Supply chain | lock files committed; `npm ci`, `cargo build --locked`; `deny.toml` (licences, bans, sources = crates.io only); all GitHub Actions pinned by SHA; Dependabot weekly. |
| Vulnerable deps | `zip` → 9.x, `rustls-webpki`, `webpki-roots`, `ctutils` updated. |
