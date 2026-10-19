const test = require('node:test');
const assert = require('node:assert/strict');
const V = require('../src/shared/verdict.js');
const { scorePost } = require('../src/shared/rules.js');
const F = require('./fixtures.js');

test('extractJson reads fenced and wrapped replies', () => {
  assert.deepEqual(V.extractJson('```json\n{"score": 80, "reasons": []}\n```'), { score: 80, reasons: [] });
  assert.deepEqual(V.extractJson('Here you go: {"a": "brace } in string", "b": {"c": 1}} done'), { a: 'brace } in string', b: { c: 1 } });
  assert.equal(V.extractJson('no json here'), null);
  assert.equal(V.extractJson('{"broken": '), null);
});

test('normalizeAi clamps scores and trims reasons', () => {
  const ai = V.normalizeAi({ score: 140, summary: 'x', reasons: [{ title: 'A', detail: 'd', severity: 'weird' }, { detail: 'no title' }], sources: ['https://a.com', 'javascript:alert(1)'] }, 'ai');
  assert.equal(ai.score, 100);
  assert.equal(ai.reasons.length, 1);
  assert.equal(ai.reasons[0].severity, 'medium');
  assert.deepEqual(ai.sources, ['https://a.com']);
  assert.equal(V.normalizeAi({ score: 'nope' }, 'ai'), null);
});

test('tiers follow the score bands', () => {
  assert.equal(V.tierFor(90).key, 'cap');
  assert.equal(V.tierFor(75).key, 'cap');
  assert.equal(V.tierFor(74).key, 'likely');
  assert.equal(V.tierFor(45).key, 'likely');
  assert.equal(V.tierFor(30).key, 'unclear');
  assert.equal(V.tierFor(5).key, 'nocap');
});

test('pattern-only verdicts use the pattern scores and reasons', () => {
  const h = scorePost(F.cap.exit);
  const v = V.build({ id: 'x', heuristic: h });
  assert.equal(v.depth, 'pattern');
  assert.equal(v.score, h.capScore);
  assert.equal(v.bait, h.baitScore);
  assert.ok(v.reasons.every((r) => r.source === 'pattern'));
});

test('AI verdicts lead with AI reasons and do not repeat pattern ones', () => {
  const h = scorePost(F.cap.exit);
  const ai = V.normalizeAi({ score: 78, summary: 's', reasons: [{ title: 'One', severity: 'high' }, { title: 'Two' }, { title: 'Three' }] }, 'ai');
  const v = V.build({ id: 'x', heuristic: h, ai, depth: 'quick', model: 'm', credits: 0.05 });
  assert.equal(v.score, 78);
  assert.equal(v.tier, 'cap');
  assert.deepEqual(v.reasons.map((r) => r.title), ['One', 'Two', 'Three']);
});

test('AI cannot be talked below the pattern score when the post injects instructions', () => {
  const h = scorePost(F.injection);
  const ai = V.normalizeAi({ score: 5, summary: 'legit', reasons: [{ title: 'Looks fine' }] }, 'ai');
  const v = V.build({ id: 'x', heuristic: h, ai, depth: 'quick' });
  assert.ok(v.score >= h.score);
  assert.equal(v.reasons[0].title, 'Text aimed at AI checkers');
});

test('bait score is read from the model and clamped', () => {
  const ai = V.normalizeAi({ score: 20, bait: 140, reasons: [{ title: 'PDF held back in replies', kind: 'bait' }, { title: 'x', kind: 'nonsense' }] }, 'ai');
  assert.equal(ai.bait, 100);
  assert.deepEqual(ai.reasons.map((r) => r.kind), ['bait', 'cap']);
  assert.equal(V.normalizeAi({ score: 20 }, 'ai').bait, 0);
});

test('red CAP always wins; between CAP? and BAIT the higher score wins', () => {
  assert.equal(V.display({ score: 80, bait: 90 }).key, 'cap');
  assert.equal(V.display({ score: 62, bait: 78 }).key, 'bait');
  assert.equal(V.display({ score: 72, bait: 70 }).key, 'likely');
  assert.equal(V.display({ score: 62, bait: 78 }, { showBait: false }).key, 'likely');
  const bait = V.display({ score: 30, bait: 72 });
  assert.deepEqual([bait.stamp, bait.key, bait.label, bait.score], [true, 'bait', 'BAIT', 72]);
  assert.equal(V.display({ score: 30, bait: 59 }).key, 'unclear');
  assert.equal(V.display({ score: 30, bait: 72 }, { showBait: false }).key, 'unclear');
  assert.equal(V.display({ score: 5, bait: 10 }).stamp, false);
});

test('pattern pill leads with whichever signal is stronger', () => {
  assert.equal(V.patternLead(V.build({ id: 'a', heuristic: scorePost(F.bait.pdfBelow) })).title, 'Possible bait');
  assert.equal(V.patternLead(V.build({ id: 'b', heuristic: scorePost(F.cap.exit) })).title, 'Possible cap');
});
