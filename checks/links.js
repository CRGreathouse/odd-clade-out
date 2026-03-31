#!/usr/bin/env node
'use strict';

// Checks that every Wikipedia URL derived from phylogeny.js actually resolves.
// Makes one HEAD request per node, spaced DELAY_MS apart, to avoid hammering
// the server.
//
// Output conventions (mirrors checks/validate.js):
//   OK:    → stdout  (2xx)
//   WARN:  → stderr  (3xx redirect, 5xx server error, network error)
//   ERROR: → stderr  (4xx — link is broken)
//
// For 3xx responses the Location header (new URL) is shown when available.
//
// To see only problems:   node checks/links.js 2>&1 1>/dev/null
// To see everything:      node checks/links.js 2>&1 | tee links-report.txt
//
// Exit code: 1 if any 4xx responses, 0 otherwise.

const https    = require('https');
const phylogeny = require('../phylogeny.js');
const nodes    = phylogeny.nodes;

const DELAY_MS = 5000;
const UA       = 'odd-clade-out-linkcheck/1.0 (personal educational game; non-automated spot check)';

// Build the Wikipedia URL for a node using the same logic as the game.
// Leaves use sci; internal nodes prefer the wiki override, then sci.
function nodeWikiUrl(node) {
  const key  = node.wiki || node.sci;
  return 'https://en.wikipedia.org/wiki/' + key.replace(/ /g, '_');
}

function headRequest(url) {
  return new Promise(resolve => {
    const opts = { method: 'HEAD', headers: { 'User-Agent': UA } };
    const req  = https.request(url, opts, res => {
      res.resume(); // discard body, free the socket
      resolve({ status: res.statusCode, location: res.headers['location'] ?? null });
    });
    req.on('error', err => resolve({ status: null, err: err.message }));
    req.setTimeout(15000, () => { req.destroy(); resolve({ status: null, err: 'timeout' }); });
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  let errors = 0, warnings = 0;
  const total = nodes.length;

  if (dryRun) {
    console.log(`Dry run — ${total} nodes would be checked:\n`);
  } else {
    console.log(`Checking ${total} nodes (${DELAY_MS / 1000}s between requests)…\n`);
  }

  for (let i = 0; i < total; i++) {
    const node = nodes[i];
    const url  = nodeWikiUrl(node);
    const name = node.isLeaf ? node.commonName : node.label;
    const tag  = node.isLeaf ? 'leaf    ' : 'internal';
    const idx  = `[${String(i + 1).padStart(3)}/${total}]`;

    if (dryRun) {
      console.log(`${idx} ${tag}  ${name.padEnd(35)} ${url}`);
      continue;
    }

    if (i > 0) await sleep(DELAY_MS);

    const { status, location, err } = await headRequest(url);

    if (status === null) {
      console.warn(`WARN:  ${idx} ${tag}  ${name} (${node.id}) — network error: ${err}`);
      warnings++;
    } else if (status >= 200 && status < 300) {
      console.log(`OK:    ${idx} ${tag}  ${name}`);
    } else if (status >= 300 && status < 400) {
      const dest = location ?? '(no Location header)';
      console.warn(`WARN:  ${idx} ${tag}  ${name} (${node.id}) — ${status} → ${dest}`);
      warnings++;
    } else if (status >= 400 && status < 500) {
      console.error(`ERROR: ${idx} ${tag}  ${name} (${node.id}) — ${status}  ${url}`);
      errors++;
    } else if (status >= 500) {
      console.warn(`WARN:  ${idx} ${tag}  ${name} (${node.id}) — ${status} (server error, Wikipedia may be down)`);
      warnings++;
    } else {
      console.warn(`WARN:  ${idx} ${tag}  ${name} (${node.id}) — unexpected status ${status}  ${url}`);
      warnings++;
    }
  }

  if (dryRun) return;
  console.log(`\nChecked ${total} nodes — ${errors} error(s), ${warnings} warning(s)`);
  process.exit(errors > 0 ? 1 : 0);
}

main();
