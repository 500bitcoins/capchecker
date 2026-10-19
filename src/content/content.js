// Watches the X timeline, scores each post with the pattern rules, asks the
// service worker for AI checks on suspicious ones, and draws the result.
(function () {
  'use strict';

  const { scorePost } = globalThis.CapRules;
  const { build } = globalThis.CapVerdict;
  const { DEFAULTS, getSettings } = globalThis.CapSettings;
  const UI = globalThis.CapUI;
  const { extractPost } = globalThis.CapExtract;

  let settings = { ...DEFAULTS };
  let hasKey = false;
  const posts = new Map(); // id -> { post, heuristic, verdict, state }
  const mounted = new WeakMap(); // article -> { id, ui }
  let pendingStats = { scanned: 0, flagged: 0 };

  // ---------- messaging ----------

  function send(msg) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(msg, (res) => {
          const err = chrome.runtime.lastError;
          if (err) return reject(new Error(err.message));
          if (res && res.error) return reject(Object.assign(new Error(res.error.message), { code: res.error.code }));
          resolve(res);
        });
      } catch (e) {
        reject(e); // extension was reloaded; this page's script is orphaned
      }
    });
  }

  setInterval(() => {
    if (!pendingStats.scanned && !pendingStats.flagged) return;
    const s = pendingStats;
    pendingStats = { scanned: 0, flagged: 0 };
    send({ type: 'stats:bump', ...s }).catch(() => {});
  }, 5000);

  // ---------- theme ----------

  function theme() {
    const m = getComputedStyle(document.body).backgroundColor.match(/\d+/g);
    if (!m) return 'light';
    const [r, g, b] = m.map(Number);
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (lum > 140) return 'light';
    return r + g + b < 30 ? 'dark' : 'dim';
  }

  // ---------- rendering ----------

  function draw(article, entry) {
    let m = mounted.get(article);
    if (!m || m.id !== entry.post.id || !m.ui.host.isConnected) {
      if (m) m.ui.host.remove();
      m = { id: entry.post.id, ui: UI.mount(article, theme()) };
      mounted.set(article, m);
    }
    m.ui.host.dataset.theme = theme();
    m.ui.host.dataset.state = entry.state.kind;
    UI.renderStamp(
      m.ui,
      { ...entry.state, showNoCap: settings.showNoCap, showBait: settings.showBait },
      (anchor) => openPanel(anchor, entry),
      () => runQuick(entry)
    );
  }

  function redraw(entry) {
    for (const article of document.querySelectorAll('article[data-testid="tweet"]')) {
      const m = mounted.get(article);
      if (m && m.id === entry.post.id) draw(article, entry);
    }
  }

  function setState(entry, state) {
    entry.state = state;
    redraw(entry);
  }

  function openPanel(anchor, entry) {
    const pattern = entry.state.kind === 'pattern' || (!entry.verdict && entry.state.kind === 'error');
    UI.openPanel(anchor, {
      theme: theme(),
      verdict: entry.verdict || build({ id: entry.post.id, heuristic: entry.heuristic }),
      pattern,
      hasKey,
      showBait: settings.showBait,
      onCheck: () => runQuick(entry, true),
      onDeep: () => runDeep(entry),
      onDismiss: () => {
        send({ type: 'check:dismiss', id: entry.post.id }).catch(() => {});
        setState(entry, { kind: 'none' });
      },
      onOptions: () => send({ type: 'open:options' }).catch(() => {}),
    });
  }

  // ---------- checks ----------

  async function runQuick(entry, throwErrors) {
    if (!hasKey) {
      setState(entry, { kind: 'error', code: 'no_key', message: 'Add your Darkwoods API key in CapChecker settings', verdict: entry.verdict });
      if (throwErrors) throw new Error('Add your Darkwoods API key in CapChecker settings');
      return;
    }
    setState(entry, { kind: 'checking' });
    try {
      const { verdict } = await send({ type: 'check:quick', post: entry.post, heuristic: entry.heuristic });
      entry.verdict = verdict;
      setState(entry, { kind: 'verdict', verdict });
    } catch (e) {
      setState(entry, { kind: 'error', code: e.code, message: e.message, verdict: entry.verdict });
      if (throwErrors) throw e;
    }
  }

  async function runDeep(entry) {
    const before = entry.state;
    setState(entry, { kind: 'checking' });
    try {
      const { verdict } = await send({ type: 'check:deep', post: entry.post, heuristic: entry.heuristic });
      entry.verdict = verdict;
      setState(entry, { kind: 'verdict', verdict });
    } catch (e) {
      setState(entry, before);
      throw e;
    }
  }

  // Auto checks only start once a flagged post is actually on screen.
  const seen = new IntersectionObserver(
    (items) => {
      for (const it of items) {
        if (!it.isIntersecting) continue;
        seen.unobserve(it.target);
        const id = it.target.dataset.capcheckerId;
        const entry = posts.get(id);
        if (entry && entry.state.kind === 'pattern' && settings.autoCheck && hasKey && settings.enabled) runQuick(entry);
      }
    },
    { rootMargin: '150px 0px' }
  );

  async function process(article) {
    const post = extractPost(article);
    if (!post) return;
    if (article.dataset.capcheckerId === post.id && mounted.get(article)?.ui.host.isConnected) return;
    article.dataset.capcheckerId = post.id;

    let entry = posts.get(post.id);
    if (entry) {
      draw(article, entry);
      return;
    }

    const heuristic = scorePost(post);
    entry = { post, heuristic, verdict: null, state: { kind: 'idle' } };
    posts.set(post.id, entry);
    pendingStats.scanned++;

    let stored = null;
    try {
      stored = (await send({ type: 'check:get', id: post.id })).verdict;
    } catch {
      stored = null;
    }

    if (stored && stored.dismissed) entry.state = { kind: 'none' };
    else if (stored) {
      entry.verdict = stored;
      entry.state = { kind: 'verdict', verdict: stored };
    } else if (heuristic.score >= settings.threshold) {
      pendingStats.flagged++;
      entry.state = { kind: 'pattern', verdict: build({ id: post.id, heuristic }) };
      seen.observe(article);
    }
    draw(article, entry);
  }

  function scan() {
    if (!settings.enabled) return;
    for (const article of document.querySelectorAll('article[data-testid="tweet"]')) process(article);
  }

  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      scan();
    }, 250);
  });

  function clearAll() {
    for (const el of document.querySelectorAll('.capchecker-host')) el.remove();
    for (const el of document.querySelectorAll('article[data-capchecker-id]')) delete el.dataset.capcheckerId;
    posts.clear();
  }

  // Idle "Cap?" pills only show while the pointer is over their post.
  function injectPageCss() {
    const style = document.createElement('style');
    style.textContent = 'article[data-testid="tweet"]:hover .capchecker-host, article[data-testid="tweet"]:focus-within .capchecker-host { --cc-idle: 1; }';
    document.documentElement.append(style);
  }

  async function refreshKey() {
    try {
      hasKey = (await send({ type: 'status' })).hasKey;
    } catch {
      hasKey = false;
    }
  }

  async function start() {
    settings = await getSettings();
    await refreshKey();
    injectPageCss();
    observer.observe(document.body, { childList: true, subtree: true });
    scan();

    chrome.storage.onChanged.addListener(async (changes, area) => {
      if (area === 'local' && changes.apiKey) await refreshKey();
      if (area !== 'sync') return;
      const was = settings;
      settings = await getSettings();
      if (
        was.enabled !== settings.enabled ||
        was.threshold !== settings.threshold ||
        was.showNoCap !== settings.showNoCap ||
        was.showBait !== settings.showBait
      ) {
        clearAll();
        scan();
      }
    });
  }

  start();
})();
