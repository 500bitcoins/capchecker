(function () {
  'use strict';

  const { REFERRAL_URL, AUTHOR_URL } = globalThis.CapSettings;
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });

  function send(msg) {
    return new Promise((resolve) => chrome.runtime.sendMessage(msg, (res) => resolve(res || {})));
  }

  async function render() {
    const { usage, settings, hasKey } = await send({ type: 'status' });
    if (!usage) return;
    $('enabled').checked = settings.enabled;
    document.body.classList.toggle('off', !settings.enabled);
    $('noKey').hidden = hasKey;
    $('scanned').textContent = fmt(usage.scanned);
    $('flagged').textContent = fmt(usage.flagged);
    $('caps').textContent = fmt(usage.caps);
    $('baits').textContent = fmt(usage.baits || 0);
    $('spent').textContent = `${fmt(usage.credits)} / ${fmt(settings.dailyCap)} credits`;
    const pct = Math.min(100, (usage.credits / settings.dailyCap) * 100);
    $('meterFill').style.width = pct + '%';
    $('meterFill').className = pct >= 100 ? 'full' : pct >= 75 ? 'high' : '';
  }

  $('version').textContent = 'v' + chrome.runtime.getManifest().version;
  $('refLink').href = REFERRAL_URL;
  $('author').href = AUTHOR_URL;
  $('enabled').addEventListener('change', async () => {
    await chrome.storage.sync.set({ enabled: $('enabled').checked });
    render();
  });
  const openSettings = () => {
    chrome.runtime.openOptionsPage();
    window.close();
  };
  $('settings').addEventListener('click', openSettings);
  $('addKey').addEventListener('click', openSettings);

  render();
})();
