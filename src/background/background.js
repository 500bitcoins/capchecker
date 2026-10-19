// CapChecker service worker: runs AI checks against Darkwoods with the user's
// own key, enforces the daily credit cap, and caches verdicts by post ID.
importScripts(
  '/src/shared/rules.js',
  '/src/shared/verdict.js',
  '/src/shared/settings.js',
  '/src/background/prompts.js',
  '/src/background/darkwoods.js'
);

const { DEFAULTS, getSettings } = self.CapSettings;
const DW = self.Darkwoods;

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_MAX = 3000;
const QUICK_MAX_TOKENS = 1000;
const DEEP_MAX_TOKENS = 4000;
const DEEP_TOOL_ROUNDS = 3;
// What a deep check is expected to cost, for the daily cap. Real ones cost 4-9.5 credits
// (2026-10-19 logs); reserving the theoretical maximum (all 4,000 output tokens and 8 searches,
// about 15-18 credits) refused deep checks that would have fitted. A check that runs long can
// overshoot the cap by a few credits; the next one is then refused.
const DEEP_OUTPUT_ESTIMATE = 1500;
const DEEP_SEARCH_ESTIMATE = 4;
const WEB_SEARCH_PRICE = 0.85;
const QUICK_CONCURRENCY = 2;

// ---------- storage helpers ----------

const local = {
  get: (k) => chrome.storage.local.get(k),
  set: (o) => chrome.storage.local.set(o),
  remove: (k) => chrome.storage.local.remove(k),
};

async function apiKey() {
  const { apiKey } = await local.get('apiKey');
  return (apiKey || '').trim();
}

// The day the cap counts against, in the user's own time zone.
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function usage() {
  const { usage } = await local.get('usage');
  return usage && usage.day === today()
    ? usage
    : { day: today(), credits: 0, quick: 0, deep: 0, scanned: 0, flagged: 0, caps: 0, baits: 0 };
}

// Serialise usage writes so concurrent checks never lose an update.
let usageChain = Promise.resolve();
function updateUsage(fn) {
  usageChain = usageChain.then(async () => {
    const u = await usage();
    fn(u);
    await local.set({ usage: u });
    return u;
  });
  return usageChain;
}

// Credits promised to checks that are still running, so parallel checks can't
// overshoot the cap together.
let reserved = 0;

class BudgetError extends Error {
  constructor(used, cap, need) {
    super(
      used >= cap || need < 1
        ? `Daily cap reached (${used.toFixed(2)} of ${cap} credits). It resets at midnight, or raise it in CapChecker settings.`
        : `This check needs about ${Math.ceil(need)} credits and today's cap has ${Math.max(0, cap - used).toFixed(1)} left. Raise the daily cap in CapChecker settings, or try again after midnight.`
    );
    this.code = 'budget';
  }
}

async function reserve(estimate) {
  const [u, s] = await Promise.all([usage(), getSettings()]);
  if (u.credits + reserved + estimate > s.dailyCap) throw new BudgetError(u.credits + reserved, s.dailyCap, estimate);
  reserved += estimate;
  let released = false;
  return () => {
    if (!released) {
      released = true;
      reserved -= estimate;
    }
  };
}

const cacheKey = (id) => 'v:' + id;

async function cached(id) {
  const k = cacheKey(id);
  const got = await local.get([k, 'd:' + id]);
  if (got['d:' + id]) return { dismissed: true };
  const v = got[k];
  if (!v) return null;
  if (Date.now() - v.checkedAt > CACHE_TTL_MS || v.version !== self.CapPrompts.VERSION) {
    await local.remove(k);
    return null;
  }
  return v;
}

async function store(verdict) {
  verdict.version = self.CapPrompts.VERSION;
  await local.set({ [cacheKey(verdict.id)]: verdict });
  pruneSoon();
}

let pruneTimer = null;
function pruneSoon() {
  if (pruneTimer) return;
  pruneTimer = setTimeout(async () => {
    pruneTimer = null;
    const all = await chrome.storage.local.get(null);
    const entries = Object.entries(all).filter(([k]) => k.startsWith('v:'));
    if (entries.length <= CACHE_MAX) return;
    entries.sort((a, b) => a[1].checkedAt - b[1].checkedAt);
    await local.remove(entries.slice(0, entries.length - CACHE_MAX).map(([k]) => k));
  }, 5000);
}

// ---------- keep the worker alive during long checks ----------

let busy = 0;
let keepAlive = null;
function hold() {
  if (busy++ === 0) keepAlive = setInterval(() => chrome.runtime.getPlatformInfo(() => {}), 20000);
}
function release() {
  if (--busy === 0) clearInterval(keepAlive);
}

