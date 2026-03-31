#!/usr/bin/env node
'use strict';

// Tests for the core tree/game logic.
// Re-implements the pure functions from cladogame.js (which uses browser globals)
// so they can run in Node without any DOM mocking.

const assert   = require('assert/strict');
const phylogeny = require('../phylogeny.js');

// ── Pure tree functions (mirrors cladogame.js) ────────────────────────────────
let nodeMap = {};

function initTree(data) {
  nodeMap = {};
  for (const n of data.nodes) nodeMap[n.id] = n;
}

function ancestors(id) {
  const path = [];
  for (let cur = id; cur !== null; cur = nodeMap[cur].parent) path.push(cur);
  return path;
}

function lca(a, b) {
  const setA = new Set(ancestors(a));
  for (const n of ancestors(b)) if (setA.has(n)) return n;
  return null;
}

function lcaAge(a, b) { return nodeMap[lca(a, b)].age_mya; }

function exclusiveClade(oddId, pairNodeId) {
  const sharedAnc = lca(oddId, pairNodeId);
  for (let cur = oddId; cur !== null; cur = nodeMap[cur].parent) {
    if (nodeMap[cur].parent === sharedAnc) return cur;
  }
  return oddId;
}

function tripleHardness(a, b, c) {
  const lab = lca(a, b), lac = lca(a, c), lbc = lca(b, c);
  if (lab === lac && lab === lbc) return -1; // polytomy
  const ages = [nodeMap[lab].age_mya, nodeMap[lac].age_mya, nodeMap[lbc].age_mya]
                 .sort((x, y) => x - y);
  return ages[1] > 0 ? ages[0] / ages[1] : 0;
}

function oddOneOut(a, b, c) {
  const lab = lca(a, b), lac = lca(a, c), lbc = lca(b, c);
  if (lab === lac && lab === lbc) return null; // polytomy
  if (lac === lbc) return { odd: c, pairA: a, pairB: b };
  if (lab === lbc) return { odd: b, pairA: a, pairB: c };
  return                   { odd: a, pairA: b, pairB: c };
}

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

// ── Setup ─────────────────────────────────────────────────────────────────────
initTree(phylogeny);
const leaves  = phylogeny.nodes.filter(n => n.isLeaf);
const leafIds = new Set(leaves.map(n => n.id));

// ── Tree structure ────────────────────────────────────────────────────────────
console.log('\nTree structure');

test('root has null parent', () => {
  assert.ok(nodeMap['root'], 'root node missing');
  assert.equal(nodeMap['root'].parent, null);
});

test('exactly one root (parent: null)', () => {
  const roots = phylogeny.nodes.filter(n => n.parent === null);
  assert.equal(roots.length, 1, `found ${roots.length} roots`);
});

test('all non-root nodes reference an existing parent', () => {
  for (const n of phylogeny.nodes) {
    if (n.parent !== null) {
      assert.ok(nodeMap[n.parent], `"${n.id}" has unknown parent "${n.parent}"`);
    }
  }
});

test('no duplicate node IDs', () => {
  const seen = new Set();
  for (const n of phylogeny.nodes) {
    assert.ok(!seen.has(n.id), `duplicate id: "${n.id}"`);
    seen.add(n.id);
  }
});

test('at least 20 leaf nodes', () => {
  assert.ok(leaves.length >= 20, `only ${leaves.length} leaves`);
});

// ── ancestors() ───────────────────────────────────────────────────────────────
console.log('\nancestors()');

test('human ancestors chain ends at root', () => {
  const chain = ancestors('human');
  assert.equal(chain[0], 'human');
  assert.equal(chain[chain.length - 1], 'root');
});

test('human ancestors include hominidae, primates, eukarya', () => {
  const chain = ancestors('human');
  assert.ok(chain.includes('hominidae'));
  assert.ok(chain.includes('primates'));
  assert.ok(chain.includes('eukarya'));
});

test('ecoli ancestors do not include eukarya', () => {
  assert.ok(!ancestors('ecoli').includes('eukarya'));
});

// ── lca() ─────────────────────────────────────────────────────────────────────
console.log('\nlca()');

test('lca(human, chimp) = hominidae', () => {
  assert.equal(lca('human', 'chimp'), 'hominidae');
});

