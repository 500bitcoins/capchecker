(function () {
  'use strict';

  const { DEFAULTS, REFERRAL_URL, KEYS_URL, AUTHOR_URL, getSettings } = globalThis.CapSettings;
  const $ = (id) => document.getElementById(id);

  const TOGGLES = ['enabled', 'autoCheck', 'showBait', 'showNoCap', 'deepWebSearch', 'useFxtwitter'];

  function send(msg) {
    return new Promise((resolve) => chrome.runtime.sendMessage(msg, (res) => resolve(res || {})));
  }

  function setStatus(el, text, kind) {
    el.textContent = text;
    el.className = 'status' + (el.classList.contains('inline') ? ' inline' : '') + (kind ? ' ' + kind : '');
  }

  function fmt(n) {
    return Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
  }

  async function loadModels(s) {
    const res = await send({ type: 'models' });
    const list = (res.models || []).slice().sort((a, b) => a.input - b.input);
    for (const [id, current] of [['quickModel', s.quickModel], ['deepModel', s.deepModel]]) {
      const sel = $(id);
      sel.replaceChildren();
      const ids = list.length ? list : [{ id: current, input: NaN, output: NaN }];
      for (const m of ids) {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = isFinite(m.input) ? `${m.id} · ${fmt(m.input)}/${fmt(m.output)} per 1M` : m.id;
        sel.append(opt);
      }
      sel.value = current;
    }
  }

  async function showUsage() {
    const { usage, settings } = await send({ type: 'status' });
    if (!usage) return;
    const pct = Math.min(100, (usage.credits / settings.dailyCap) * 100);
    const fill = $('meterFill');
    fill.style.width = pct + '%';
    fill.className = pct >= 100 ? 'full' : pct >= 75 ? 'high' : '';
    $('usageText').textContent = `Today: ${fmt(usage.credits)} of ${fmt(settings.dailyCap)} credits · ${usage.quick} quick and ${usage.deep} deep checks · ${usage.caps} cap and ${usage.baits || 0} bait found`;
  }

  async function testKey(key) {
    const status = $('keyStatus');
    setStatus(status, 'Testing…');
    const res = await send({ type: 'key:test', key });
    if (res.ok) setStatus(status, `Connected. Spendable balance: ${fmt(res.spendable)} credits.`, 'ok');
    else setStatus(status, res.error ? res.error.message : 'Could not reach Darkwoods', 'bad');
  }

  async function init() {
    $('version').textContent = 'v' + chrome.runtime.getManifest().version;
    $('kw-link').href = KEYS_URL;
    $('ref-link').href = REFERRAL_URL;
    $('author-link').href = AUTHOR_URL;

    const s = await getSettings();
    for (const id of TOGGLES) {
      $(id).checked = !!s[id];
      $(id).addEventListener('change', () => chrome.storage.sync.set({ [id]: $(id).checked }));
    }
    $('threshold').value = String(s.threshold);
    $('threshold').addEventListener('change', () => chrome.storage.sync.set({ threshold: Number($('threshold').value) }));

    $('dailyCap').value = s.dailyCap;
    $('dailyCap').addEventListener('change', async () => {
      const v = Math.max(1, Math.min(10000, Math.round(Number($('dailyCap').value) || DEFAULTS.dailyCap)));
      $('dailyCap').value = v;
      await chrome.storage.sync.set({ dailyCap: v });
      showUsage();
    });

    for (const id of ['quickModel', 'deepModel']) {
      $(id).addEventListener('change', () => chrome.storage.sync.set({ [id]: $(id).value }));
    }
    loadModels(s);

    const { apiKey } = await chrome.storage.local.get('apiKey');
    $('apiKey').value = apiKey || '';
    if (apiKey) testKey(apiKey);

    $('toggleKey').addEventListener('click', () => {
      const show = $('apiKey').type === 'password';
      $('apiKey').type = show ? 'text' : 'password';
      $('toggleKey').textContent = show ? 'Hide' : 'Show';
      $('toggleKey').setAttribute('aria-label', show ? 'Hide key' : 'Show key');
    });

    $('saveKey').addEventListener('click', async () => {
      const key = $('apiKey').value.trim();
      if (key && !key.startsWith('dwk_')) {
        setStatus($('keyStatus'), 'Darkwoods API keys start with dwk_', 'bad');
        return;
      }
      await chrome.storage.local.set({ apiKey: key });
      if (key) testKey(key);
      else setStatus($('keyStatus'), 'Key removed.');
    });

    $('clearCache').addEventListener('click', async () => {
      await send({ type: 'cache:clear' });
      setStatus($('cacheStatus'), 'Cleared.', 'ok');
    });

    showUsage();
  }

  init();
})();
