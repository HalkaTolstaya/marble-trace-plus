// Smoke test of the built app: it starts without iRacing, the settings window
// renders, the reference-lap commands answer through the real IPC and
// capabilities, and the token is never handed back.
//
// The app is driven over the WebView2 DevTools protocol, the automation path
// Microsoft documents for WebView2 (Playwright connectOverCDP): the exe is
// started with a remote-debugging port in WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS.
// msedgedriver/tauri-driver could not find the DevTools port of a WebView2
// that keeps its own user-data folder.
//
// Needs APP_PATH (the release exe). No sim, no Garage 61 token.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const DEBUG_PORT = 9333;
const APP_PATH = process.env.APP_PATH;
const MAIN_PAGE = /main\.html/;

let app;
let browser;
let page;

const waitForDevTools = async () => {
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const response = await fetch(
        `http://127.0.0.1:${DEBUG_PORT}/json/version`
      );

      if (response.ok) return;
    } catch {
      // not listening yet
    }

    await sleep(500);
  }

  throw new Error('WebView2 never opened its DevTools port');
};

const findMainPage = async () => {
  for (let attempt = 0; attempt < 120; attempt++) {
    for (const context of browser.contexts()) {
      const main = context
        .pages()
        .find((candidate) => MAIN_PAGE.test(candidate.url()));

      if (main) return main;
    }

    await sleep(500);
  }

  throw new Error('the main window never appeared');
};

/** Calls a Tauri command from inside the main window. */
const invoke = (command, args = {}) =>
  page.evaluate(
    async ([name, payload]) => {
      try {
        return {
          ok: true,
          value: await window.__TAURI_INTERNALS__.invoke(name, payload),
        };
      } catch (error) {
        return { ok: false, error: String(error) };
      }
    },
    [command, args]
  );

before(async () => {
  assert.ok(APP_PATH, 'APP_PATH must point at the built exe');

  app = spawn(APP_PATH, [], {
    stdio: 'inherit',
    env: {
      ...process.env,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${DEBUG_PORT}`,
    },
  });

  await waitForDevTools();
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${DEBUG_PORT}`);
  page = await findMainPage();
});

after(async () => {
  await browser?.close().catch(() => {});
  app?.kill();
});

void test('the main window renders without a sim', async () => {
  await page.waitForFunction(
    () => (document.querySelector('#root')?.children.length ?? 0) > 0,
    undefined,
    { timeout: 60_000 }
  );

  assert.match(await page.title(), /Trailbrake/);
});

void test('the global Tauri object is not exposed', async () => {
  assert.equal(await page.evaluate(() => '__TAURI__' in window), false);
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

void test('an overlay window cannot reach the main-only capabilities', async () => {
  let overlay;

  for (let attempt = 0; attempt < 60 && !overlay; attempt++) {
    overlay = browser
      .contexts()
      .flatMap((context) => context.pages())
      .find((candidate) => /overlay\.html/.test(candidate.url()));

    if (!overlay) await sleep(500);
  }

  assert.ok(overlay, 'no overlay window was opened');

  const restart = await overlay.evaluate(async () => {
    try {
      await window.__TAURI_INTERNALS__.invoke('plugin:process|restart');

      return 'allowed';
    } catch (error) {
      return String(error);
    }
  });

  assert.notEqual(restart, 'allowed');
  assert.match(restart, /not allowed|denied|permission/i);
});