test('lca(cat, dog) = carnivora', () => {
  assert.equal(lca('cat', 'dog'), 'carnivora');
});

test('lca(mouse, rat) = muridae', () => {
  assert.equal(lca('mouse', 'rat'), 'muridae');
});

test('lca(human, ecoli) = root', () => {
  assert.equal(lca('human', 'ecoli'), 'root');
});

test('lca is symmetric', () => {
  assert.equal(lca('human', 'chimp'), lca('chimp', 'human'));
  assert.equal(lca('cat', 'zebrafish'), lca('zebrafish', 'cat'));
});

test('lca(x, x) = x for leaf nodes', () => {
  assert.equal(lca('human', 'human'), 'human');
  assert.equal(lca('ecoli', 'ecoli'), 'ecoli');
});

// ── lcaAge() ──────────────────────────────────────────────────────────────────
console.log('\nlcaAge()');

test('lcaAge(human, chimp) equals hominidae age_mya', () => {
  assert.equal(lcaAge('human', 'chimp'), nodeMap['hominidae'].age_mya);
});

test('lcaAge(cat, dog) < lcaAge(cat, whale) — carnivores more related than cat+whale', () => {
  assert.ok(lcaAge('cat', 'dog') < lcaAge('cat', 'whale'));
});

test('lcaAge(mouse, rat) < lcaAge(mouse, human) — rodents more related than mouse+human', () => {
  assert.ok(lcaAge('mouse', 'rat') < lcaAge('mouse', 'human'));
});

// ── oddOneOut() ───────────────────────────────────────────────────────────────
console.log('\noddOneOut()');

test('human + chimp vs ecoli: ecoli is odd', () => {
  const r = oddOneOut('human', 'chimp', 'ecoli');
  assert.equal(r.odd, 'ecoli');
  assert.ok(['human', 'chimp'].includes(r.pairA));
  assert.ok(['human', 'chimp'].includes(r.pairB));
});

test('mouse + rat vs sponge: sponge is odd', () => {
  assert.equal(oddOneOut('mouse', 'rat', 'sponge').odd, 'sponge');
});

test('cat + dog vs zebrafish: zebrafish is odd', () => {
  assert.equal(oddOneOut('cat', 'dog', 'zebrafish').odd, 'zebrafish');
});

test('result is invariant to argument order', () => {
  assert.equal(oddOneOut('human', 'chimp', 'ecoli').odd, 'ecoli');
  assert.equal(oddOneOut('ecoli', 'human', 'chimp').odd, 'ecoli');
  assert.equal(oddOneOut('chimp', 'ecoli', 'human').odd, 'ecoli');
});

test('pair members are the two non-odd organisms', () => {
  const r = oddOneOut('cat', 'dog', 'zebrafish');
  assert.equal(r.odd, 'zebrafish');
  const pair = new Set([r.pairA, r.pairB]);
  assert.ok(pair.has('cat') && pair.has('dog'));
});

test('returns null for a polytomy (all three pairwise LCAs identical)', () => {
  // Use structural search O(n) instead of triple enumeration O(n^3):
  // a polytomy triple requires a node with ≥ 3 children.
  const childrenMap = {};
  for (const n of phylogeny.nodes) childrenMap[n.id] = [];
  for (const n of phylogeny.nodes) {
    if (n.parent !== null) childrenMap[n.parent].push(n.id);
  }

  function firstLeafUnder(id) {
    if (leafIds.has(id)) return id;
    return firstLeafUnder(childrenMap[id][0]);
  }

  const polytomyNode = phylogeny.nodes.find(
    n => !n.isLeaf && childrenMap[n.id].length >= 3
  );

  if (polytomyNode) {
    // One leaf from each of the first 3 children → guaranteed polytomy triple.
    const [a, b, c] = childrenMap[polytomyNode.id].slice(0, 3).map(firstLeafUnder);
    assert.equal(oddOneOut(a, b, c), null,
      `expected null for polytomy triple [${a}, ${b}, ${c}] under "${polytomyNode.id}"`);
  } else {
    // Fully binary tree — no polytomies exist.
    assert.notEqual(oddOneOut('human', 'chimp', 'ecoli'), null);
    console.log('    (tree is fully binary — no polytomies exist; null-return path untriggered)');
  }
});

