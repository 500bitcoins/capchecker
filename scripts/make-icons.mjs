// Renders the toolbar and store icons from SVG with headless Chromium.
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromiumPath } from '../test/e2e/browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Large sizes: a rubber stamp. Small sizes: just the word, so it stays legible.
const large = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <rect x="4" y="4" width="120" height="120" rx="28" fill="#d61f2c"/>
  <g transform="rotate(-11 64 64)">
    <rect x="17" y="38" width="94" height="52" rx="9" fill="none" stroke="#fff" stroke-width="5"/>
    <text x="64" y="80" text-anchor="middle" font-family="Impact, 'Arial Black', sans-serif" font-size="42" fill="#fff" letter-spacing="1.5">CAP</text>
  </g>
</svg>`;

const small = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect x="0" y="0" width="32" height="32" rx="7" fill="#d61f2c"/>
  <text x="16" y="22.5" text-anchor="middle" font-family="Impact, 'Arial Black', sans-serif" font-size="15" fill="#fff" letter-spacing=".3">CAP</text>
</svg>`;

const browser = await chromium.launch({ executablePath: chromiumPath() });
const page = await browser.newPage();
for (const [size, svg] of [[16, small], [32, small], [48, large], [128, large]]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: path.join(root, 'icons', `icon${size}.png`), omitBackground: true });
}
await browser.close();
console.log('icons written');
