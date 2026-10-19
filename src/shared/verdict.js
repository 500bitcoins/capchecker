// Turns pattern hits and model replies into one verdict: a 0-100 score, a tier,
// a short summary and up to six reasons. Shared by the content script, the
// service worker and the Node tests.
(function (root) {
  'use strict';

  const TIERS = [
    { min: 75, key: 'cap', label: 'CAP', title: 'Cap' },
    { min: 45, key: 'likely', label: 'CAP?', title: 'Probably cap' },
    { min: 20, key: 'unclear', label: 'Unclear', title: 'Unclear' },
    { min: 0, key: 'nocap', label: 'No cap', title: 'No cap' },
  ];

  // Bait is a separate score: how much a post is built to farm follows,
  // bookmarks and replies. A red CAP always wins; between CAP? and BAIT the
  // higher score wins.
  const BAIT = { key: 'bait', label: 'BAIT', title: 'Engagement bait' };
  const BAIT_MIN = 60;

  const MAX_REASONS = 6;
  const SEVERITIES = new Set(['high', 'medium', 'low']);

  function tierFor(score) {
    return TIERS.find((t) => score >= t.min) || TIERS[TIERS.length - 1];
  }

  function clampScore(n) {
    n = Math.round(Number(n));
    if (!isFinite(n)) return null;
    return Math.max(0, Math.min(100, n));
  }

  function text(s, max) {
    s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
  }

  // Pull the first complete JSON object out of a model reply, even when it is
  // wrapped in code fences or prose.
  function extractJson(reply) {
    const s = String(reply || '');
    const start = s.indexOf('{');
    if (start < 0) return null;
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = start; i < s.length; i++) {
      const c = s[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') inStr = true;
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) {
        try {
          return JSON.parse(s.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
    return null;
  }

  function severityFromWeight(w) {
    return w >= 0.3 ? 'high' : w >= 0.15 ? 'medium' : 'low';
  }

  function normalizeAi(obj, source) {
    if (!obj || typeof obj !== 'object') return null;
    const score = clampScore(obj.score);
    if (score == null) return null;
    const reasons = (Array.isArray(obj.reasons) ? obj.reasons : [])
      .map((r) => ({
        title: text(r && r.title, 70),
        detail: text(r && r.detail, 200),
        severity: SEVERITIES.has(r && r.severity) ? r.severity : 'medium',
        kind: r && r.kind === 'bait' ? 'bait' : 'cap',
        source,
      }))
      .filter((r) => r.title)
      .slice(0, 5);
    const sources = (Array.isArray(obj.sources) ? obj.sources : [])
      .map((u) => String(u || '').trim())
      .filter((u) => /^https?:\/\//i.test(u))
      .slice(0, 5);
    const bait = clampScore(obj.bait);
    return { score, bait: bait == null ? 0 : bait, summary: text(obj.summary, 240), reasons, sources };
  }

  function patternReasons(heuristic) {
    return (heuristic && heuristic.reasons ? heuristic.reasons : []).map((r) => ({
      title: r.title,
      detail: r.detail,
      severity: severityFromWeight(r.weight),
      kind: r.kind || 'cap',
      source: 'pattern',
    }));
  }

  // depth: 'pattern' (no AI yet), 'quick' or 'deep'.
  function build({ id, heuristic, ai, depth, model, credits }) {
    const h = heuristic || { score: 0, capScore: 0, baitScore: 0, reasons: [], injection: false };
    const patternCap = h.capScore != null ? h.capScore : h.score;
    let score = ai ? ai.score : patternCap;
    if (ai && h.injection) score = Math.max(score, patternCap);
    const bait = ai ? ai.bait : h.baitScore || 0;

    // The model already saw the pattern hits, so its reasons cover them. Pattern
    // reasons only fill in when the model gave fewer than two, plus the
    // injection warning, which always shows first.
    const patterns = patternReasons(h);
    let reasons;
    if (!ai) reasons = patterns;
    else {
      reasons = ai.reasons.slice();
      const seen = new Set(reasons.map((r) => r.title.toLowerCase()));
      for (const r of patterns) {
        if (reasons.length >= 2) break;
        if (!seen.has(r.title.toLowerCase())) reasons.push(r);
      }
      const inj = patterns.find((r) => r.title === 'Text aimed at AI checkers');
      if (h.injection && inj) reasons = [inj, ...reasons.filter((r) => r !== inj)];
    }

    const tier = tierFor(score);
    return {
      id,
      score,
      bait,
      tier: tier.key,
      label: tier.label,
      title: tier.title,
      summary: ai ? ai.summary : '',
      reasons: reasons.slice(0, MAX_REASONS),
      sources: ai ? ai.sources : [],
      patternScore: h.score,
      depth: ai ? depth : 'pattern',
      model: ai ? model : null,
      credits: ai ? credits : 0,
      checkedAt: Date.now(),
    };
  }

  // What to draw for a verdict: a stamp (CAP, CAP?, BAIT) or a small pill.
  function display(v, { showBait = true } = {}) {
    const tier = tierFor(v.score);
    const bait = v.bait || 0;
    if (tier.key === 'cap') return { stamp: true, key: tier.key, label: tier.label, title: tier.title, score: v.score };
    if (showBait && bait >= BAIT_MIN && bait >= v.score) return { stamp: true, ...BAIT, score: bait };
    if (tier.key === 'likely') return { stamp: true, key: tier.key, label: tier.label, title: tier.title, score: v.score };
    return { stamp: false, key: tier.key, label: tier.label, title: tier.title, score: v.score };
  }

  // Pattern-only label: whichever kind of signal is stronger.
  function patternLead(v) {
    return (v.bait || 0) > v.score ? { key: 'bait', title: 'Possible bait', score: v.bait } : { key: 'cap', title: 'Possible cap', score: v.score };
  }

  const api = { TIERS, BAIT, BAIT_MIN, tierFor, extractJson, normalizeAi, build, display, patternLead, clampScore };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CapVerdict = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
