# Phase 1 — reconnaissance and audit of the upstream sources

Date: 2026-11-14. Sources audited, read-only, before any of their scripts or
dependencies were run:

| Alias  | Repository                                | Tag       | Commit     |
| ------ | ----------------------------------------- | --------- | ---------- |
| ITO    | `mitchwarrenburg/input-telemetry-overlay` | `v0.1.7`  | `76ea95d`  |
| Marble | `mvoof/Marble-Trace`                      | `v0.28.0` | `bce8e8c8` |

## 1. Inventory

| Aspect              | ITO                                                                                     | Marble                                                                                                                                        |
| ------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Language / stack    | Rust 2024 only; egui/eframe (glow) UI; ~14 kLOC                                         | Tauri 2; Rust workspace of 11 crates (`mt-*`); React 19 + MobX + Ant Design; Storybook; Vitest                                                |
| Entry points        | `src/main.rs` (single exe, tray, two OS windows)                                        | `src-tauri/src/main.rs` → `lib.rs::run`; HTML entries `main`, `overlay`, `hud`, `remote`                                                      |
| Telemetry           | `kerb =0.4.0` (crates.io), own reader thread                                            | `kerb 0.4.0` (crates.io) in `mt-sim-iracing` only; tiered `TelemetryBundle` emitted over Tauri events                                         |
| Reference laps      | Garage 61 **CSV files** imported by hand (drag-drop / Browse / CLI); full 60 Hz samples | Own personal best, recorded live, 1000 distance buckets, one JSON per track+car+dry/wet in `AppData/reference_laps`                           |
| Settings storage    | JSON in `%APPDATA%\input-telemetry-overlay`                                             | `tauri-plugin-store` `settings.json` with schema version + migrations (`src/shared/settings-schema`)                                          |
| Network calls       | **None** in the application                                                             | Updater (GitHub Releases), Aptabase analytics, Twitch IRC/OAuth, YouTube InnerTube chat, voice model downloads (Vosk / Piper, SHA-256 pinned) |
| Local servers       | Single-instance named mutex + file inbox                                                | `mt-remote`: axum HTTP+WS server for LAN "remote screens"; loopback by default, LAN opt-in, 75-bit token, loopback skips the token            |
| File system         | Own dir + user-chosen CSVs                                                              | AppData via `fs:allow-appdata-*-recursive`; dialogs; asset protocol scoped to `$APPDATA/backgrounds`                                          |
| Process spawning    | None (Beep, MessageBox)                                                                 | `mt-companions` launches user-configured companion apps (`Command::new`, `ShellExecuteExW runas`); `mt-voice` runs Piper TTS                  |
| Secrets             | None                                                                                    | Twitch OAuth tokens in Windows Credential Manager via `keyring 4`; `APTABASE_KEY` / Twitch client id baked in at build time from `.env`       |
| IPC / capabilities  | n/a                                                                                     | One capability `default` for **all** windows incl. overlays; includes `mcp-bridge:default` and `aptabase:allow-track-event`                   |
| CSP                 | n/a                                                                                     | Strict `script-src 'self'`; no `unsafe-eval`; `style-src 'unsafe-inline'`; remote images from Twitch/YouTube CDNs                             |
| `withGlobalTauri`   | n/a                                                                                     | `true` (not used by the frontend — grep finds no `__TAURI__`)                                                                                 |
| Native deps         | windows-sys, tray-icon, global-hotkey, rfd                                              | windows 0.62 (DirectInput8, GDI, registry), WebView2                                                                                          |
| Build scripts       | `build.rs` embeds icon                                                                  | `build.rs` bakes `APTABASE_KEY`; `mt-chat/build.rs` bakes Twitch client id                                                                    |
| npm install scripts | n/a                                                                                     | `esbuild` (postinstall binary), `@parcel/watcher` (install), `lefthook` (postinstall) — all expected                                          |
| CI                  | GitHub Actions: test + Inno Setup installer; **auto-release on every push to main**     | quality, CodeQL, PR builds, release (signed updater), site deploy, Discord announce                                                           |

## 2. Licences

