#!/usr/bin/env node
// Fails the build when the Tauri security configuration gets weaker
// (ADR-0015): broad capabilities, a relaxed CSP, the global API, devtools, an
// updater without a key or off this repository. Run: `npm run check:tauri-config`.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', 'src-tauri');
const UPDATER_ENDPOINT_PREFIX =
  'https://github.com/HalkaTolstaya/marble-trace-plus/releases/';

const problems = [];
const fail = (message) => problems.push(message);

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

// Permissions no capability may ever hold.
const FORBIDDEN = [
  /^shell:/,
  /^mcp-bridge:/,
  /^aptabase:/,
  /^fs:default$/,
  /^fs:allow-(?!appdata-)/,
  /^fs:scope/,
  /^core:webview:allow-internal-toggle-devtools$/,
];

// The overlays are locked to exactly this list: adding a permission there is
// a reviewed change to this script, not a quiet edit to a JSON file.
const OVERLAY_ALLOWED = new Set([
  'core:default',
  'core:window:allow-set-ignore-cursor-events',
  'core:event:default',
  'store:default',
  'fs:allow-appdata-read-recursive',
]);

const permissionId = (permission) =>
  typeof permission === 'string' ? permission : permission.identifier;

const capabilityDir = join(ROOT, 'capabilities');

for (const file of readdirSync(capabilityDir).filter((name) =>
  name.endsWith('.json')
)) {
  const capability = readJson(join(capabilityDir, file));

  for (const permission of capability.permissions ?? []) {
    const id = permissionId(permission);

    if (FORBIDDEN.some((pattern) => pattern.test(id))) {
      fail(`${file}: forbidden permission ${id}`);
    }

    if (typeof permission === 'object' && permission.allow) {
      fail(`${file}: ${id} carries an inline scope; scopes belong in review`);
    }
  }

  if (capability.identifier === 'overlay') {
    for (const permission of capability.permissions ?? []) {
      const id = permissionId(permission);

      if (!OVERLAY_ALLOWED.has(id)) {
        fail(`overlay.json: ${id} is not on the overlay allowlist`);
      }
    }

    if ((capability.windows ?? []).includes('main')) {
      fail('overlay.json: must not apply to the main window');
    }
  }
}

const config = readJson(join(ROOT, 'tauri.conf.json'));
const { app = {}, plugins = {} } = config;

if (app.withGlobalTauri !== false) {
  fail('tauri.conf.json: app.withGlobalTauri must be false');
}

for (const window of app.windows ?? []) {
  if (window.devtools === true) {
    fail(`tauri.conf.json: window ${window.label} enables devtools`);
  }
}

const csp = app.security?.csp;

if (!csp || typeof csp !== 'object') {
  fail('tauri.conf.json: app.security.csp must be set');
} else {
  const sources = (directive) => [csp[directive] ?? []].flat();
  const all = Object.values(csp).flat().join(' ');

  if (all.includes("'unsafe-eval'")) fail("CSP: 'unsafe-eval' is not allowed");

  if (sources('script-src').join(' ') !== "'self'") {
    fail(
      `CSP: script-src must be exactly 'self' (is ${sources('script-src').join(' ')})`
    );
  }

  if (sources('default-src').join(' ') !== "'self'") {
    fail("CSP: default-src must be 'self'");
  }

  if (sources('object-src').join(' ') !== "'none'") {
    fail("CSP: object-src must be 'none'");
  }

  if (
    sources('connect-src').some((source) =>
      /^https?:\/\/(?!ipc\.localhost)/.test(source)
    )
  ) {
    fail(
      'CSP: connect-src must not reach the network; requests go through Rust'
    );
  }
}

if (app.security?.dangerousRemoteDomainIpcAccess) {
  fail('tauri.conf.json: dangerousRemoteDomainIpcAccess must not be set');
}

const updater = plugins.updater ?? {};

if (!updater.pubkey || updater.pubkey.length < 40) {
  fail('updater: a minisign public key is required');
}

for (const endpoint of updater.endpoints ?? []) {
  if (!endpoint.startsWith(UPDATER_ENDPOINT_PREFIX)) {
    fail(`updater: endpoint ${endpoint} is not this repository's releases`);
  }
}

if (problems.length > 0) {
  console.error('Tauri security configuration check failed:');

  for (const problem of problems) console.error(`  - ${problem}`);

  process.exit(1);
}

console.log('Tauri security configuration OK');
