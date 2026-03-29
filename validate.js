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

const phylogeny = require('./phylogeny.js');
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

// ── Image checks ──────────────────────────────────────────────────────────────
const imagesDir    = path.join(__dirname, 'images');
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

// ── Triple / polytomy analysis ────────────────────────────────────────────────
// Enumerate all C(n,3) triples of leaf nodes and classify each as playable
// (unique odd one out) or a polytomy (all three pairwise LCAs are the same
// node — no cladistic answer exists).  Expected playable count with no
// polytomies: C(n,3) = n*(n-1)*(n-2)/6.  Each polytomy reduces this by 1.

function ancestors(id) {
  const path = [];
  for (let cur = id; cur !== null; cur = nodeMap[cur].parent) path.push(cur);
  return path;
}
function lcaFn(a, b) {
  const setA = new Set(ancestors(a));
  for (const n of ancestors(b)) if (setA.has(n)) return n;
}

const leaves = nodes.filter(n => n.isLeaf);
{
  const n = leaves.length;
  const total = n * (n - 1) * (n - 2) / 6;
  const polytomies = [];

  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      for (let k = j + 1; k < n; k++) {
        const a = leaves[i].id, b = leaves[j].id, c = leaves[k].id;
        const lab = lcaFn(a, b), lac = lcaFn(a, c), lbc = lcaFn(b, c);
        if (lab === lac && lab === lbc)
          polytomies.push({ ids: [a, b, c], node: lab });
      }

  // Note: This takes time roughly n^3/1552 ms, so very roughly:
  // 25 leaves: 10 ms
  // 54 leaves: 100 ms
  // 116 leaves: 1 s
  // 250 leaves: 10 s
  // If phylogeny.js grows too large, we might need to do this less often.
  const playable = total - polytomies.length;
  console.log(`\nTriple analysis: ${n} leaves → C(${n},3) = ${total} triples`);
  console.log(`  Playable (unambiguous): ${playable}`);
  if (polytomies.length > 0) {
    warn(`${polytomies.length} polytomy triple(s) reduce playable count to ${playable}`);
    for (const p of polytomies.slice(0, 5)) {
      const names = p.ids.map(id => nodeMap[id].commonName);
      warn(`  Polytomy: ${names.join(', ')} — all branch from "${p.node}"`);
    }
    if (polytomies.length > 5) warn(`  … and ${polytomies.length - 5} more`);
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
