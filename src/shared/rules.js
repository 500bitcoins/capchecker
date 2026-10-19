// Pattern rules that score a post before any AI call. Each rule that fires adds
// a reason and a weight; weights combine as 1 - Π(1 - w), so several weak signals
// add up but the score never passes 100. Shared by the content script, the
// service worker and the Node tests.
(function (root) {
  'use strict';

  const NUMWORD = String.raw`(?:\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)`;
  const FILLER = String.raw`(?:(?:just|only|fuck\w*)\s+)?`;
  const AMOUNT = String.raw`\$\s?(\d[\d,]*(?:\.\d+)?)\s?([kmb])?(?![\w.])`;
  const ARROW = String.raw`\s*(?:→|->|=>|➡️?|⟶|into|to|became|grew\s+(?:in)?to|turned\s+into|is\s+now)\s*`;

  const RE = {
    multiply: new RegExp(AMOUNT + ARROW + AMOUNT, 'gi'),
    timeframe: new RegExp(
      [
        String.raw`\b(?:in|within|after|over|under|took)\s+${FILLER}${NUMWORD}\s+${FILLER}(?:hours?|hrs?|days?|nights?|weeks?|minutes?|mins?)\b`,
        String.raw`\b${NUMWORD}\s+(?:hours?|hrs?|days?|weeks?)\s+later\b`,
        String.raw`\bovernight\b`,
        String.raw`\bwhile\s+i\s+(?:slept|was\s+(?:asleep|sleeping))\b`,
        String.raw`\bbefore\s+breakfast\b`,
        String.raw`\bin\s+my\s+sleep\b`,
      ].join('|'),
      'i'
    ),
    refUrl: [
      /[?&](?:r|ref|refcode|referral|referrer|invite|inv|aff|affiliate|via|promo)=[\w-]+/i,
      /\/(?:r|ref|invite|referral|aff)\/[\w-]{3,}/i,
      /\blink\.affiliatenetwork\.com\b/i,
    ],
    refExempt: /\breddit\.com\/r\//i,
    refText:
      /\b(?:sign\s*up|register|join)\s+(?:using|with|via|through)\s+(?:this|my)\s+link\b|\buse\s+(?:my|this)\s+(?:link|code)\b|\bcode\s+["“']?\w+["”']?\s+for\s+\d+%|\bget\s+\d+%\s+off\b|\bdiscount\s+applies\b/i,
    disclosed:
      /#ad\b|#sponsored\b|\b(?:ref(?:erral)?|affiliate)\s+link\b|\bi\s+(?:earn|get|receive)\s+(?:a\s+)?(?:commission|cut|share|referral)\b|\bpaid\s+partnership\b|\bsponsored\s+by\b/i,
    hype: [
      /\bwho\s+the\s+fuck\s+built\s+this\b/i,
      /\bthis\s+(?:must|should)\s+be\s+(?:fuck\w*\s+)?illegal\b/i,
      /\b(?:it'?s|it\s+is)\s+(?:becoming|getting)\s+(?:fuck\w*\s+)?dangerous\b/i,
      /\bholy\s+(?:fuck|shit|sh\*t)\b/i,
      /\b(?:engineer|insider|employee|dev)\s+(?:just\s+)?leaked\b/i,
      /\bnobody\s+(?:is\s+)?talking\s+about\s+(?:this|it)\b/i,
      /\bi\s+can'?t\s+believe\s+(?:this|it)\s+(?:is|was)\s+free\b/i,
      /\bthis\s+changes\s+everything\b/i,
      /\babso?l?o?u?te?\s+masterclass\b/i,
      /\bthis\s+(?:ai|model|bot|agent|tool)\s+is\s+(?:a\s+|an\s+)?(?:fuck\w*\s+)?(?:artist|genius|beast|monster|cheat\s*code|cracked)\b/i,
      /\bthis\s+is\s+(?:actually\s+)?(?:unreal|insane|wild)\b/i,
    ],
    zeroEffort:
      /\b0\s+manual\s+work\b|\bzero\s+(?:effort|work|manual)\b|\bdidn'?t\s+(?:write|touch)\s+(?:a|1|one|a\s+single)\s+line\s+of\s+code\b|\bon\s+(?:full\s+)?autopilot\b|\bpassive\s+income\b|\bmoney\s+printer\b|\bprint(?:ed|ing|s)?\s+(?:money|\$)|\bbots?\s+print|\bi\s+just\s+slept\b|\bset\s+it\s+and\s+forget\s+it\b/i,
    traction: [
      /\b\d[\d,]*\s+(?:paid\s+users|paying\s+(?:users|customers)|customers|sign-?ups|subscribers)\b/i,
      /\$\s?\d[\d,.]*\s?k?\s*(?:mrr|arr|\/\s?mo(?:nth)?\b|a\s+month|per\s+month|\/\s?day|a\s+day|per\s+day|a\s+week)/i,
    ],
    growth:
      /\b\d[\d.,]*\s?[km]?\s+(?:followers|views|impressions|subs)\b[\s\S]{0,80}?\b(?:in|within)\s+(?:fuck\w*\s+)?\d+\s+(?:fuck\w*\s+)?(?:days?|hours?|weeks?)\b/i,
    guarantee:
      /\bguarantee(?:d|s)?\s+(?:profits?|returns?|income|gains?|wins?)\b|\brisk[-\s]?free\b|\bcan'?t\s+lose\b|\b100%\s+win\s*rate\b|\bnever\s+lose\b|\bno\s+risk\b/i,
    bait: [
      /\b(?:comment|reply)\s+["“'‘]?[\w-]+["”'’]?\s+(?:and|&)\s+i(?:'?ll|\s+will)\s+(?:dm|send)\b/i,
      /\bbookmark\s+(?:this|it)\b/i,
      /\bfollow\s+(?:me\s+)?(?:\+|and|&)\s+(?:rt|retweet|repost)\b/i,
      /\b(?:first\s+)?link\s+in\s+(?:the\s+)?(?:comments|replies|bio)\b/i,
      /\bdms?\s+(?:me|open)\b/i,
      /\byou'?ll\s+thank\s+me\s+later\b/i,
      /\b(?:drop|grab|get|download)\s+(?:the|this|my)\s+(?:pdf|prompt|guide|playbook|file|template)s?\s+(?:below|in\s+the\s+(?:replies|comments|thread))\b/i,
      /\bsave\s+(?:this|the)\s+(?:post|thread|article|tweet)\b/i,
      /\bfollow\s+(?:me\s+)?for\s+(?:part\s+\d+|more|the\s+rest)\b/i,
      /[↓👇]\s*$/mu,
    ],
    credentials:
      /\b(?:ex|former)[-\s](?:openai|google|meta|goldman|anthropic|deepmind|jane\s+street|citadel|apple|tesla|nasa)\b|\b(?:anthropic|openai|google)\s+(?:engineer|researcher)\b|\bmit\s+grad\b/i,
    pumpX: /\b\d{2,5}x\b/i,
    pumpWords: /\b(?:gem|token|coin|memecoin|launch|presale|ape|aped|airdrop|pump|moon|ca:|contract)\b/i,
    contract: /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/,
    aiBot: /\b(?:bots?|ai|agents?|grok|claude|opus|gpt|chatgpt|gemini|copy[-\s]?trad\w*)\b/i,
    dollar: /\$\s?\d/g,
    community: /t\.me\/\+|\bjoin\s+(?:my|our|the)\s+(?:telegram|discord|tg)\b|\bvip\s+(?:group|channel)\b/i,
    injection:
      /\bignore\s+(?:all\s+|any\s+)?(?:previous|prior|above|earlier)\s+(?:instructions|prompts?)\b|\byou\s+are\s+(?:an?\s+)?(?:ai|language\s+model|llm)\b|\bas\s+an\s+ai\b|\bcapchecker\b|\b(?:score|rate)\s+this\s+(?:post\s+)?(?:as\s+)?(?:0|zero|safe|legit|no\s+cap)\b|\bsystem\s+prompt\b/i,
  };

  const WEIGHT = {
    multiply100: 0.5,
    multiply10: 0.4,
    multiply3: 0.3,
    timeframe: 0.12,
    fastGain: 0.15,
    referral: 0.3,
    referralDisclosed: 0.08,
    hype: 0.25,
    zeroEffort: 0.2,
    traction: 0.18,
    growth: 0.12,
    guarantee: 0.45,
    bait: 0.12,
    credentials: 0.1,
    pump: 0.22,
    aiBotProfit: 0.15,
    figures: 0.08,
    community: 0.1,
    injection: 0.6,
  };

  // Rules about farming engagement rather than misleading claims. They feed the
  // separate bait score; everything else feeds the cap score.
  const BAIT_IDS = new Set(['hype', 'bait', 'community']);

  function combine(reasons) {
    return Math.round(100 * (1 - reasons.reduce((acc, r) => acc * (1 - r.weight), 1)));
  }

  function normalize(s) {
    return String(s || '')
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/\bf[\W_]{1,3}(?:c?k)/gi, 'fuck')
      .replace(/https?:\/\/\s+/gi, 'https://')
      .replace(/[ \t]+/g, ' ');
  }

  function parseAmount(num, suffix) {
    const n = parseFloat(String(num).replace(/,/g, ''));
    if (!isFinite(n)) return NaN;
    const mult = { k: 1e3, m: 1e6, b: 1e9 }[String(suffix || '').toLowerCase()] || 1;
    return n * mult;
  }

  function fmtMoney(n) {
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M';
    if (n >= 1e4) return '$' + Math.round(n).toLocaleString('en-US');
    return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }

  function clip(s, n) {
    s = String(s).replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }

  function findMultiply(text) {
    let best = null;
    RE.multiply.lastIndex = 0;
    let m;
    while ((m = RE.multiply.exec(text))) {
      const before = text.slice(Math.max(0, m.index - 12), m.index).toLowerCase();
      if (/\b(?:from|between)\s*$/.test(before)) continue;
      const a = parseAmount(m[1], m[2]);
      const b = parseAmount(m[3], m[4]);
      if (!(a > 0) || !(b > 0)) continue;
      const ratio = b / a;
      if (!best || ratio > best.ratio) best = { a, b, ratio, raw: m[0] };
    }
    return best && best.ratio >= 3 ? best : null;
  }

  function postHaystack(post) {
    const parts = [post.text, post.quoteText, post.cardText, post.articleTitle];
    for (const l of post.links || []) parts.push(l.text, l.href, l.expanded);
    return normalize(parts.filter(Boolean).join('\n'));
  }

  function scorePost(post) {
    const text = postHaystack(post || {});
    const reasons = [];
    const add = (id, weight, title, detail) =>
      reasons.push({ id, weight, title, detail, kind: BAIT_IDS.has(id) ? 'bait' : 'cap', source: 'pattern' });

    const mult = findMultiply(text);
    if (mult) {
      const x = mult.ratio >= 100 ? Math.round(mult.ratio) : Math.round(mult.ratio * 10) / 10;
      const w = mult.ratio >= 100 ? WEIGHT.multiply100 : mult.ratio >= 10 ? WEIGHT.multiply10 : WEIGHT.multiply3;
      add('multiply', w, `Turns ${fmtMoney(mult.a)} into ${fmtMoney(mult.b)} (${x}x)`, 'Big multiplication claims rarely come with proof you can check.');
    }

    const time = text.match(RE.timeframe);
    if (time) {
      add('timeframe', WEIGHT.timeframe, 'Very short timeframe', `"${clip(time[0], 40)}"`);
    }

    const traction = RE.traction.map((r) => text.match(r)).find(Boolean);
    if (time && (mult || traction)) {
      add('fastGain', WEIGHT.fastGain, 'Big result in very little time', 'Fast money or user claims are the classic hype format.');
    }

    let refHit = null;
    if (!RE.refExempt.test(text)) {
      for (const r of RE.refUrl) {
        const m = text.match(r);
        if (m) { refHit = m[0]; break; }
      }
    }
    if (!refHit) {
      const m = text.match(RE.refText);
      if (m) refHit = m[0];
    }
    if (refHit) {
      if (RE.disclosed.test(text)) {
        add('referralDisclosed', WEIGHT.referralDisclosed, 'Referral link (disclosed)', `The author says it is a referral or ad: ${clip(refHit, 50)}`);
      } else {
        add('referral', WEIGHT.referral, 'Undisclosed referral link', `The author likely earns from sign-ups: ${clip(refHit, 50)}`);
      }
    }

    const hype = RE.hype.map((r) => text.match(r)).find(Boolean);
    if (hype) add('hype', WEIGHT.hype, 'Viral hype opener', `"${clip(hype[0], 50)}" is a common engagement-bait template.`);

    const zero = text.match(RE.zeroEffort);
    if (zero) add('zeroEffort', WEIGHT.zeroEffort, 'No-effort money claim', `"${clip(zero[0], 50)}"`);

    if (traction) add('traction', WEIGHT.traction, 'Unverified revenue or user numbers', `"${clip(traction[0], 50)}"`);

    const growth = text.match(RE.growth);
    if (growth) add('growth', WEIGHT.growth, 'Fast growth claim', `"${clip(growth[0], 60)}"`);

    const guarantee = text.match(RE.guarantee);
    if (guarantee) add('guarantee', WEIGHT.guarantee, 'Guaranteed or risk-free claim', `"${clip(guarantee[0], 40)}". Real returns are never guaranteed.`);

    const bait = RE.bait.map((r) => text.match(r)).find(Boolean);
    if (bait) add('bait', WEIGHT.bait, 'Engagement bait', `"${clip(bait[0], 40)}"`);

    const cred = text.match(RE.credentials);
    if (cred) add('credentials', WEIGHT.credentials, 'Authority claim you cannot check', `"${clip(cred[0], 40)}"`);

    const pumpX = text.match(RE.pumpX);
    if ((pumpX && RE.pumpWords.test(text)) || (RE.contract.test(text) && RE.pumpWords.test(text))) {
      add('pump', WEIGHT.pump, 'Coin pump language', pumpX ? `"${pumpX[0]}" alongside token talk.` : 'Contract address alongside token talk.');
    }

    if ((mult || traction) && RE.aiBot.test(text)) {
      add('aiBotProfit', WEIGHT.aiBotProfit, 'AI or bot profit claim', 'Claims that a bot or AI made the money are the most faked format right now.');
    }

    const dollars = (text.match(RE.dollar) || []).length;
    if (dollars >= 5) add('figures', WEIGHT.figures, 'Lots of exact dollar figures', `${dollars} dollar amounts. Precise numbers are a common way to fake proof.`);

    const community = text.match(RE.community);
    if (community) add('community', WEIGHT.community, 'Funnel to a private group', `"${clip(community[0], 40)}"`);

    const injection = RE.injection.test(text);
    if (injection) add('injection', WEIGHT.injection, 'Text aimed at AI checkers', 'The post contains instructions meant to steer automated checks.');

    reasons.sort((a, b) => b.weight - a.weight);
    return {
      score: combine(reasons), // decides whether a post gets an AI check
      capScore: combine(reasons.filter((r) => r.kind === 'cap')),
      baitScore: combine(reasons.filter((r) => r.kind === 'bait')),
      reasons,
      injection,
    };
  }

  const api = { scorePost, normalize, parseAmount, findMultiply, WEIGHT };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CapRules = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