| Project | Licence at audited tag                                                                                                                                |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| ITO     | **MIT** (`LICENSE`, `Cargo.toml`), © 2026 Mitch Warrenburg. Fonts: Barlow, SIL OFL 1.1.                                                               |
| Marble  | **GPL-3.0-or-later** — _not MIT as the task brief states._ History: MIT (2026-03-23) → CC BY-NC-SA 4.0 (2026-09-04, #505) → GPLv3 (2026-09-05, #506). |

**Conclusion.** MIT code may be incorporated into a GPL-3.0 work, so the merge is
legal, but the **combined product must be distributed under GPL-3.0-or-later**
(source available, same licence, notices kept). ITO's MIT notice is preserved in
`THIRD_PARTY_NOTICES.md` and in the header of every file derived from it. Using
the MIT-only 0.27.x Marble history to avoid the GPL is not an option: it is far
behind and was relicensed twice since. No stop condition is triggered — ITO is
MIT, compatible.

## 3. PR #5 "Share home-network files through the NAS" (ITO `86b8045`)

Line-by-line result:

- Touches only `scripts/home_network.py`, its test, `docs/home-network.md`,
  `AGENTS.md`, `README.md` and the `.agents/` / `.claude/` _agent skills_. **No
  application source, no `Cargo.toml`, no installer, no CI file is changed.**
- `home_network.py` is a Paramiko SSH/SFTP helper for the author's own LAN:
  hard-coded hosts `192.168.1.247` (FRANK), `192.168.1.249` (MACINDOZE),
  `mitch-mac.local`, `192.168.1.20` (devbox VM), NAS `truenas` /
  `192.168.1.253`, SMB root `\\truenas\files\pitwire`. The PR adds a `nas`
  sub-command that prints the NAS path (runs `mount` on macOS) and drops the
  `FRANK smb` sub-command.
- Credentials: none committed. The password comes from `HOME_NETWORK_PW` in the
  environment; docs show only `'<Windows password>'` placeholders.
- It opens no shares itself and is never invoked by the app or the build.
- **Risk** (medium, for contributors, not users): the repository ships AI-agent
  instructions (`AGENTS.md`, `CLAUDE.md`, `.agents/skills/home-network`) that
  direct a coding agent to SSH into those LAN addresses and run commands. An
  agent opened on a contributor's machine whose LAN uses `192.168.1.0/24` would
  try to connect to _their_ hosts with _their_ `HOME_NETWORK_PW` if set.
- **Decision:** nothing from PR #5 or the home-network tooling (scripts,
  docs, agent skills, `.mcp.json` CodeGraph server) enters this product.

## 4. Security review of the code

| #   | Finding                                                                                                                                                                                                                                                 | Where                                     | Severity                                          | Action                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------- |
| 1   | `zip 4.6.1`: RUSTSEC-2026-0367/0368/0369/0429. Marble unpacks downloaded voice archives and imported packs with its own loop (`enclosed_name`, byte budget, no `extract()`), so the vulnerable `extract()` paths are **not reachable** — still upgrade. | `mt-voice/src/assets/unpack.rs`           | Low (reachability) / Critical (CVSS)              | Upgrade to `zip >= 9`                                                 |
| 2   | `rustls-webpki 0.103.15`, `webpki-roots` / `webpki-root-certs 1.0.9`: distrusted intermediates accepted                                                                                                                                                 | TLS for updater, Twitch, YouTube          | Medium                                            | `cargo update`                                                        |
| 3   | `ctutils 0.4.3` non-constant-time compare                                                                                                                                                                                                               | transitive (crypto)                       | Low                                               | `cargo update`                                                        |
| 4   | Analytics on by default: `app_started` with screen size, DPI, locale sent to Aptabase on every launch, no consent UI                                                                                                                                    | `src-tauri/src/lib.rs`                    | Medium (privacy)                                  | Removed (ADR-0016)                                                    |
| 5   | One capability for every window: transparent overlays can create windows, write all of AppData, run the updater, open URLs                                                                                                                              | `capabilities/default.json`               | Medium                                            | Split per window (ADR-0015)                                           |
| 6   | `mcp-bridge:default` permission granted in release while the plugin is only initialised under `feature = "dev"`; crate is a non-optional dependency                                                                                                     | `capabilities/default.json`, `Cargo.toml` | Low                                               | Make dependency optional, drop permission from release capability     |
| 7   | `withGlobalTauri: true` exposes the whole IPC API on `window.__TAURI__` to any injected script; unused                                                                                                                                                  | `tauri.conf.json`                         | Low                                               | `false`                                                               |
| 8   | Remote-screen server: loopback requests bypass the token; any local process can read telemetry. Token compare is not constant-time                                                                                                                      | `mt-remote/src/server.rs`                 | Low                                               | Documented; kept (feature is opt-in and bound to loopback by default) |
| 9   | Companion apps: `ShellExecuteExW` with `runas` for paths the user configured                                                                                                                                                                            | `mt-companions/src/process.rs`            | Info                                              | By design; paths only from the user's own settings                    |
| 10  | Updater endpoint and public key point to the upstream author's releases                                                                                                                                                                                 | `tauri.conf.json`                         | High for a fork (we would install _their_ builds) | Re-point to our repository and our key                                |
| 11  | ITO auto-releases every push to `main` with unsigned binaries                                                                                                                                                                                           | ITO `.github/workflows/release.yml`       | Info                                              | Not imported                                                          |

Searches with no findings in either repository: `eval`, `new Function`,
dynamic `import()` of remote code, obfuscated/minified sources, committed
binaries other than fonts/icons/images, `postinstall` scripts beyond the three
listed, unexpected domains. `unsafe` blocks (76, Semgrep INFO) are all Win32/
DirectInput FFI with `// SAFETY:` comments enforced by
`clippy::undocumented_unsafe_blocks = deny` in Marble.

### Tool results