// ---------- quick-check queue ----------

let running = 0;
const waiting = [];
function slot() {
  if (running < QUICK_CONCURRENCY) {
    running++;
    return Promise.resolve();
  }
  return new Promise((resolve) => waiting.push(resolve));
}
function freeSlot() {
  const next = waiting.shift();
  if (next) next();
  else running--;
}

const inflight = new Map();
function once(key, fn) {
  if (!inflight.has(key)) inflight.set(key, fn().finally(() => inflight.delete(key)));
  return inflight.get(key);
}

// ---------- checks ----------

function unreadable(res) {
  const cut = res.finishReason === 'length';
  return Object.assign(new Error(cut ? 'The model ran out of room before finishing its answer' : 'The model reply could not be read'), { code: 'bad_reply' });
}

function estimate(price, chars, maxTokens, rounds = 1) {
  return DW.cost(price, (Math.ceil(chars / 4) + 600) * rounds, maxTokens);
}

async function quickCheck(post, heuristic) {
  const key = await apiKey();
  if (!key) throw Object.assign(new Error('Add your Darkwoods API key in CapChecker settings'), { code: 'no_key' });
  const s = await getSettings();
  const price = await DW.price(s.quickModel);
  const user = self.CapPrompts.postBlock(post, heuristic);
  const releaseBudget = await reserve(estimate(price, self.CapPrompts.QUICK.length + user.length, QUICK_MAX_TOKENS));
  await slot();
  hold();
  try {
    const body = {
      model: s.quickModel,
      temperature: 0,
      max_tokens: QUICK_MAX_TOKENS,
      // Hidden reasoning roughly doubles the cost of a quick check and can eat
      // the whole output budget before the JSON is written.
      reasoning: { enabled: false },
      messages: [
        { role: 'system', content: self.CapPrompts.QUICK },
        { role: 'user', content: user },
      ],
    };
    let res;
    try {
      res = await DW.chat(key, body, 60000);
    } catch (e) {
      if (e.status !== 400) throw e;
      delete body.reasoning; // a model that rejects the reasoning switch
      res = await DW.chat(key, body, 60000);
    }
    const credits = DW.cost(price, res.usage.prompt_tokens || 0, res.usage.completion_tokens || 0);
    await updateUsage((u) => {
      u.credits += credits;
      u.quick += 1;
    });
    const ai = self.CapVerdict.normalizeAi(self.CapVerdict.extractJson(res.content), 'ai');
    if (!ai) throw unreadable(res);
    return self.CapVerdict.build({ id: post.id, heuristic, ai, depth: 'quick', model: s.quickModel, credits });
  } finally {
    release();
    freeSlot();
    releaseBudget();
  }
}

