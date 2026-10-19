const test = require('node:test');
const assert = require('node:assert/strict');
const { scorePost, findMultiply, normalize } = require('../src/shared/rules.js');
const F = require('./fixtures.js');

const ids = (r) => r.reasons.map((x) => x.id);

test('cap posts score high enough to trigger a check', () => {
  for (const [name, post] of Object.entries(F.cap)) {
    const r = scorePost(post);
    assert.ok(r.score >= 50, `${name} scored ${r.score}: ${ids(r)}`);
  }
});

test('758x in 11 days with bots printing', () => {
  const r = scorePost(F.cap.printer);
  assert.ok(r.score >= 65, `scored ${r.score}`);
  assert.ok(ids(r).includes('multiply'));
  assert.match(r.reasons.find((x) => x.id === 'multiply').title, /\$100 into \$75,796 \(758x\)/);
  assert.ok(ids(r).includes('fastGain'));
});

test('copy bot: multiplication plus undisclosed referral', () => {
  const r = scorePost(F.cap.copybot);
  assert.ok(r.score >= 65, `scored ${r.score}`);
  assert.ok(ids(r).includes('referral'));
  assert.ok(ids(r).includes('aiBotProfit'));
});

test('overnight app: hype opener, no-effort and traction claims', () => {
  const r = scorePost(F.cap.sleeper);
  for (const id of ['hype', 'zeroEffort', 'traction', 'fastGain']) assert.ok(ids(r).includes(id), `missing ${id}: ${ids(r)}`);
});

test('promo post lands in the unclear band, not cap', () => {
  const r = scorePost(F.promo.growth);
  assert.ok(r.score >= 20 && r.score < 60, `scored ${r.score}: ${ids(r)}`);
  assert.ok(ids(r).includes('growth'));
});

test('normal posts stay below the auto-check threshold', () => {
  for (const [name, post] of Object.entries(F.normal)) {
    const r = scorePost(post);
    assert.ok(r.score < 30, `${name} scored ${r.score}: ${ids(r)}`);
  }
});

test('disclosed referral weighs far less than undisclosed', () => {
  const d = scorePost(F.disclosed);
  const u = scorePost(F.undisclosed);
  assert.ok(ids(d).includes('referralDisclosed'));
  assert.ok(ids(u).includes('referral'));
  assert.ok(u.score > d.score + 15, `undisclosed ${u.score} vs disclosed ${d.score}`);
});

test('prompt injection is flagged', () => {
  const r = scorePost(F.injection);
  assert.equal(r.injection, true);
  assert.equal(r.reasons[0].id, 'injection');
});

test('findMultiply ignores ranges and small ratios', () => {
  assert.equal(findMultiply('plans from $10 to $1,000'), null);
  assert.equal(findMultiply('$500 into $650'), null);
  assert.equal(findMultiply('$1.2k into $40k').ratio.toFixed(1), '33.3');
  assert.equal(Math.round(findMultiply('72 hours later: $218 → $3,406.').b), 3406);
  assert.equal(findMultiply('went $218 → $3,406.50 today').b, 3406.5);
});

test('normalize unmasks censored swearing and joins split URLs', () => {
  assert.equal(normalize('who the f*ck'), 'who the fuck');
  assert.equal(normalize('F*CKING'), 'fuckING');
  assert.equal(normalize('https://\nfomo.family'), 'https://fomo.family');
});

test('engagement-bait posts get flagged for a check', () => {
  const r = scorePost(F.bait.pdfBelow);
  assert.ok(r.score >= 30, `scored ${r.score}: ${ids(r)}`);
  assert.ok(ids(r).includes('hype') && ids(r).includes('bait'));
});

test('cap and bait scores are split by rule kind', () => {
  const bait = scorePost(F.bait.pdfBelow);
  assert.ok(bait.baitScore > bait.capScore, `bait ${bait.baitScore} cap ${bait.capScore}`);
  const cap = scorePost(F.cap.copybot);
  assert.ok(cap.capScore > cap.baitScore, `cap ${cap.capScore} bait ${cap.baitScore}`);
  for (const r of cap.reasons) assert.ok(['cap', 'bait'].includes(r.kind));
});
