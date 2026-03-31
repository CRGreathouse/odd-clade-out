#!/usr/bin/env node
'use strict';

// Validates phylogeny.js for data integrity:
//   - required fields on all nodes and leaf nodes
//   - no duplicate IDs
//   - all parent references exist
//   - all nodes reachable from root
//   - leaf image fields resolve to existing files in images/
//   - no image files unreferenced by any leaf node

const fs   = require('fs');
const path = require('path');

const phylogeny = require('../phylogeny.js');
const nodes     = phylogeny.nodes;

let errors   = 0;
let warnings = 0;

function error(msg) { console.error(`ERROR: ${msg}`); errors++;   }
function warn(msg)  { console.warn( `WARN:  ${msg}`); warnings++; }

// ── Build node map (also catches duplicate IDs) ───────────────────────────────
const nodeMap = {};
for (const n of nodes) {
  if (nodeMap[n.id]) error(`Duplicate node id: "${n.id}"`);
  nodeMap[n.id] = n;
}

// ── Required fields ───────────────────────────────────────────────────────────
// Internal nodes use label; leaf nodes use commonName instead.
const INTERNAL_FIELDS = ['id', 'parent', 'age_mya', 'label', 'sci'];
const LEAF_FIELDS     = ['id', 'parent', 'age_mya', 'sci', 'commonName', 'emoji'];

for (const n of nodes) {
  const fields = n.isLeaf ? LEAF_FIELDS : INTERNAL_FIELDS;
  for (const f of fields) {
    if (n[f] === undefined || n[f] === '') {
      error(`Node "${n.id}" missing required field: ${f}`);
    }
  }
}

// ── Parent references ─────────────────────────────────────────────────────────
for (const n of nodes) {
  if (n.parent !== null && !nodeMap[n.parent]) {
    error(`Node "${n.id}" references unknown parent "${n.parent}"`);
  }
}

// ── Single root, all nodes reachable ─────────────────────────────────────────
const roots = nodes.filter(n => n.parent === null);
if (roots.length !== 1) {
  error(`Expected exactly 1 root node (parent: null), found ${roots.length}`);
} else {
  const visited = new Set();
  const queue   = [roots[0].id];
  while (queue.length) {
    const id = queue.shift();
    visited.add(id);
    for (const n of nodes) {
      if (n.parent === id && !visited.has(n.id)) queue.push(n.id);
    }
  }
  for (const n of nodes) {
    if (!visited.has(n.id)) error(`Node "${n.id}" is unreachable from root`);
  }
}

// ── Link field checks ─────────────────────────────────────────────────────────
for (const n of nodes) {
  if (n.link && n.wiki) {
    warn(`Node "${n.id}" has both "link" and "wiki" — "wiki" will be ignored`);
  }
}

// ── Image checks ──────────────────────────────────────────────────────────────
const imagesDir    = path.join(__dirname, '..', 'images');
const imageFiles   = new Set(
  fs.readdirSync(imagesDir).filter(f => /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(f))
);
const referenced = new Set();

const missingImages = [];
for (const n of nodes) {
  if (!n.isLeaf) continue;
  if (!n.image) {
    warn(`Leaf "${n.id}" (${n.commonName}) has no image — using emoji fallback`);
    missingImages.push(n.commonName);
    continue;
  }
  // Mirrors resolveImage() in cladogame.js
  const hasExt   = /\.[a-z]{2,4}$/i.test(n.image);
  const filename = hasExt ? n.image : n.image + '.png';
  referenced.add(filename);
  if (!imageFiles.has(filename)) {
    error(`Leaf "${n.id}" references "images/${filename}" which does not exist`);
    missingImages.push(filename);
  }
}

for (const f of imageFiles) {
  if (!referenced.has(f)) warn(`"images/${f}" is not referenced by any leaf node`);
}

