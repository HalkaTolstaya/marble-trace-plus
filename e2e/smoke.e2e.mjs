// Smoke test of the built app through tauri-driver: it starts without iRacing,
// the settings window renders, the reference-lap commands answer through the
// real IPC and capabilities, and the token is never handed back.
//
// Needs APP_PATH (the release exe) and tauri-driver on PATH; on Windows the
// Edge WebDriver that matches WebView2 (the runner image's EDGEWEBDRIVER).
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as sleep } from 'node:timers/promises';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { remote } from 'webdriverio';

const DRIVER_PORT = 4444;
const APP_PATH = process.env.APP_PATH;
const NATIVE_DRIVER = process.env.EDGEWEBDRIVER
  ? join(process.env.EDGEWEBDRIVER, 'msedgedriver.exe')
  : undefined;

let driver;
let browser;

const waitForDriver = async () => {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${DRIVER_PORT}/status`);

      if (response.ok) return;
    } catch {
      // not listening yet
    }

    await sleep(500);
  }

  throw new Error('tauri-driver did not start');
};

/** Calls a Tauri command from inside the main window. */
const invoke = (command, args = {}) =>
  browser.executeAsync(
    (name, payload, done) => {
      window.__TAURI_INTERNALS__
        .invoke(name, payload)
        .then((value) => done({ ok: true, value }))
        .catch((error) => done({ ok: false, error: String(error) }));
    },
    command,
    args
  );

before(async () => {
  assert.ok(APP_PATH, 'APP_PATH must point at the built exe');

  const args = NATIVE_DRIVER ? ['--native-driver', NATIVE_DRIVER] : [];

  driver = spawn('tauri-driver', args, { stdio: 'inherit' });
  await waitForDriver();

  browser = await remote({
    hostname: '127.0.0.1',
    port: DRIVER_PORT,
    logLevel: 'warn',
    capabilities: {
      'tauri:options': { application: APP_PATH },
    },
  });
});

after(async () => {
  await browser?.deleteSession().catch(() => {});
  driver?.kill();

  if (driver && driver.exitCode === null) await once(driver, 'exit');
});

void test('the main window renders without a sim', async () => {
  await browser.waitUntil(
    async () =>
      browser.execute(
        () => (document.querySelector('#root')?.children.length ?? 0) > 0
      ),
    { timeout: 60_000, timeoutMsg: 'the React root never rendered' }
  );

  const title = await browser.getTitle();

  assert.match(title, /Trailbrake/);
});

void test('the global Tauri object is not exposed', async () => {
  const exposed = await browser.execute(() => '__TAURI__' in window);

  assert.equal(exposed, false);
});

void test('the reference-lap commands answer and never return a token', async () => {
  const overview = await invoke('reflaps_overview');

  assert.equal(overview.ok, true, overview.error);
  assert.equal(overview.value.hasToken, false);
  assert.ok(Array.isArray(overview.value.laps));
  assert.equal(JSON.stringify(overview.value).includes('token"'), false);
});

void test('a malformed token and a path-shaped lap id are refused', async () => {
  const token = await invoke('reflaps_set_token', {
    token: 'has spaces in it',
  });

  assert.equal(token.ok, false);

  const removal = await invoke('reflaps_delete', { id: '..\\..\\Windows' });

  assert.equal(removal.ok, false);
  assert.match(removal.error, /malformed/);
});

void test('the brake cue can be switched on and off', async () => {
  const config = { lead: 3, early: 0, minPeak: 0.15, tol: 0.08, perfect: 0.03 };

  assert.equal(
    (await invoke('brake_cue_configure', { enabled: true, config })).ok,
    true
  );
  assert.equal(
    (await invoke('brake_cue_configure', { enabled: false, config })).ok,
    true
  );
});