// ── tripleHardness() ──────────────────────────────────────────────────────────
console.log('\ntripleHardness()');

test('human + chimp vs ecoli is a very easy triple (h < 0.01)', () => {
  const h = tripleHardness('human', 'chimp', 'ecoli');
  assert.ok(h >= 0 && h < 0.01, `expected h < 0.01, got ${h}`);
});

test('returns value in [0, 1) for a valid unambiguous triple', () => {
  const h = tripleHardness('cat', 'dog', 'ecoli');
  assert.ok(h >= 0 && h < 1, `expected [0, 1), got ${h}`);
});

test('is symmetric under argument permutation', () => {
  const h1 = tripleHardness('human', 'chimp', 'ecoli');
  const h2 = tripleHardness('ecoli', 'human', 'chimp');
  const h3 = tripleHardness('chimp', 'ecoli', 'human');
  assert.equal(h1, h2);
  assert.equal(h1, h3);
});

test('cat + dog vs mouse is harder than cat + dog vs ecoli', () => {
  // cat-dog-mouse: all mammals, closer together; cat-dog-ecoli: huge gap
  assert.ok(
    tripleHardness('cat', 'dog', 'mouse') > tripleHardness('cat', 'dog', 'ecoli'),
    'expected mouse triple to be harder than ecoli triple'
  );
});

// ── exclusiveClade() ──────────────────────────────────────────────────────────
console.log('\nexclusiveClade()');

test('ecoli vs hominidae pair → exclusive clade is bacteria', () => {
  // lca(ecoli, hominidae) = root; child of root toward ecoli = bacteria
  assert.equal(exclusiveClade('ecoli', 'hominidae'), 'bacteria');
});

test('human vs carnivora pair → exclusive clade is euarchontoglires', () => {
  // lca(human, carnivora) = placentalia; child toward human = euarchontoglires
  assert.equal(exclusiveClade('human', 'carnivora'), 'euarchontoglires');
});

test('result is an ancestor of the odd organism (or the odd organism itself)', () => {
  const exc = exclusiveClade('mouse', 'hominidae');
  assert.ok(ancestors('mouse').includes(exc), `${exc} not in mouse's ancestry`);
});

test('result is not an ancestor of pairNode', () => {
  const exc = exclusiveClade('ecoli', 'hominidae');
  // 'bacteria' should not be an ancestor of 'hominidae'
  assert.ok(!ancestors('hominidae').includes(exc), `${exc} unexpectedly in hominidae ancestry`);
});

// ── Leaf node data completeness ───────────────────────────────────────────────
console.log('\nLeaf node data completeness');

test('every leaf has commonName, sci, and emoji', () => {
  for (const n of leaves) {
    assert.ok(n.commonName, `leaf "${n.id}" missing commonName`);
    assert.ok(n.sci,        `leaf "${n.id}" missing sci`);
    assert.ok(n.emoji,      `leaf "${n.id}" missing emoji`);
  }
});

test('every leaf has a funFact string', () => {
  for (const n of leaves) {
    assert.ok(
      typeof n.funFact === 'string' && n.funFact.length > 0,
      `leaf "${n.id}" missing or empty funFact`
    );
  }
});

test('every leaf has a tier from 1 to 9', () => {
  for (const n of leaves) {
    const t = n.tier;
    assert.ok(Number.isInteger(t) && t >= 1 && t <= 9, `leaf "${n.id}" has invalid tier: ${t}`);
  }
});

test('no leaf is a parent of any other node', () => {
  for (const n of phylogeny.nodes) {
    if (n.parent !== null)
      assert.ok(!leafIds.has(n.parent), `leaf "${n.parent}" is used as parent of "${n.id}"`);
  }
});

// ── Age monotonicity ──────────────────────────────────────────────────────────
console.log('\nAge monotonicity');

test('every node is no older than its parent', () => {
  for (const n of phylogeny.nodes) {
    if (n.parent === null) continue;
    const parent = nodeMap[n.parent];
    assert.ok(
      n.age_mya <= parent.age_mya,
      `"${n.id}" (${n.age_mya} mya) is older than parent "${n.parent}" (${parent.age_mya} mya)`
    );
  }
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