// ── Tree structure / polytomy analysis ───────────────────────────────────────
// A triple (a,b,c) is a polytomy iff all three pairwise LCAs are the same
// node — which can only happen when that node has ≥ 3 children and the three
// leaves come from at least 3 different subtrees.  A fully binary tree
// therefore guarantees zero polytomies.
//
// Algorithm:
//   1. Build children lists for all nodes  O(n)
//   2. Classify each internal node by child count  O(n)
//      - 1 child  → redundant (warn, but harmless)
//      - 2 children → binary (ok)
//      - ≥ 3 children → polytomy node (report)
//   3. If no polytomy nodes → done (no triples need testing)
//   4. Otherwise count affected triples analytically and show examples.
//
// Counting formula for polytomy triples under a node with child leaf-counts
// L1..Lk:  e3 = (S1³ − 3·S1·S2 + 2·S3) / 6
// where S1=Σ Li, S2=Σ Li², S3=Σ Li³.  Runs in O(k) per polytomy node.

const children = {};
for (const n of nodes) children[n.id] = [];
for (const n of nodes) {
  if (n.parent !== null) children[n.parent].push(n.id);
}

function leafDescendantsOf(id) {
  if (nodeMap[id].isLeaf) return [id];
  return children[id].flatMap(c => leafDescendantsOf(c));
}

const leaves = nodes.filter(n => n.isLeaf);
const redundantNodes = [];
const polytomyNodes  = [];
for (const n of nodes) {
  if (n.isLeaf) continue;
  const k = children[n.id].length;
  if (k === 1) redundantNodes.push(n);
  else if (k >= 3) polytomyNodes.push(n);
}

if (redundantNodes.length > 0) {
  warn(`${redundantNodes.length} node(s) have only 1 child (redundant but harmless): ${redundantNodes.map(n => `"${n.id}"`).join(', ')}`);
}

{
  const n = leaves.length;
  const totalTriples = n * (n - 1) * (n - 2) / 6;

  if (polytomyNodes.length === 0) {
    console.log(`\nTree is fully bifurcating — all C(${n},3) = ${totalTriples} triples are playable.`);
  } else {
    let polytomyCount = 0;
    const examples = [];

    for (const polyNode of polytomyNodes) {
      const childLeaves = children[polyNode.id].map(c => leafDescendantsOf(c));
      const lc          = childLeaves.map(l => l.length);
      const s1 = lc.reduce((a, b) => a + b,         0);
      const s2 = lc.reduce((a, b) => a + b * b,     0);
      const s3 = lc.reduce((a, b) => a + b * b * b, 0);
      polytomyCount += (s1 ** 3 - 3 * s1 * s2 + 2 * s3) / 6;

      if (examples.length < 5) {
        const triple = childLeaves.slice(0, 3).map(cl => cl[0]);
        examples.push({ ids: triple, node: polyNode.id });
      }
    }

    const playable = totalTriples - polytomyCount;
    console.log(`\nTriple analysis: ${n} leaves → C(${n},3) = ${totalTriples} triples`);
    warn(`${polytomyNodes.length} polytomy node(s): ${polytomyNodes.map(p => `"${p.id}"`).join(', ')}`);
    warn(`${polytomyCount} polytomy triple(s) — playable: ${playable}`);
    for (const p of examples) {
      const names = p.ids.map(id => nodeMap[id].commonName);
      warn(`  Example polytomy: ${names.join(', ')} — all branch from "${p.node}"`);
    }
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(
  `\nValidated ${nodes.length} nodes ` +
  `(${leaves.length} leaves, ${nodes.length - leaves.length} internal)`
);
if (errors === 0 && warnings === 0) {
  console.log('All checks passed.');
} else {
  if (warnings > 0) console.log(`${warnings} warning(s)`);
  if (errors   > 0) console.log(`${errors} error(s) — validation FAILED`);
  if (missingImages.length > 0) console.log(`Missing images: ${missingImages.join(', ')}`);
}

process.exit(errors > 0 ? 1 : 0);
