// End-to-end check: loads the unpacked extension into Chromium, serves a mock X
// timeline on https://x.com, and verifies stamps, the panel and the settings
// pages. With DARKWOODS_API_KEY set it also runs real quick checks (about 0.05
// credits each); E2E_DEEP=1 adds one deep check (about 5-20 credits).
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromiumPath } from './browser.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const out = path.join(here, 'out');
fs.mkdirSync(out, { recursive: true });
const mock = fs.readFileSync(path.join(here, 'mock-x.html'), 'utf8');
const KEY = process.env.DARKWOODS_API_KEY || '';
const DEEP = process.env.E2E_DEEP === '1';
const HEADED = process.env.HEADED === '1';

const log = (...a) => console.log('·', ...a);

// Fictional accounts in mock-x.html.
const FLAGGED = ['@printer_go_brrr', '@pdf_below', '@exit_liq_enjoyer', '@hedgefund_of_one', '@trust_me_bro_ai', '@growth_hacker_9000'];
const CALM = ['@markets_desk', '@actual_builder', '@catperson'];

const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'capchecker-e2e-'));
const context = await chromium.launchPersistentContext(userDir, {
  executablePath: chromiumPath(),
  headless: !HEADED,
  viewport: { width: 1280, height: 900 },
  args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`],
});

try {
  const sw = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
  const extId = new URL(sw.url()).host;
  log('extension', extId);

  await context.route('https://x.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: mock }));

  // onInstalled opens the settings tab; close it so it can't steal focus.
  await new Promise((r) => setTimeout(r, 800));
  for (const p of context.pages()) if (p.url().includes('options.html')) await p.close();

  await sw.evaluate(async (key) => {
    await chrome.storage.sync.set({ enabled: true, autoCheck: true, threshold: 30, dailyCap: 50, showNoCap: true });
    await chrome.storage.local.set({ apiKey: '' });
    await chrome.storage.local.remove(['usage']);
  }, KEY);

  const page = context.pages()[0] || (await context.newPage());
  const states = () =>
    page.$$eval('article[data-testid="tweet"]', (arts) =>
      arts.map((a) => {
        const host = a.querySelector('.capchecker-host');
        const handle = [...a.querySelectorAll('[data-testid="User-Name"] a')].map((x) => x.textContent).find((t) => t.startsWith('@'));
        const wrap = host && host.shadowRoot.querySelector('.wrap');
        const btn = wrap && wrap.querySelector('[title]');
        return {
          handle,
          state: host ? host.dataset.state : null,
          text: wrap ? wrap.textContent.replace(/\s+/g, ' ').trim() : '',
          error: btn ? btn.getAttribute('title') : '',
        };
      })
    );
  const byHandle = async () => Object.fromEntries((await states()).map((s) => [s.handle, s]));

  // ---------- 1. pattern rules only, no key ----------
  await page.goto('https://x.com/home?theme=dark');
  await page.waitForFunction(() => document.querySelectorAll('.capchecker-host').length >= 9, null, { timeout: 15000 });
  let s = await byHandle();
  log('no key:', JSON.stringify(Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v.state]))));
  for (const h of FLAGGED) assert.equal(s[h].state, 'pattern', `${h} should be flagged`);
  for (const h of CALM) assert.equal(s[h].state, 'idle', `${h} should not be flagged`);
  assert.match(s['@pdf_below'].text, /Possible bait/);

  const pill = page.locator('article:has([href="/exit_liq_enjoyer"]) .capchecker-host');
  await pill.locator('button').click();
  await page.waitForFunction(() => document.querySelector('.capchecker-panel-host')?.shadowRoot.querySelector('.panel'));
  const panelText = await page.evaluate(() => document.querySelector('.capchecker-panel-host').shadowRoot.textContent);
  assert.match(panelText, /Undisclosed referral link/);
  assert.match(panelText, /\$218 into \$3,406/);
  assert.match(panelText, /Add key/);
  assert.equal(await page.evaluate(() => document.body.dataset.navigated || null), null, 'click leaked through to X');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(out, '1-pattern-panel-dark.png') });
  await page.keyboard.press('Escape');
  log('pattern panel ok, clicks stay inside the extension');

  // ---------- 2. light theme ----------
  await page.goto('https://x.com/home?theme=light');
  await page.waitForFunction(() => document.querySelectorAll('.capchecker-host').length >= 9);
  assert.equal(await page.evaluate(() => document.querySelector('.capchecker-host').dataset.theme), 'light');
  await page.screenshot({ path: path.join(out, '2-pattern-light.png') });
  log('light theme ok');

  // ---------- 3. settings and popup ----------
  const opts = await context.newPage();
  await opts.goto(`chrome-extension://${extId}/src/options/options.html`);
  await opts.waitForTimeout(800);
  await opts.screenshot({ path: path.join(out, '3-options.png'), fullPage: true });
  assert.ok((await opts.getAttribute('#ref-link', 'href')).includes('/r/HPMFL2363ULQ'));
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 300, height: 360 });
  await popup.goto(`chrome-extension://${extId}/src/popup/popup.html`);
  await popup.waitForTimeout(500);
  await popup.screenshot({ path: path.join(out, '4-popup.png') });
  assert.equal(await popup.isVisible('#noKey'), true);
  await popup.close();
  log('settings and popup ok');

  // ---------- 4. real AI checks ----------
  if (KEY) {
    await opts.fill('#apiKey', KEY);
    await opts.click('#saveKey');
    await opts.waitForSelector('#keyStatus.ok', { timeout: 20000 });
    log('key accepted:', (await opts.textContent('#keyStatus')).replace(/\d[\d,.]*/, '…'));
    await opts.close();

    await page.bringToFront();
    await page.goto('https://x.com/home?theme=dark');
    await page.waitForFunction(() => document.querySelectorAll('.capchecker-host').length >= 9);
    // Scroll so every flagged post enters the viewport and auto-checks.
    for (let y = 0; y <= 2400; y += 400) {
      await page.mouse.wheel(0, 400);
      await page.waitForTimeout(250);
    }
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll('.capchecker-host')].every((h) => !['checking', 'pattern'].includes(h.dataset.state)),
      null,
      { timeout: 120000 }
    );
    s = await byHandle();
    for (const [h, v] of Object.entries(s)) log('ai:', h.padEnd(14), v.state.padEnd(8), v.text.slice(0, 40), v.error);
    for (const h of ['@exit_liq_enjoyer', '@printer_go_brrr']) {
      assert.equal(s[h].state, 'verdict', `${h} should have an AI verdict`);
      assert.match(s[h].text, /CAP/, `${h} should be stamped`);
    }
    for (const h of FLAGGED) {
      const v = await sw.evaluate(async (id) => (await chrome.storage.local.get('v:' + id))['v:' + id], (await page.getAttribute(`article:has([href="/${h.slice(1)}"])`, 'data-capchecker-id')));
      log('   ', h, `cap ${v.score} bait ${v.bait}`, '|', v.summary);
    }

    const kera = page.locator('article:has([href="/pdf_below"])');
    await kera.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, 120));
    await page.waitForTimeout(300);
    await kera.locator('.capchecker-host button').click();
    await page.waitForFunction(() => document.querySelector('.capchecker-panel-host')?.shadowRoot.querySelector('.panel'));
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(out, '8-bait-panel-dark.png') });
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.scrollTo(0, 0));

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(out, '5-stamps-dark.png') });
    await page.locator('article:has([href="/exit_liq_enjoyer"]) .capchecker-host button').click();
    await page.waitForFunction(() => document.querySelector('.capchecker-panel-host')?.shadowRoot.querySelector('.panel'));
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(out, '6-verdict-panel-dark.png') });

    const usage = await sw.evaluate(async () => (await chrome.storage.local.get('usage')).usage);
    log('usage:', JSON.stringify(usage));

    if (DEEP) {
      const t0 = Date.now();
      await page.evaluate(() => {
        const btn = [...document.querySelector('.capchecker-panel-host').shadowRoot.querySelectorAll('button')].find((b) => /Deep check/.test(b.textContent));
        btn.click();
      });
      let verdict = null;
      while (Date.now() - t0 < 240000) {
        verdict = await sw.evaluate(async () => (await chrome.storage.local.get('v:1000000000000000003'))['v:1000000000000000003']);
        if (verdict && verdict.depth === 'deep') break;
        await page.waitForTimeout(2000);
      }
      assert.equal(verdict && verdict.depth, 'deep', 'deep check did not finish');
      log(`deep: ${verdict.score} in ${Math.round((Date.now() - t0) / 1000)}s, ${verdict.credits.toFixed(3)} credits`);
      for (const r of verdict.reasons) log('   -', r.title, '|', r.detail);
      log('   sources:', JSON.stringify(verdict.sources));
      await page.waitForTimeout(500);
      await page.locator('article:has([href="/exit_liq_enjoyer"]) .capchecker-host button').click();
      await page.waitForFunction(() => document.querySelector('.capchecker-panel-host')?.shadowRoot.querySelector('.panel'));
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(out, '7-deep-panel-dark.png') });
      const usage2 = await sw.evaluate(async () => (await chrome.storage.local.get('usage')).usage);
      log('usage after deep:', JSON.stringify(usage2));
    }
  } else {
    log('DARKWOODS_API_KEY not set, skipping AI checks');
  }

  console.log('E2E passed. Screenshots in test/e2e/out/');
} finally {
  await context.close();
  fs.rmSync(userDir, { recursive: true, force: true });
}
