# Threat model (STRIDE)

Scope: the desktop app on the user's Windows PC. No server, no accounts, no
cloud database. Decisions: ADR-0015, ADR-0016.

## Assets

| Asset | Where it lives |
| ----- | -------------- |
| Garage 61 personal access token | Windows Credential Manager (`marble-trace-plus/garage61`) |
| Twitch OAuth token (upstream feature) | Windows Credential Manager |
| Local lap library | `%APPDATA%\<id>\reflaps\` |
| Microphone audio (Voice Crew) | memory only, while push-to-talk is held |
| Settings and layouts | `settings.json` (plugin-store) |
| Integrity of the installed binary and updates | Program Files / updater |

## Trust boundaries

1. iRacing shared memory → Rust (memory-mapped file; local, but the session
   YAML is free text from the sim, up to 512 KiB, Windows-1252).
2. Internet → Rust (Garage 61 API, GitHub Releases for updates, voice model
   downloads, Twitch/YouTube chat).
3. Webview (React) ↔ Rust (Tauri IPC). The webview renders third-party text
   (chat, driver names) and is treated as less trusted than Rust.
4. User-chosen files → Rust (CSV laps, Voice Crew command packs).
5. LAN browsers → Rust (remote screens server, opt-in).

## STRIDE

| Threat | Example | Mitigation |
| ------ | ------- | ---------- |
| **S**poofing | Fake Garage 61 / update server | HTTPS only with rustls + webpki roots; host allowlist; no redirects; updater checks the minisign signature against the public key compiled in |
| **T**ampering | Malicious CSV or command pack crashes the app or writes outside its folder | size/row/column caps, no panics on these paths, fuzzing; packs are data only (questions with steps arrive switched off); zip entries checked with `enclosed_name` and a byte budget; IDs instead of paths over IPC |
| **T**ampering | Update replaced in transit or on GitHub | signed `latest.json` + artifacts; CI provenance attestation; SHA-256 sums published |
| **R**epudiation | — | Not relevant for a single-user local app; logs rotate in AppData without secrets |
| **I**nformation disclosure | Token leaked through logs, settings, frontend, crash reports | keychain only; `Debug` redacted; never sent to the webview; not in `settings.json`; no telemetry/analytics |
| **I**nformation disclosure | Microphone audio leaves the PC | push-to-talk only, local STT, nothing written to disk or sent; on-screen recording indicator |
| **I**nformation disclosure | Remote-screens server reachable by LAN | off by default, loopback by default, 75-bit token for LAN |
| **D**enial of service | Huge API response or CSV exhausts memory; 429 storm | body caps; timeouts; bounded retries with backoff, `Retry-After` honoured; one fetch per session change |
| **E**levation of privilege | XSS in webview reaches powerful IPC | strict CSP (no `unsafe-eval`, no remote scripts); `withGlobalTauri: false`; per-window least-privilege capabilities; no `shell:allow-execute`, fs scoped to AppData; Garage 61 calls not exposed to JS beyond typed commands |
| **E**levation of privilege | Supply-chain compromise of a dependency | lock files, `--locked`/`npm ci`, `cargo deny` (sources = crates.io), cargo-audit/npm audit/OSV/CodeQL/Semgrep in CI, SHA-pinned actions, Dependabot |

## Residual risks

- Code signing certificate: until one is bought, Windows SmartScreen warns on
  first install (README says so). The updater signature still protects updates.
- Loopback clients of the remote-screens server need no token (upstream
  design): any local process can read telemetry while the server runs.
- Companion apps run what the user configured, elevated if the program asks.
