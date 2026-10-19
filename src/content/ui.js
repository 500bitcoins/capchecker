// The stamp on each post and the reasons panel. Everything renders inside
// shadow roots so X's styles and ours never touch.
(function (root) {
  'use strict';

  const REFERRAL_URL = root.CapSettings.REFERRAL_URL;
  const AUTHOR_URL = root.CapSettings.AUTHOR_URL;

  const INK_MASK =
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='90'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' seed='7'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -2.6 2.1'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

  const THEME_CSS = `
    :host { all: initial; }
    :host([data-theme="light"]) {
      --page: #ffffff; --text: #0f1419; --muted: #536471; --line: #eff3f4; --panel: #ffffff; --panel-line: #e6ecf0;
      --cap: #d61f2c; --likely: #c2410c; --bait: #a16207; --nocap: #15803d; --unclear: #536471; --accent: #0f1419; --accent-text: #ffffff;
      --shadow: 0 10px 40px rgba(15, 20, 25, .18), 0 2px 8px rgba(15, 20, 25, .08);
    }
    :host([data-theme="dim"]) {
      --page: #15202b; --text: #f7f9f9; --muted: #8b98a5; --line: #38444d; --panel: #1e2732; --panel-line: #38444d;
      --cap: #ff4a55; --likely: #fb923c; --bait: #facc15; --nocap: #4ade80; --unclear: #8b98a5; --accent: #f7f9f9; --accent-text: #0f1419;
      --shadow: 0 10px 40px rgba(0, 0, 0, .5), 0 0 0 1px rgba(255, 255, 255, .04);
    }
    :host([data-theme="dark"]) {
      --page: #000000; --text: #e7e9ea; --muted: #71767b; --line: #2f3336; --panel: #16181c; --panel-line: #2f3336;
      --cap: #ff4a55; --likely: #fb923c; --bait: #facc15; --nocap: #4ade80; --unclear: #71767b; --accent: #eff3f4; --accent-text: #0f1419;
      --shadow: 0 10px 40px rgba(0, 0, 0, .7), 0 0 0 1px rgba(255, 255, 255, .06);
    }
    * { box-sizing: border-box; }
    button { font: inherit; }
  `;

  const STAMP_CSS = `
    ${THEME_CSS}
    .wrap {
      position: absolute; top: 46px; right: 18px; z-index: 3;
      font-family: TwitterChirp, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex; justify-content: flex-end; pointer-events: none;
    }

    .stamp {
      all: unset; cursor: pointer; position: relative; pointer-events: auto;
      display: inline-flex; flex-direction: column; align-items: center;
      padding: 6px 16px 7px; border: 3px solid currentColor; border-radius: 10px;
      outline: 2px solid currentColor; outline-offset: 3px;
      background: color-mix(in srgb, var(--page) 72%, transparent);
      transform: rotate(-11deg); transform-origin: center;
      -webkit-mask-image: ${INK_MASK}; mask-image: ${INK_MASK};
      -webkit-mask-size: 160px 90px; mask-size: 160px 90px;
      animation: thump .28s cubic-bezier(.2, 1.6, .4, 1) both;
      transition: transform .15s ease;
    }
    .stamp:hover { transform: rotate(-11deg) scale(1.04); }
    .stamp:focus-visible { outline-color: var(--text); }
    .stamp .word {
      font-family: Impact, Haettenschweiler, "Arial Narrow Bold", "Arial Black", sans-serif;
      letter-spacing: .05em; line-height: .9; text-transform: uppercase;
    }
    .stamp .meta {
      margin-top: 4px; font-size: 10px; font-weight: 800; letter-spacing: .16em; line-height: 1;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .stamp.cap { color: var(--cap); }
    .stamp.cap .word { font-size: 46px; }
    .stamp.likely { color: var(--likely); padding: 5px 12px 6px; }
    .stamp.likely .word { font-size: 32px; }
    .stamp.bait { color: var(--bait); padding: 5px 12px 6px; }
    .stamp.bait .word { font-size: 34px; }
    @keyframes thump {
      from { opacity: 0; transform: rotate(-11deg) scale(1.6); }
      to { opacity: 1; transform: rotate(-11deg) scale(1); }
    }

    .pill {
      all: unset; cursor: pointer; pointer-events: auto; display: inline-flex; align-items: center; gap: 6px;
      height: 26px; padding: 0 11px; border-radius: 999px;
      font-size: 13px; font-weight: 600; line-height: 1; white-space: nowrap;
      color: var(--muted); background: var(--page); border: 1px solid var(--line);
      transition: background .15s ease, border-color .15s ease, opacity .15s ease;
    }
    .pill:hover { border-color: var(--muted); }
    .pill:focus-visible { outline: 2px solid var(--text); outline-offset: 2px; }
    .pill .dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
    .pill.nocap { color: var(--nocap); }
    .pill.unclear { color: var(--unclear); }
    .pill.pattern { color: var(--likely); border-color: color-mix(in srgb, var(--likely) 45%, transparent); }
    .pill.pattern.bait { color: var(--bait); border-color: color-mix(in srgb, var(--bait) 45%, transparent); }
    .pill.error { color: var(--cap); border-color: color-mix(in srgb, var(--cap) 40%, transparent); }
    .pill.idle { opacity: var(--cc-idle, 0); }
    .pill.idle:focus-visible { opacity: 1; }
    .pill .num { color: var(--text); font-variant-numeric: tabular-nums; }
    .spin {
      width: 12px; height: 12px; border-radius: 50%;
      border: 2px solid color-mix(in srgb, currentColor 30%, transparent); border-top-color: currentColor;
      animation: spin .8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) { .stamp { animation: none; } .spin { animation-duration: 2s; } }
  `;

  const PANEL_CSS = `
    ${THEME_CSS}
    .panel {
      position: fixed; z-index: 2147483000; width: 344px; max-width: calc(100vw - 24px);
      max-height: min(660px, calc(100vh - 24px)); overflow: auto;
      background: var(--panel); color: var(--text); border: 1px solid var(--panel-line); border-radius: 16px;
      box-shadow: var(--shadow); padding: 16px 16px 12px;
      font-family: TwitterChirp, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 14px; line-height: 1.4; animation: rise .14s ease-out both;
    }
    @keyframes rise { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
    @media (prefers-reduced-motion: reduce) { .panel { animation: none; } }
    header { display: flex; align-items: center; gap: 12px; }
    .score { font-size: 34px; font-weight: 800; line-height: 1; font-variant-numeric: tabular-nums; letter-spacing: -.02em; }
    .score small { font-size: 13px; font-weight: 600; color: var(--muted); letter-spacing: 0; margin-left: 2px; }
    .head { flex: 1; min-width: 0; }
    .verdict { font-size: 17px; font-weight: 800; }
    .sub { font-size: 12px; color: var(--muted); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .close {
      all: unset; cursor: pointer; width: 30px; height: 30px; border-radius: 50%;
      display: grid; place-items: center; color: var(--muted); align-self: flex-start;
    }
    .close:hover { background: var(--line); color: var(--text); }
    .close:focus-visible { outline: 2px solid var(--text); }
    .t-cap { color: var(--cap); } .t-likely { color: var(--likely); }
    .t-unclear { color: var(--unclear); } .t-nocap { color: var(--nocap); } .t-bait { color: var(--bait); }
    .meters { display: grid; gap: 6px; margin: 14px 0 12px; }
    .meter { display: grid; grid-template-columns: 34px 1fr 26px; align-items: center; gap: 8px; font-size: 12px; color: var(--muted); }
    .meter .m-num { text-align: right; font-variant-numeric: tabular-nums; color: var(--text); font-weight: 700; }
    .meter .bar { margin: 0; }
    .src.kind-bait { color: var(--bait); border-color: color-mix(in srgb, var(--bait) 45%, transparent); }
    .bar { position: relative; height: 6px; border-radius: 3px; background: var(--line); overflow: hidden; }
    .bar span { position: absolute; inset: 0 auto 0 0; border-radius: 3px; background: currentColor; }
    .summary { margin: 0 0 12px; }
    .reasons { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
    .reasons li { display: grid; grid-template-columns: 10px 1fr; gap: 10px; }
    .reasons .dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 6px; background: var(--unclear); }
    .reasons .high .dot { background: var(--cap); }
    .reasons .medium .dot { background: var(--likely); }
    .r-title { font-weight: 700; }
    .r-detail { color: var(--muted); font-size: 13px; margin-top: 1px; overflow-wrap: anywhere; }
    .src {
      display: inline-block; margin-left: 6px; padding: 1px 6px; border-radius: 999px; vertical-align: 1px;
      font-size: 10px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase;
      color: var(--muted); border: 1px solid var(--panel-line);
    }
    .sources { margin-top: 12px; font-size: 12px; color: var(--muted); display: flex; flex-wrap: wrap; gap: 4px 10px; }
    .sources a { color: var(--text); text-decoration: none; border-bottom: 1px solid var(--panel-line); }
    .sources a:hover { border-bottom-color: var(--text); }
    .note { margin-top: 14px; padding: 12px; border-radius: 12px; background: var(--line); font-size: 13px; }
    .note p { margin: 0 0 10px; }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
    .btn {
      all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
      height: 34px; padding: 0 14px; border-radius: 999px; font-size: 14px; font-weight: 700;
      border: 1px solid var(--panel-line); color: var(--text);
    }
    .btn:hover { background: var(--line); }
    .btn.primary { background: var(--accent); color: var(--accent-text); border-color: var(--accent); }
    .btn.primary:hover { opacity: .88; background: var(--accent); }
    .btn[disabled] { opacity: .5; pointer-events: none; }
    .btn:focus-visible { outline: 2px solid var(--text); outline-offset: 2px; }
    .btn .cost { font-weight: 500; opacity: .75; }
    .btn .spin {
      width: 12px; height: 12px; border-radius: 50%;
      border: 2px solid color-mix(in srgb, currentColor 30%, transparent); border-top-color: currentColor;
      animation: spin .8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .err { margin-top: 10px; font-size: 13px; color: var(--cap); }
    footer {
      display: flex; justify-content: space-between; gap: 8px; margin-top: 14px; padding-top: 10px;
      border-top: 1px solid var(--panel-line); font-size: 12px; color: var(--muted);
    }
    footer a { color: var(--muted); text-decoration: none; }
    footer a:hover { color: var(--text); }
  `;

  const DEPTH_LABEL = { pattern: 'Pattern check', quick: 'Quick check', deep: 'Deep check' };
  const SOURCE_LABEL = { pattern: 'Pattern', ai: 'AI', deep: 'Deep' };

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }

  // Stop clicks inside our UI from reaching X, which would open the post.
  function shield(el) {
    for (const t of ['click', 'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'keydown', 'auxclick']) {
      el.addEventListener(t, (e) => e.stopPropagation());
    }
  }

  function fmtCredits(n) {
    if (!n) return '0 credits';
    if (n < 0.01) return '<0.01 credits';
    return (n < 10 ? n.toFixed(2) : n.toFixed(1)) + ' credits';
  }

  function hostname(u) {
    try {
      return new URL(u).hostname.replace(/^www\./, '');
    } catch {
      return u;
    }
  }

  // ---------- per-post stamp ----------

  function mount(article, theme) {
    const host = document.createElement('div');
    host.className = 'capchecker-host';
    host.dataset.theme = theme;
    host.style.cssText = 'position:absolute;top:0;right:0;width:0;height:0;z-index:3;';
    shield(host);
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.append(h('style', null, STAMP_CSS));
    const wrap = h('div', { class: 'wrap' });
    shadow.append(wrap);
    article.append(host);
    return { host, wrap };
  }

  function renderStamp(mounted, state, onOpen, onCheck) {
    const { wrap } = mounted;
    wrap.replaceChildren();
    const v = state.verdict;
    let el = null;
    switch (state.kind) {
      case 'verdict': {
        const d = root.CapVerdict.display(v, { showBait: state.showBait });
        const label = `${d.title}, score ${d.score} of 100. Show reasons`;
        if (d.stamp) {
          el = h(
            'button',
            { class: 'stamp ' + d.key, 'aria-label': label, onclick: (e) => onOpen(e.currentTarget) },
            h('span', { class: 'word' }, d.label),
            h('span', { class: 'meta' }, 'SCORE ' + d.score)
          );
        } else if (d.key === 'unclear' || state.showNoCap) {
          el = h(
            'button',
            { class: 'pill ' + d.key, 'aria-label': label, onclick: (e) => onOpen(e.currentTarget) },
            h('span', { class: 'dot' }),
            d.title,
            h('span', { class: 'num' }, d.score)
          );
        }
        break;
      }
      case 'pattern': {
        const lead = root.CapVerdict.patternLead(v);
        el = h(
          'button',
          { class: 'pill pattern ' + lead.key, 'aria-label': `${lead.title}, pattern score ${lead.score}. Show reasons`, onclick: (e) => onOpen(e.currentTarget) },
          h('span', { class: 'dot' }),
          lead.title,
          h('span', { class: 'num' }, lead.score)
        );
        break;
      }
      case 'checking':
        el = h('span', { class: 'pill', role: 'status' }, h('span', { class: 'spin' }), 'Checking');
        break;
      case 'error':
        el = h(
          'button',
          { class: 'pill error', title: state.message, onclick: (e) => (state.verdict ? onOpen(e.currentTarget) : onCheck()) },
          state.code === 'budget' ? 'Daily cap reached' : state.code === 'no_key' ? 'Add Darkwoods key' : 'Check failed · retry'
        );
        break;
      case 'idle':
        el = h('button', { class: 'pill idle', 'aria-label': 'Check this post for cap', onclick: () => onCheck() }, 'Cap?');
        break;
    }
    if (el) wrap.append(el);
  }

  // ---------- reasons panel (one at a time, fixed to the viewport) ----------

  let panelHost = null;
  let panelShadow = null;
  let closePanel = null;

  function ensurePanelHost(theme) {
    if (!panelHost || !panelHost.isConnected) {
      panelHost = document.createElement('div');
      panelHost.className = 'capchecker-panel-host';
      shield(panelHost);
      panelShadow = panelHost.attachShadow({ mode: 'open' });
      document.documentElement.append(panelHost);
    }
    panelHost.dataset.theme = theme;
    return panelShadow;
  }

  function openPanel(anchor, ctx) {
    if (closePanel) closePanel();
    const shadow = ensurePanelHost(ctx.theme);
    const v = ctx.verdict;
    const shown = ctx.pattern ? root.CapVerdict.patternLead(v) : root.CapVerdict.display(v, { showBait: ctx.showBait });
    const tierClass = 't-' + (ctx.pattern ? (shown.key === 'bait' ? 'bait' : 'likely') : shown.key);
    const capClass = 't-' + root.CapVerdict.tierFor(v.score).key;
    const baitClass = (v.bait || 0) >= 30 ? 't-bait' : 't-unclear';
    const sub = ctx.pattern
      ? 'Pattern check · no AI used yet'
      : [DEPTH_LABEL[v.depth], v.model && v.model.replace(/^claude-/, ''), fmtCredits(v.credits)].filter(Boolean).join(' · ');

    const errBox = h('div', { class: 'err', role: 'alert', hidden: true });
    const actions = h('div', { class: 'actions' });

    const busy = (btn, label) => {
      btn.disabled = true;
      btn.replaceChildren(h('span', { class: 'spin' }), label);
    };
    const fail = (e) => {
      errBox.hidden = false;
      errBox.textContent = e && e.message ? e.message : 'Something went wrong';
    };

    if (ctx.hasKey && (ctx.pattern || v.depth !== 'deep')) {
      if (ctx.pattern) {
        const quick = h('button', { class: 'btn primary', onclick: () => { busy(quick, 'Checking'); ctx.onCheck().then(close, fail); } },
          'Run AI check', h('span', { class: 'cost' }, '~0.05 credits'));
        actions.append(quick);
      }
      const deep = h('button', { class: 'btn' + (ctx.pattern ? '' : ' primary'), onclick: () => { busy(deep, 'Deep checking, up to a minute'); ctx.onDeep().then(close, fail); } },
        'Deep check', h('span', { class: 'cost' }, '~5–15 credits'));
      actions.append(deep);
    }
    if (!ctx.pattern && shown.key !== 'nocap') {
      actions.append(h('button', { class: 'btn', onclick: () => { ctx.onDismiss(); close(); } }, shown.key === 'bait' ? 'Not bait' : 'Not cap'));
    }

    const keyNote = ctx.hasKey
      ? null
      : h(
          'div',
          { class: 'note' },
          h('p', null, 'Run AI checks with your own Darkwoods API key. You pay per check from your Darkwoods credits, about 0.05 credits for a quick check.'),
          h(
            'div',
            { class: 'actions', style: 'margin-top:0' },
            h('button', { class: 'btn primary', onclick: () => { ctx.onOptions(); close(); } }, 'Add key'),
            h('a', { class: 'btn', href: REFERRAL_URL, target: '_blank', rel: 'noopener noreferrer' }, 'Get Darkwoods', h('span', { class: 'cost' }, 'referral link'))
          )
        );

    const panel = h(
      'div',
      { class: 'panel', role: 'dialog', 'aria-label': 'CapChecker verdict', tabindex: '-1' },
      h(
        'header',
        null,
        h('div', { class: 'score ' + tierClass }, String(shown.score), h('small', null, '/100')),
        h('div', { class: 'head' }, h('div', { class: 'verdict ' + tierClass }, shown.title), h('div', { class: 'sub' }, sub)),
        h('button', { class: 'close', 'aria-label': 'Close', onclick: () => close() }, '✕')
      ),
      h(
        'div',
        { class: 'meters' },
        h('div', { class: 'meter' }, h('span', null, 'Cap'), h('div', { class: 'bar ' + capClass }, h('span', { style: `width:${Math.max(2, v.score)}%` })), h('span', { class: 'm-num' }, v.score)),
        h('div', { class: 'meter' }, h('span', null, 'Bait'), h('div', { class: 'bar ' + baitClass }, h('span', { style: `width:${Math.max(2, v.bait || 0)}%` })), h('span', { class: 'm-num' }, v.bait || 0))
      ),
      v.summary ? h('p', { class: 'summary' }, v.summary) : null,
      v.reasons.length
        ? h(
            'ul',
            { class: 'reasons' },
            v.reasons.slice(0, 5).map((r) =>
              h(
                'li',
                { class: r.severity },
                h('span', { class: 'dot' }),
                h(
                  'div',
                  null,
                  h(
                    'div',
                    { class: 'r-title' },
                    r.title,
                    h('span', { class: 'src' }, SOURCE_LABEL[r.source] || 'AI'),
                    r.kind === 'bait' ? h('span', { class: 'src kind-bait' }, 'Bait') : null
                  ),
                  r.detail ? h('div', { class: 'r-detail' }, r.detail) : null
                )
              )
            )
          )
        : h('p', { class: 'summary' }, 'Nothing suspicious found.'),
      v.sources && v.sources.length
        ? h('div', { class: 'sources' }, 'Sources', v.sources.map((u) => h('a', { href: u, target: '_blank', rel: 'noopener noreferrer' }, hostname(u))))
        : null,
      keyNote,
      actions.childElementCount ? actions : null,
      errBox,
      h('footer', null, h('span', null, 'Automated opinion, can be wrong'), h('a', { href: AUTHOR_URL, target: '_blank', rel: 'noopener noreferrer' }, 'by @500altcoins'))
    );

    shadow.replaceChildren(h('style', null, PANEL_CSS), panel);
    place(panel, anchor);
    panel.focus({ preventScroll: true });

    const startY = window.scrollY;
    const onScroll = () => { if (Math.abs(window.scrollY - startY) > 60) close(); };
    const onDown = (e) => { if (!e.composedPath().includes(panelHost) && !e.composedPath().includes(anchor)) close(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    const onResize = () => place(panel, anchor);
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onResize);

    function close() {
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', onResize);
      shadow.replaceChildren();
      if (closePanel === close) closePanel = null;
    }
    closePanel = close;
  }

  function place(panel, anchor) {
    const r = anchor.getBoundingClientRect();
    const w = panel.offsetWidth;
    const hgt = panel.offsetHeight;
    const gap = 10;
    let left = Math.min(window.innerWidth - w - 12, r.right - w + 8);
    left = Math.max(12, left);
    let top = r.bottom + gap;
    if (top + hgt > window.innerHeight - 12 && r.top - gap - hgt > 12) top = r.top - gap - hgt;
    top = Math.max(12, Math.min(top, window.innerHeight - hgt - 12));
    panel.style.left = left + 'px';
    panel.style.top = top + 'px';
  }

  root.CapUI = { mount, renderStamp, openPanel, fmtCredits };
})(globalThis);
