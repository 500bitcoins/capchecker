// Runs CapChecker's real checks on one X post from the command line, through
// the extension's own service worker. Needs DARKWOODS_API_KEY.
//   node scripts/check-post.mjs https://x.com/user/status/123 [--deep] [--cut]
// --cut hands the service worker only the first 280 characters, flagged as cut off at
// "Show more", the way long posts look on the timeline.
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromiumPath } from '../test/e2e/browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = process.argv.find((a) => /\/status\/\d+/.test(a));
const deep = process.argv.includes('--deep');
const cut = process.argv.includes('--cut');
if (!url || !process.env.DARKWOODS_API_KEY) {
  console.error('usage: DARKWOODS_API_KEY=dwk_... node scripts/check-post.mjs <x.com status url> [--deep]');
  process.exit(1);
}
const [, handle, id] = url.match(/x\.com\/([^/]+)\/status\/(\d+)/) || url.match(/twitter\.com\/([^/]+)\/status\/(\d+)/);

// Build the post the way the content script would see it on the timeline.
const t = (await (await fetch(`https://api.fxtwitter.com/${handle}/status/${id}`)).json()).tweet;
if (!t) throw new Error('post not found');
const urls = [...String(t.text).matchAll(/https?:\/\/\S+/g)].map((m) => m[0]);
const post = {
  id,
  handle,
  url: `https://x.com/${handle}/status/${id}`,
  text: cut ? String(t.text).slice(0, 280) : t.text,
  truncated: cut && String(t.text).length > 280,
  quoteText: t.quote ? t.quote.text : '',
  articleTitle: t.article ? t.article.title : '',
  cardText: '',
  links: urls.map((u) => ({ text: u.replace(/^https?:\/\//, ''), href: u })),
  hasVideo: !!(t.media && t.media.videos && t.media.videos.length),
  imageCount: (t.media && t.media.photos && t.media.photos.length) || 0,
};

const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'capchecker-cli-'));
const context = await chromium.launchPersistentContext(userDir, {
  executablePath: chromiumPath(),
  headless: true,
  args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`],
});
try {
  const sw = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
  const result = await sw.evaluate(
    async ({ post, key, deep }) => {
      await chrome.storage.local.set({ apiKey: key });
      await chrome.storage.sync.set({ dailyCap: 1000 });
      const heuristic = self.CapRules.scorePost(post);
      const run = async (type) => {
        const t0 = Date.now();
        try {
          const { verdict } = await handlers[type]({ post, heuristic });
          return { ...verdict, seconds: Math.round((Date.now() - t0) / 1000) };
        } catch (e) {
          return { error: e.message };
        }
      };
      return { heuristic, quick: await run('check:quick'), deep: deep ? await run('check:deep') : null };
    },
    { post, key: process.env.DARKWOODS_API_KEY, deep }
  );

  const show = (label, v) => {
    if (!v) return;
    if (v.error) return console.log(`\n${label}: error, ${v.error}`);
    console.log(`\n${label}: ${v.score} ${v.label} · ${v.credits.toFixed(3)} credits · ${v.seconds}s\n  ${v.summary}`);
    for (const r of v.reasons) console.log(`  - [${r.severity}] ${r.title}: ${r.detail}`);
    if (v.sources && v.sources.length) console.log('  sources: ' + v.sources.join(' '));
  };
  console.log(`@${handle} ${id}\npattern: ${result.heuristic.score} (${result.heuristic.reasons.map((r) => r.id).join(', ') || 'none'})`);
  show('quick', result.quick);
  show('deep', result.deep);
} finally {
  await context.close();
  fs.rmSync(userDir, { recursive: true, force: true });
}
