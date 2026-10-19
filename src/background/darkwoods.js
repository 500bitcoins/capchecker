// Minimal Darkwoods API client. Prices are credits per 1M tokens, the same unit
// as the account balance.
(function (root) {
  'use strict';

  const BASE = 'https://api.darkwoods.ai';
  const PRICE_TTL_MS = 6 * 60 * 60 * 1000;

  class DarkwoodsError extends Error {
    constructor(code, message, status) {
      super(message || code);
      this.code = code;
      this.status = status;
    }
  }

  async function request(path, { key, method = 'GET', body, timeoutMs = 30000 } = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res;
    try {
      res = await fetch(BASE + path, {
        method,
        headers: {
          ...(key ? { Authorization: 'Bearer ' + key } : {}),
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });
    } catch (e) {
      throw new DarkwoodsError(e.name === 'AbortError' ? 'timeout' : 'network', e.name === 'AbortError' ? 'Darkwoods took too long to answer' : 'Could not reach Darkwoods');
    } finally {
      clearTimeout(timer);
    }
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (!res.ok) {
      const err = (data && data.error) || {};
      throw new DarkwoodsError(err.code || 'http_' + res.status, err.message || 'Darkwoods error ' + res.status, res.status);
    }
    return { data, inferenceId: res.headers.get('x-inference-id') };
  }

  let priceCache = null;

  async function models() {
    if (priceCache && Date.now() - priceCache.at < PRICE_TTL_MS) return priceCache.list;
    const { data } = await request('/v1/models');
    const list = (data && data.data ? data.data : [])
      .filter((m) => m && m.id && m.pricing && m.pricing.input_per_1m != null)
      .map((m) => ({
        id: m.id,
        input: parseFloat(m.pricing.input_per_1m),
        output: parseFloat(m.pricing.output_per_1m),
      }))
      .filter((m) => isFinite(m.input) && isFinite(m.output));
    priceCache = { at: Date.now(), list };
    return list;
  }

  async function price(modelId) {
    const m = (await models()).find((x) => x.id === modelId);
    if (!m) throw new DarkwoodsError('model_not_found', `Model ${modelId} is not on Darkwoods`);
    return m;
  }

  function cost(p, promptTokens, completionTokens) {
    return (promptTokens * p.input + completionTokens * p.output) / 1e6;
  }

  async function chat(key, body, timeoutMs) {
    const { data, inferenceId } = await request('/v1/chat/completions', { key, method: 'POST', body, timeoutMs });
    const choice = (data && data.choices && data.choices[0]) || {};
    const content = choice.message ? choice.message.content : '';
    return { content: typeof content === 'string' ? content : '', usage: (data && data.usage) || {}, finishReason: choice.finish_reason, inferenceId };
  }

  async function me(key) {
    const { data } = await request('/me', { key });
    return data;
  }

  // The charge Darkwoods recorded for one inference. `charged` already
  // includes builtin tool calls (`tool_charge` is the part of it they cost).
  async function chargeFor(key, inferenceId) {
    if (!inferenceId) return null;
    try {
      const { data } = await request('/me/requests?limit=20', { key });
      const row = ((data && data.requests) || []).find((r) => r && r.id === inferenceId);
      const credits = row ? parseFloat(row.charged) : NaN;
      return isFinite(credits) ? { credits, toolCalls: row.tool_calls || 0 } : null;
    } catch {
      return null;
    }
  }

  const api = { BASE, DarkwoodsError, models, price, cost, chat, me, chargeFor };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Darkwoods = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
