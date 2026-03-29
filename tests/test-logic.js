#!/usr/bin/env node
'use strict';

// Tests for cladogame-logic.js functions that don't touch the DOM.
// Uses a minimal localStorage mock so persistence functions work in Node.

const assert   = require('assert/strict');
const phylogeny = require('../phylogeny.js');

// ── localStorage mock ─────────────────────────────────────────────────────────
const _store = {};
global.localStorage = {
  getItem:    k      => (k in _store ? _store[k] : null),
  setItem:    (k, v) => { _store[k] = String(v); },
  removeItem: k      => { delete _store[k]; },
  clear:      ()     => { for (const k in _store) delete _store[k]; },
};

const L = require('../cladogame-logic.js');

// ── Test runner ───────────────────────────────────────────────────────────────
let passed = 0, failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${e.message}`);
    failed++;
  }
}

function reset() {
  localStorage.clear();
  L._set({ streak: 0, correct: 0, played: 0, recentCorrectTimes: [] });
}

// ── Setup ─────────────────────────────────────────────────────────────────────
L.initTree(phylogeny);
const allLeaves = phylogeny.nodes.filter(n => n.isLeaf);

// ── targetHardness() ─────────────────────────────────────────────────────────
console.log('\ntargetHardness()');

test('returns 0.25 when fewer than 3 rounds played', () => {
  reset();
  assert.equal(L.targetHardness(), 0.25);
  L._set({ played: 2, correct: 2 });
  assert.equal(L.targetHardness(), 0.25);
});

test('returns value in [0.2, 0.85] for all reasonable inputs', () => {
  for (const [p, c, s] of [[3,3,0],[10,5,0],[100,90,8],[40,10,0],[3,0,0]]) {
    L._set({ played: p, correct: c, streak: s });
    const h = L.targetHardness();
    assert.ok(h >= 0.2 && h <= 0.85, `targetHardness out of range: played=${p} correct=${c} streak=${s} → ${h}`);
  }
});

test('higher accuracy yields higher target hardness (same streak)', () => {
  L._set({ played: 20, correct: 20, streak: 0 });
  const hHigh = L.targetHardness();
  L._set({ played: 20, correct: 4, streak: 0 });
  const hLow  = L.targetHardness();
  assert.ok(hHigh > hLow, `expected high-accuracy hardness (${hHigh}) > low-accuracy (${hLow})`);
});

test('higher streak yields higher target hardness (same accuracy)', () => {
  L._set({ played: 20, correct: 10, streak: 8 });
  const hHigh = L.targetHardness();
  L._set({ played: 20, correct: 10, streak: 0 });
  const hLow  = L.targetHardness();
  assert.ok(hHigh > hLow, `expected high-streak hardness (${hHigh}) > low-streak (${hLow})`);
});

// ── recordCorrectAndCheckStreak() ─────────────────────────────────────────────
console.log('\nrecordCorrectAndCheckStreak()');

test('returns false when streak < STREAK_THRESHOLD', () => {
  reset();
  L._set({ streak: 1 });
  assert.equal(L.recordCorrectAndCheckStreak(Date.now()), false);
});

test('returns false when 3 correct answers are spread > 30 s apart', () => {
  reset();
  const base = 1_000_000;
  L._set({ streak: 3, recentCorrectTimes: [base, base + 15_000] });
  // third answer arrives 31 s after the first → window too wide
  assert.equal(L.recordCorrectAndCheckStreak(base + 31_000), false);
});

test('returns true when STREAK_THRESHOLD correct answers within 30 s', () => {
  reset();
  const now = Date.now();
  L._set({ streak: L.STREAK_THRESHOLD, recentCorrectTimes: new Array(L.STREAK_THRESHOLD - 1).fill(now - 5000) });
  assert.equal(L.recordCorrectAndCheckStreak(now), true);
});

test('resets recentCorrectTimes after a hot streak fires', () => {
  reset();
  const now = Date.now();
  L._set({ streak: L.STREAK_THRESHOLD, recentCorrectTimes: new Array(L.STREAK_THRESHOLD - 1).fill(now - 5000) });
  L.recordCorrectAndCheckStreak(now);
  assert.equal(L._get().recentCorrectTimes.length, 0);
});

test('does not fire twice in a row without another reset', () => {
  reset();
  const now = Date.now();
  L._set({ streak: L.STREAK_THRESHOLD, recentCorrectTimes: new Array(L.STREAK_THRESHOLD - 1).fill(now - 5000) });
  L.recordCorrectAndCheckStreak(now); // fires, clears
  L._set({ streak: L.STREAK_THRESHOLD });
  assert.equal(L.recordCorrectAndCheckStreak(now + 1000), false);
});

// ── buildExplanation() ───────────────────────────────────────────────────────
console.log('\nbuildExplanation()');

// Build a real answer using oddOneOut on known organisms
const humanNode  = phylogeny.nodes.find(n => n.id === 'human');
const chimpNode  = phylogeny.nodes.find(n => n.id === 'chimp');
const ecoliNode  = phylogeny.nodes.find(n => n.id === 'ecoli');

const rawAnswer = L.oddOneOut(humanNode, chimpNode, ecoliNode);
// oddOneOut returns id strings for odd/pairA/pairB; buildExplanation expects them
const answerCorrect = rawAnswer;
const answerWrong   = rawAnswer;

test('correct answer starts with "Correct!"', () => {
  const html = L.buildExplanation(answerCorrect, true);
  assert.ok(html.startsWith('Correct!'), `got: ${html.slice(0, 40)}`);
});

test('wrong answer mentions the odd one\'s common name', () => {
  const html = L.buildExplanation(answerWrong, false);
  // odd is ecoli → "E. coli"
  const oddName = phylogeny.nodes.find(n => n.id === answerWrong.odd).commonName;
  assert.ok(html.includes(oddName), `missing "${oddName}" in: ${html.slice(0, 80)}`);
});

test('explanation contains pair organisms\' common names', () => {
  const html = L.buildExplanation(answerCorrect, true);
  const pairAName = phylogeny.nodes.find(n => n.id === answerCorrect.pairA).commonName;
  const pairBName = phylogeny.nodes.find(n => n.id === answerCorrect.pairB).commonName;
  assert.ok(html.includes(pairAName), `missing pairA "${pairAName}"`);
  assert.ok(html.includes(pairBName), `missing pairB "${pairBName}"`);
});

test('explanation contains a clade-name span', () => {
  const html = L.buildExplanation(answerCorrect, true);
  assert.ok(html.includes('class="clade-name"'), 'no clade-name span');
});

test('explanation contains divergence age text', () => {
  const html = L.buildExplanation(answerCorrect, true);
  assert.ok(html.includes('million') || html.includes('billion'), 'no age text');
});

// ── resolveImage() ────────────────────────────────────────────────────────────
console.log('\nresolveImage()');

test('no image field → null', () => {
  assert.equal(L.resolveImage({}), null);
});

test('bare name → images/{name}.png', () => {
  assert.equal(L.resolveImage({ image: 'bald-eagle' }), 'images/bald-eagle.png');
});

test('name with extension → images/{name}.ext (no extra .png)', () => {
  assert.equal(L.resolveImage({ image: 'bald-eagle.jpg' }), 'images/bald-eagle.jpg');
});

test('name containing "/" → returned as-is', () => {
  assert.equal(L.resolveImage({ image: 'custom/path/image.png' }), 'custom/path/image.png');
});

// ── tripleKey() ───────────────────────────────────────────────────────────────
console.log('\ntripleKey()');

test('same three IDs in different orders produce the same key', () => {
  assert.equal(L.tripleKey('a', 'b', 'c'), L.tripleKey('c', 'a', 'b'));
  assert.equal(L.tripleKey('a', 'b', 'c'), L.tripleKey('b', 'c', 'a'));
});

// ── saveResult() + loadHistory() ──────────────────────────────────────────────
console.log('\nsaveResult() + loadHistory()');

test('save a correct result, load it back', () => {
  reset();
  L.saveResult('a', 'b', 'c', true);
  const rec = L.loadHistory()[L.tripleKey('a', 'b', 'c')];
  assert.equal(rec.played,  1);
  assert.equal(rec.correct, 1);
});

test('save an incorrect result, load it back', () => {
  reset();
  L.saveResult('a', 'b', 'c', false);
  const rec = L.loadHistory()[L.tripleKey('a', 'b', 'c')];
  assert.equal(rec.played,  1);
  assert.equal(rec.correct, 0);
});

test('saving again increments counts', () => {
  reset();
  L.saveResult('a', 'b', 'c', true);
  L.saveResult('a', 'b', 'c', false);
  const rec = L.loadHistory()[L.tripleKey('a', 'b', 'c')];
  assert.equal(rec.played,  2);
  assert.equal(rec.correct, 1);
});

test('malformed JSON in localStorage → returns {}', () => {
  reset();
  localStorage.setItem(L.HISTORY_KEY, '{bad json}');
  assert.deepEqual(L.loadHistory(), {});
});

// ── updateCreatureScores() + loadCreatureScores() ─────────────────────────────
console.log('\nupdateCreatureScores() + loadCreatureScores()');

function assertScore(scores, id, expected) {
  assert.ok(Math.abs((scores[id] || 0) - expected) < 0.0001,
    `score["${id}"]: expected ${expected}, got ${scores[id]}`);
}

test('correct guess: odd +0.2, each pair member +0.1', () => {
  reset();
  L.updateCreatureScores('odd', 'pA', 'pB', 'odd');
  const s = L.loadCreatureScores();
  assertScore(s, 'odd', 0.2);
  assertScore(s, 'pA',  0.1);
  assertScore(s, 'pB',  0.1);
});

test('wrong guess: guessed creature -3.0, missed odd -2.0, other pair member untouched', () => {
  reset();
  L.updateCreatureScores('odd', 'pA', 'pB', 'pA'); // player clicked pA
  const s = L.loadCreatureScores();
  assertScore(s, 'pA',  -3.0);
  assertScore(s, 'odd', -2.0);
  assert.equal(s['pB'], undefined, 'untouched pair member should have no score');
});

test('score is clamped at +5 (cannot exceed maximum)', () => {
  reset();
  for (let i = 0; i < 30; i++) L.updateCreatureScores('odd', 'x', 'y', 'odd');
  assert.equal(L.loadCreatureScores()['odd'], 5);
});

test('score is clamped at -5 (cannot go below minimum)', () => {
  reset();
  for (let i = 0; i < 3; i++) L.updateCreatureScores('odd', 'x', 'y', 'x');
  assert.equal(L.loadCreatureScores()['odd'], -5);
});

test('scores persist across calls (round-trip through localStorage)', () => {
  reset();
  L.updateCreatureScores('odd', 'pA', 'pB', 'odd');
  L.updateCreatureScores('odd', 'pA', 'pB', 'odd');
  assertScore(L.loadCreatureScores(), 'odd', 0.4);
});

// ── pickTriple() ──────────────────────────────────────────────────────────────
console.log('\npickTriple()');

test('returns exactly 3 distinct leaf nodes', () => {
  reset();
  const triple = L.pickTriple();
  assert.equal(triple.length, 3);
  assert.equal(new Set(triple.map(n => n.id)).size, 3, 'expected 3 distinct organisms');
  assert.ok(triple.every(n => n.isLeaf), 'all returned nodes must be leaves');
});

test('result is never a polytomy (oddOneOut returns non-null, 20 trials)', () => {
  reset();
  for (let i = 0; i < 20; i++) {
    const [a, b, c] = L.pickTriple();
    assert.notEqual(
      L.oddOneOut(a, b, c), null,
      `polytomy on trial ${i + 1}: ${a.id}, ${b.id}, ${c.id}`
    );
  }
});

// ── XP and creature unlocks ────────────────────────────────────────────────────
console.log('\nXP and creature unlocks');

test('loadXp returns 0 when nothing stored', () => {
  reset();
  assert.equal(L.loadXp(), 0);
});

test('saveXp / loadXp round-trip', () => {
  reset();
  L.saveXp(42);
  assert.equal(L.loadXp(), 42);
});

test('saveXp clamps at 0 (no negative XP)', () => {
  reset();
  L.saveXp(-5);
  assert.equal(L.loadXp(), 0);
});

test('applyGuessXp adds 2 for correct answer', () => {
  reset();
  L.saveXp(0);
  L.applyGuessXp(true);
  assert.equal(L.loadXp(), 2);
});

test('applyGuessXp subtracts 1 for wrong answer', () => {
  reset();
  L.saveXp(5);
  L.applyGuessXp(false);
  assert.equal(L.loadXp(), 4);
});

test('applyGuessXp does not go below 0', () => {
  reset();
  L.saveXp(0);
  L.applyGuessXp(false);
  assert.equal(L.loadXp(), 0);
});

test('computeNextUnlockThreshold is 10 when nothing unlocked', () => {
  reset();
  assert.equal(L.computeNextUnlockThreshold(), 10);
});

test('leavesAvailable contains only tier-1 leaves when nothing unlocked', () => {
  reset();
  const avail = L.leavesAvailable();
  assert.ok(avail.every(l => l.tier === 1), 'non-tier-1 leaf found before any unlock');
});

test('tryUnlock returns null when XP below threshold', () => {
  reset();
  L.saveXp(9);
  assert.equal(L.tryUnlock(9), null);
});

test('tryUnlock returns a creature when XP meets threshold', () => {
  reset();
  const creature = L.tryUnlock(10);
  assert.ok(creature !== null, 'expected a creature to be unlocked');
  assert.equal(creature.tier, 2, `expected tier-2 creature, got tier ${creature.tier}`);
});

test('unlocked creature appears in leavesAvailable', () => {
  reset();
  const creature = L.tryUnlock(10);
  const avail = L.leavesAvailable();
  assert.ok(avail.some(l => l.id === creature.id), 'unlocked creature not in available pool');
});

test('second unlock at 20 XP returns another tier-2 creature', () => {
  reset();
  L.tryUnlock(10); // first unlock
  const second = L.tryUnlock(20);
  assert.ok(second !== null);
  assert.equal(second.tier, 2);
});

test('unlocking all tier-2 creatures raises threshold to a tier-3 interval', () => {
  reset();
  // Unlock all tier-2 creatures by simulating XP accumulation
  let xp = 0;
  let unlocked;
  do {
    xp += 10;
    unlocked = L.tryUnlock(xp);
  } while (unlocked && unlocked.tier === 2);
  // Next threshold should be tier-3: 5*3 = 15 above current total cost
  const threshold = L.computeNextUnlockThreshold();
  assert.ok(threshold > xp || threshold === Infinity,
    `expected threshold ${threshold} > xp ${xp}`);
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
