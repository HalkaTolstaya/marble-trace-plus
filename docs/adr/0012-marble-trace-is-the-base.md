# ADR 0012: Marble Trace is the base; ITO's features are ported into it as modules

**Status:** accepted, 2026-11-14
**Context:** `docs/audit/phase1-report.md`; upstreams `mvoof/Marble-Trace v0.28.0`,
`mitchwarrenburg/input-telemetry-overlay v0.1.7`

## Decision

This repository is a fork of Marble Trace with its full history and an
`upstream` remote (`https://github.com/mvoof/Marble-Trace`). Upstream changes
come in by `git fetch upstream && git merge upstream/main` on a branch, through
a pull request. The features of Input Telemetry Overlay (ITO) are ported as
new code inside Marble's structure:

- domain logic (Garage 61 CSV parser, auto-blip removal, brake zones, lap
  matching, the brake-point countdown state machine) → the new crate
  `src-tauri/crates/mt-reflaps`, with ITO's MIT notice in each derived file;
- the egui UI is **not** ported; the brake-point window becomes a React widget
  (`src/widgets/brake-point`), the reference overlay an Input Trace option;
- the reference-lap library and the Garage 61 client are new code (ITO has no
  network code).

The combined work is **GPL-3.0-or-later** because Marble is; ITO's MIT terms
allow inclusion in it.

## Why

- Marble is the more mature base: Tauri 2, a layered workspace with strict
  lints, 1200+ tests, Storybook, a signed updater, settings migrations, i18n.
- ITO is a single egui binary; its value is in ~2 kLOC of domain logic.
- A fork with an upstream remote keeps Marble's fixes flowing in; copy-paste
  would freeze us at 0.28.0.

## Considered

- **ITO as base, port Marble's widgets into egui** — rejected: 35 widgets,
  Voice Crew and the settings UI would have to be rewritten.
- **Two apps side by side** — rejected by the brief (duplicate Input Trace,
  two reference sources).
- **Base on Marble's last MIT commit** to keep MIT — rejected: months behind,
  and relicensed twice since.

## Consequences

- New Marble releases are merged, not rebased; our changes stay in new files
  where possible (`mt-reflaps`, `brake-point` widget) to keep merges cheap.
- The product name, identifier and updater endpoint differ from upstream so
  the two never update each other.