| Tool                                            | ITO                                                                                                                       | Marble                                                                                                                                             |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gitleaks git` (full history)                   | 66 commits, **0 leaks**                                                                                                   | 898 commits, 1 hit — false positive (`TOKEN_ALPHABET` constant)                                                                                    |
| `cargo audit`                                   | 0 vulnerabilities; 5 unmaintained/unsound warnings (`glib`, `rustix`, `ttf-parser`, `unsafe-libyaml`, `proc-macro-error`) | **7 vulnerabilities** (rows 1–3 above) + unmaintained `zbus*`, `zvariant*`, `unsafe-libyaml`, `proc-macro-error`; yanked `inout`, `async-executor` |
| `cargo deny check`                              | —                                                                                                                         | advisories FAILED (above); licenses FAILED only because no `deny.toml` existed; bans ok; sources ok                                                |
| `npm audit --omit=dev`                          | n/a                                                                                                                       | **0**                                                                                                                                              |
| `npm audit` (incl. dev)                         | n/a                                                                                                                       | 4 moderate (dev tooling only)                                                                                                                      |
| `osv-scanner`                                   | 366 Cargo + 8 PyPI packages scanned                                                                                       | 698 Cargo + 539 npm packages scanned; results equal to cargo audit/npm audit                                                                       |
| Semgrep `p/rust p/typescript p/react p/secrets` | 0 ERROR/WARNING                                                                                                           | 0 ERROR/WARNING (INFO: `unsafe`, `temp_dir`, `current_exe`)                                                                                        |

### `pitwall` fork

The brief says Marble uses a fork of `pitwall`. At v0.28.0 it does not: both
projects use **`kerb 0.4.0` from crates.io** (Marble's author is the `kerb`
author; it is what the `pitwall` fork became). There is no git dependency in
either lockfile (`cargo deny check sources` passes). `Cargo.lock` pins it by
checksum.

## 5. Feature matrix

| Feature                                                                                                    | ITO |           Marble           | Merged product                                      |
| ---------------------------------------------------------------------------------------------------------- | :-: | :------------------------: | --------------------------------------------------- |
| Live throttle / brake trace                                                                                |  ✔  |             ✔              | Marble's Input Trace + reference overlay (ADR-0014) |
| Reference overlay on the trace (by lap distance)                                                           |  ✔  | ~ (coach speed trace only) | Input Trace "reference" option                      |
| Reference = own personal best, auto-recorded                                                               |     |             ✔              | kept                                                |
| Reference = Garage 61 lap (CSV import)                                                                     |  ✔  |                            | `LocalFileProvider`                                 |
| Reference = Garage 61 lap **downloaded automatically** for the session's track+car, best of current season |     |                            | **new** — `Garage61Provider` (ADR-0013)             |
| Lap library with auto-pick by track/layout/car                                                             |  ✔  | ~ (one file per car+track) | unified library                                     |
| Throttle auto-blip removal on G61 laps                                                                     |  ✔  |                            | ported                                              |
| **Brake-point countdown** (3-2-1-BRAKE, target peak, grading, pips)                                        |  ✔  |                            | ported as `brake-point` widget                      |
| Coaching by corner phase vs reference                                                                      |     |             ✔              | kept; now fed by whichever reference is active      |
| ABS indicator                                                                                              |     |             ✔              | kept                                                |
| Speed/RPM, standings, relative, G-meter, sectors, lap log, fuel, radar, weather, … (35 widgets)            |     |             ✔              | kept                                                |
| Voice Crew (PTT, local STT/TTS, EN/RU/ES/ZH)                                                               |     |             ✔              | kept                                                |
| Stream chat (Twitch/YouTube), remote screens on LAN                                                        |     |             ✔              | kept                                                |
| Click-through lock, hotkey unlock, tray                                                                    |  ✔  |             ✔              | Marble's                                            |
| Demo / fake sim                                                                                            |  ✔  |   ✔ (tapes, dev feature)   | Marble's tapes                                      |
| Auto-update (signed)                                                                                       |     |             ✔              | re-pointed to this repository                       |
| Analytics                                                                                                  |     |             ✔              | **removed**                                         |

## 6. Technical debt (short)

- **Marble** — healthy: strict clippy (`unwrap/expect/panic = deny`), layered
  crates, 1208 Vitest tests green, Rust tests green on Linux for pure crates.
  Debt: `specta` pinned to an RC; single shared capability; analytics coupled
  into `lib.rs`; the reference model is 1000 buckets — too coarse for the
  ±0.03 s brake grading, so the brake cue keeps its own full-rate copy.
  _Take as is._
- **ITO** — good domain code, egui UI. Debt: `expect`/`unwrap` in domain code,
  no network or persistence abstraction (direct `std::fs`), personal tooling
  in the repo. _Port the domain logic (CSV parser, blip removal, zones,
  matching, cue state machine), rewrite UI in React, drop everything else._

## 7. Recommendation

Base = **Marble-Trace** (confirmed): Tauri 2, layered crates, tests, Storybook,
signed updater, i18n. ITO contributes domain logic only. The combined work is
**GPL-3.0-or-later**.
