// Settings shared by every part of the extension. The API key is kept apart in
// chrome.storage.local so it never syncs to the user's Google account.
(function (root) {
  'use strict';

  const DEFAULTS = {
    enabled: true,
    autoCheck: true,
    threshold: 30,
    dailyCap: 50,
    quickModel: 'claude-haiku-5.5',
    deepModel: 'claude-opus-5.5',
    deepWebSearch: true,
    useFxtwitter: true,
    showNoCap: true,
    showBait: true,
  };

  const REFERRAL_URL = 'https://app.darkwoods.ai/r/HPMFL2363ULQ';
  const KEYS_URL = 'https://app.darkwoods.ai';
  const AUTHOR_URL = 'https://x.com/500altcoins';

  async function getSettings() {
    const s = await chrome.storage.sync.get(Object.keys(DEFAULTS));
    return { ...DEFAULTS, ...s };
  }

  const api = { DEFAULTS, REFERRAL_URL, KEYS_URL, AUTHOR_URL, getSettings };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CapSettings = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
