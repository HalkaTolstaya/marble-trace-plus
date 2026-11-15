# Release checklist (desktop)

A release is a signed Windows installer on GitHub Releases plus, when the
updater key is configured, a `latest.json` that installed copies poll. There is
no server to deploy and nothing to roll forward on a backend.

## Before tagging

- [ ] `main` CI is green: lint, Rust (Windows + Linux domain), Vitest, coverage
      gates, fuzz, security (deny/audit/npm audit/OSV/gitleaks/Semgrep), CodeQL,
      Tauri config check, NSIS build, e2e smoke.
- [ ] Version is the same in `package.json`, `src-tauri/tauri.conf.json` and
      `src-tauri/Cargo.toml` (`node scripts/bump-version.mjs X.Y.Z`).
- [ ] `CHANGELOG.md` has `## [X.Y.Z]` with Added / Changed / Fixed / Security.
- [ ] **Settings migrations:** if `src/shared/settings-schema` gained a version,
      its migration test passes and an old `settings.json` from the previous
      release loads (copy one from `%APPDATA%\io.github.halkatolstaya.trailbrake`).
      This release (0.28.1) changes no settings schema; reference-lap choices
      live in `reflaps/policy.json`, which is new and optional.
- [ ] **Update from the previous release:** install the previous installer,
      start it once (layouts, a bound key, a widget moved), install the new one
      over it, check the layouts and bindings are still there.
- [ ] `npm run notices` re-run if dependencies changed; `THIRD_PARTY_NOTICES.md`
      committed.
- [ ] Repository secrets present: `TAURI_SIGNING_PRIVATE_KEY`,
      `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (else no updater artifacts);
      optional `WINDOWS_CERTIFICATE`, `WINDOWS_CERTIFICATE_PASSWORD`.

## Tag

```bash
git switch main && git pull
git tag -a vX.Y.Z -m "Trailbrake X.Y.Z"
git push origin vX.Y.Z
```

Or, where tags cannot be pushed, run **Actions → Release → Run workflow** on
`main` (or `gh workflow run release.yml --ref main`): it releases the version in
`package.json` and creates the tag itself.

`release.yml` refuses a tag that is not on `main` or whose version or changelog
entry is missing, runs the full CI again, then builds and publishes.

## After publishing

- [ ] The release has the installer, `SHA256SUMS.txt`, both SBOMs and (with the
      key) `.sig` + `latest.json`; provenance attestation when the repo is public.
- [ ] Download the installer, check its SHA-256, install on a clean Windows
      user, start it, open Settings → Reference laps.
- [ ] An installed previous version offers the update (needs a public
      repository: the updater fetches `latest.json` anonymously).

## Rollback

There is no server state. If a release is bad:

1. Mark the GitHub release as a pre-release (or delete its `latest.json`
   asset) so updaters stop being offered it.
2. Publish the fix as the next patch version; updaters only move forward, so a
   user on the bad version gets the fix through the normal update.
3. Users who need the previous build now can install the previous release's
   installer over it; settings are kept.