// Optional extra context from the public fxtwitter API: author details, the
// full text of X Articles (the timeline only shows a card), and the author's
// own follow-up posts. Hype posts often put the link "below" in a self-reply.
async function fxJson(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function enrich(post) {
  const [status, thread] = await Promise.all([
    fxJson(`https://api.fxtwitter.com/${encodeURIComponent(post.handle || 'i')}/status/${post.id}`),
    fxJson(`https://api.fxtwitter.com/2/thread/${post.id}`),
  ]);
  const out = {};
  const t = status && status.tweet;
  if (t) {
    const a = t.author || {};
    out.author_profile = {
      followers: a.followers,
      following: a.following,
      joined: a.joined,
      bio: a.description,
      website: a.website && a.website.url,
      verified: a.verification && a.verification.verified,
    };
    out.full_text = t.text;
    out.views = t.views;
    if (t.community_note) out.community_note = t.community_note.text || true;
    if (t.article) {
      const blocks = (t.article.content && t.article.content.blocks) || [];
      out.article_title = t.article.title;
      out.article_text = blocks.map((b) => b.text).filter((x) => x && x.trim()).join('\n').slice(0, 8000);
      const ents = t.article.content && t.article.content.entityMap;
      const list = Array.isArray(ents) ? ents : Object.values(ents || {});
      out.article_links = [...new Set(list.map((e) => (e.value || e).data && (e.value || e).data.url).filter(Boolean))].slice(0, 20);
    }
    if (t.quote) out.quoted_full_text = t.quote.text;
  }
  const follow = ((thread && thread.thread) || [])
    .filter((x) => x && x.id !== post.id && (!post.handle || !x.author || x.author.screen_name === post.handle))
    .slice(0, 6)
    .map((x) => String(x.text || '').slice(0, 1500))
    .filter(Boolean);
  if (follow.length) out.author_thread = follow;
  return out;
}

async function deepCheck(post, heuristic) {
  const key = await apiKey();
  if (!key) throw Object.assign(new Error('Add your Darkwoods API key in CapChecker settings'), { code: 'no_key' });
  const s = await getSettings();
  const price = await DW.price(s.deepModel);
  hold();
  try {
    const extra = s.useFxtwitter ? await enrich(post) : {};
    const user = self.CapPrompts.postBlock(post, heuristic, extra);
    const tools = s.deepWebSearch ? ['web_search', 'fetch_url', 'calc', 'now'] : ['calc', 'now'];
    const est =
      estimate(price, self.CapPrompts.DEEP.length + user.length + 6000, DEEP_OUTPUT_ESTIMATE, DEEP_TOOL_ROUNDS) +
      (s.deepWebSearch ? DEEP_SEARCH_ESTIMATE * WEB_SEARCH_PRICE : 0);
    const releaseBudget = await reserve(est);
    try {
      const res = await DW.chat(
        key,
        {
          model: s.deepModel,
          temperature: 0,
          max_tokens: DEEP_MAX_TOKENS,
          builtin_tools: tools,
          max_tool_rounds: DEEP_TOOL_ROUNDS,
          messages: [
            { role: 'system', content: self.CapPrompts.DEEP },
            { role: 'user', content: user },
          ],
        },
        240000
      );
      const recorded = await DW.chargeFor(key, res.inferenceId);
      const credits = recorded ? recorded.credits : DW.cost(price, res.usage.prompt_tokens || 0, res.usage.completion_tokens || 0);
      await updateUsage((u) => {
        u.credits += credits;
        u.deep += 1;
      });
      const ai = self.CapVerdict.normalizeAi(self.CapVerdict.extractJson(res.content), 'deep');
      if (!ai) throw unreadable(res);
      return self.CapVerdict.build({ id: post.id, heuristic, ai, depth: 'deep', model: s.deepModel, credits });
    } finally {
      releaseBudget();
    }
  } finally {
    release();
  }
}

async function finish(verdict) {
  await store(verdict);
  const shown = self.CapVerdict.display(verdict);
  if (shown.key === 'cap') await updateUsage((u) => (u.caps += 1));
  else if (shown.key === 'bait') await updateUsage((u) => (u.baits = (u.baits || 0) + 1));
  return verdict;
}

function errorOut(e) {
  return { error: { code: e.code || 'error', message: e.message || String(e) } };
}

// ---------- messages ----------

const handlers = {
  async 'check:get'({ id }) {
    return { verdict: await cached(id) };
  },

  async 'check:quick'({ post, heuristic }) {
    const hit = await cached(post.id);
    if (hit && !hit.dismissed && hit.depth !== 'pattern') return { verdict: hit };
    return { verdict: await once('q:' + post.id, async () => finish(await quickCheck(post, heuristic))) };
  },

  async 'check:deep'({ post, heuristic }) {
    const hit = await cached(post.id);
    if (hit && hit.depth === 'deep') return { verdict: hit };
    return { verdict: await once('d:' + post.id, async () => finish(await deepCheck(post, heuristic))) };
  },

  async 'check:dismiss'({ id }) {
    await local.set({ ['d:' + id]: Date.now() });
    return { ok: true };
  },

  async 'check:undismiss'({ id }) {
    await local.remove('d:' + id);
    return { ok: true };
  },

  async 'stats:bump'({ scanned = 0, flagged = 0 }) {
    await updateUsage((u) => {
      u.scanned += scanned;
      u.flagged += flagged;
    });
    return { ok: true };
  },

  async status() {
    const [u, s, key] = await Promise.all([usage(), getSettings(), apiKey()]);
    return { usage: u, settings: s, hasKey: !!key };
  },

  async 'key:test'({ key }) {
    const k = (key || (await apiKey())).trim();
    if (!k) return { error: { code: 'no_key', message: 'No key entered' } };
    const me = await DW.me(k);
    return { ok: true, spendable: me && me.balance ? me.balance.spendable : null };
  },

  async models() {
    return { models: await DW.models() };
  },

  async 'cache:clear'() {
    const all = await chrome.storage.local.get(null);
    await local.remove(Object.keys(all).filter((k) => k.startsWith('v:') || k.startsWith('d:')));
    return { ok: true };
  },

  async 'open:options'() {
    await chrome.runtime.openOptionsPage();
    return { ok: true };
  },
};

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const fn = msg && handlers[msg.type];
  if (!fn) return false;
  fn(msg)
    .then(sendResponse)
    .catch((e) => sendResponse(errorOut(e)));
  return true;
});

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  const current = await chrome.storage.sync.get(null);
  await chrome.storage.sync.set({ ...DEFAULTS, ...current });
  if (reason === 'install') chrome.runtime.openOptionsPage();
});
