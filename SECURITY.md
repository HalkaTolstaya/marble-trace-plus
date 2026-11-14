# Security policy

## Supported versions

Only the latest release receives fixes. The app updates itself (signed updates
only); if you switched auto-update off, install the latest release by hand.

| Version        | Supported |
| -------------- | --------- |
| latest release | yes       |
| anything older | no        |

## Reporting a vulnerability

Please **do not open a public issue**. Report privately through GitHub:
**Security → Report a vulnerability** on this repository (private
vulnerability reporting). Include what you found, the version, steps to
reproduce, and what an attacker gains.

You can expect an acknowledgement within 7 days and a fix or a plan within 30
days for confirmed issues. Credit is given in the release notes unless you ask
otherwise.

Things that are in scope, for example: the Garage 61 token leaving the
Credential Manager, requests to hosts outside the allowlist, a crafted CSV,
Garage 61 response or Voice Crew pack that crashes the app or writes outside
its folder, an overlay window reaching a capability it should not have, an
update accepted without a valid signature, the remote-screens server reachable
without its token from another machine.

Out of scope: issues in iRacing, Garage 61 or Windows themselves; attacks that
already need administrator access or arbitrary code execution on the PC.

## How the app is hardened

See [docs/threat-model.md](docs/threat-model.md) and
[ADR-0015](docs/adr/0015-threat-model-and-hardening.md). CI runs cargo-deny,
cargo-audit, npm audit, OSV-Scanner, gitleaks, Semgrep, CodeQL, fuzzing of the
parsers and a check that fails on weaker Tauri capabilities or CSP.

## Release integrity

Each release carries `SHA256SUMS.txt` and CycloneDX SBOMs (Rust and npm).
Updates are verified against the minisign public key compiled into the app.
Build provenance attestations are published when the repository is public.
