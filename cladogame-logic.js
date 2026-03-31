// ══════════════════════════════════════════════════════════════════════════════
// Image resolution
// If org.image is set: use it as a path if it contains '/', otherwise prefix
// 'images/' and append '.png' if no extension is present.
// ══════════════════════════════════════════════════════════════════════════════
function resolveImage(org) {
  const img = org.image;
  if (!img) return null;
  const hasExt = /\.[a-z]{2,4}$/i.test(img);
  const hasPath = img.includes('/');
  return hasPath ? img : `images/${hasExt ? img : img + '.png'}`;
}

// ══════════════════════════════════════════════════════════════════════════════
// Tree logic — all functions take/return node id strings
// ══════════════════════════════════════════════════════════════════════════════
let nodeMap = {}, leaves = [];

function initTree(phylogeny) {
  nodeMap = {};
  for (const n of phylogeny.nodes) {
    nodeMap[n.id] = n;
  }
  leaves = phylogeny.nodes.filter(n => n.isLeaf);
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

// Returns a difficulty score 0 ≤ h < 1 (higher = harder), or -1 if ambiguous.
// Uses node identity to detect ambiguity: in a resolved binary triple, exactly
// two of the three pairwise LCAs are the same node (the overall LCA).  If all
// three are the same node it is a polytomy — unresolvable, skip it.
function tripleHardness(a, b, c) {
  const lab = lca(a, b), lac = lca(a, c), lbc = lca(b, c);
  if (lab === lac && lab === lbc) return -1; // polytomy — ambiguous
  const ages = [nodeMap[lab].age_mya, nodeMap[lac].age_mya, nodeMap[lbc].age_mya]
                 .sort((x, y) => x - y);
  // ages[0] = closest-pair LCA; ages[1] = ages[2] = overall LCA
  return ages[1] > 0 ? ages[0] / ages[1] : 0;
}

// Returns the id of the largest clade containing oddId but NOT containing
// pairNodeId — i.e. the child of lca(oddId, pairNodeId) on the path to oddId.
// Returns oddId itself when oddId is a direct sibling of pairNodeId in the
// tree (i.e. oddId.parent is also an ancestor of pairNodeId).
function exclusiveClade(oddId, pairNodeId) {
  const sharedAnc = lca(oddId, pairNodeId);
  for (let cur = oddId; cur !== null; cur = nodeMap[cur].parent) {
    if (nodeMap[cur].parent === sharedAnc) return cur;
  }
  return oddId; // shouldn't happen
}

// Returns { odd, pairA, pairB, pairNode, pairAge } — all id strings.
// Uses node identity: in a resolved binary triple exactly two pairwise LCAs are
// the same node (the overall LCA); the unique one is the closest pair's LCA.
// Returns null for polytomies (all three LCAs identical — no unique odd one out).
function oddOneOut(a, b, c) {
  const [ai, bi, ci] = [a.id, b.id, c.id];
  const lab = lca(ai, bi), lac = lca(ai, ci), lbc = lca(bi, ci);
  if (lab === lac && lab === lbc) return null; // polytomy
  if (lac === lbc) return { odd: ci, pairA: ai, pairB: bi, pairNode: lab, pairAge: nodeMap[lab].age_mya };
  if (lab === lbc) return { odd: bi, pairA: ai, pairB: ci, pairNode: lac, pairAge: nodeMap[lac].age_mya };
  return                   { odd: ai, pairA: bi, pairB: ci, pairNode: lbc, pairAge: nodeMap[lbc].age_mya };
}

// Returns target difficulty based on lifetime accuracy and current streak.
// Starts easy and scales up as the player improves; eases back on a cold streak.
function targetHardness() {
  if (played < 3) return 0.25;
  const accuracy = correct / played;
  const streakSignal = Math.min(1, streak / 8);
  return 0.2 + (accuracy * 0.6 + streakSignal * 0.4) * 0.65;
}

// Picks 2 distinct items from arr in O(1) using index-adjustment arithmetic.
function sampleTwo(arr) {
  const n = arr.length;
  let i = Math.floor(Math.random() * n);
  let j = Math.floor(Math.random() * (n - 1)); if (j >= i) j++;
  return [arr[i], arr[j]];
}

// Picks 3 distinct items from arr in O(1) using index-adjustment arithmetic.
function sampleThree(arr) {
  const n = arr.length;
  let i = Math.floor(Math.random() * n);
  let j = Math.floor(Math.random() * (n - 1)); if (j >= i) j++;
  let k = Math.floor(Math.random() * (n - 2));
  if (k >= Math.min(i, j)) k++;
  if (k >= Math.max(i, j)) k++;
  return [arr[i], arr[j], arr[k]];
}

// The next call to pickTriple() will guarantee this creature id is in the triple.
let forcedCreatureId = null;
function setForcedCreature(id) { forcedCreatureId = id; }

// Returns a valid triple of leaf node objects, targeted to the current difficulty.
// Weights candidates by hardness proximity and history (prefers unseen and
// previously-missed triples; down-weights already-mastered ones).
// If forcedCreatureId is set, the returned triple is guaranteed to include it.
function pickTriple() {
  const targetH = targetHardness();
  const history = loadHistory();
  const creatureScores = loadCreatureScores();
  const pool = [];

  const available = leavesAvailable();
  const forced = forcedCreatureId ? nodeMap[forcedCreatureId] : null;
  forcedCreatureId = null; // consume immediately so it only affects one round
  const others = forced ? available.filter(l => l.id !== forced.id) : null;

  for (let attempt = 0; attempt < 120; attempt++) {
    const [a, b, c] = forced ? [forced, ...sampleTwo(others)] : sampleThree(available);
    const h = tripleHardness(a.id, b.id, c.id);
    if (h < 0) continue; // ambiguous

    // History weight: unseen = 1.0, all correct = 0.2, all wrong = 2.0
    const rec = history[tripleKey(a.id, b.id, c.id)];
    const histWeight = rec && rec.played > 0
      ? 0.2 + (1 - rec.correct / rec.played) * 1.8
      : 1.0;

    // Hardness weight: peaks at targetH, falls off on either side
    const hardWeight = Math.max(0.05, 1 - 2 * Math.abs(h - targetH));

    // Creature weight: triples containing unfamiliar/confused creatures get
    // higher weight; triples of already-mastered creatures get lower weight.
    // Range [0.3, 2.0], centred at 1.0 for unseen creatures (score 0).
    const avgFam = [a, b, c].reduce((s, org) => s + (creatureScores[org.id] || 0), 0) / 3;
    const creatureWeight = Math.max(0.3, Math.min(2.0, 1.0 - avgFam * 0.25));

    pool.push({ triple: [a, b, c], hardness: h, weight: histWeight * hardWeight * creatureWeight });
    if (pool.length >= 40) break;
  }

  if (!pool.length) { currentHardness = 0; return forced ? [forced, ...sampleTwo(others)] : available.slice(0, 3); }

  // Weighted random selection
  const total = pool.reduce((s, p) => s + p.weight, 0);
  let r = Math.random() * total;
  for (const p of pool) {
    r -= p.weight;
    if (r <= 0) { currentHardness = p.hardness; return p.triple; }
  }
  const last = pool[pool.length - 1];
  currentHardness = last.hardness;
  return last.triple;
}

// ══════════════════════════════════════════════════════════════════════════════
// Game state
// ══════════════════════════════════════════════════════════════════════════════
let streak = 0, correct = 0, played = 0;
let currentAnswer = null;
let currentHardness = 0;
let roundResolved = false;

// ══════════════════════════════════════════════════════════════════════════════
// Persistence (localStorage)
// ══════════════════════════════════════════════════════════════════════════════
const HISTORY_KEY        = 'cladogame_v1_history';
const CREATURE_KEY       = 'cladogame_v1_creatures';
const XP_KEY             = 'cladogame_v1_xp';
const UNLOCK_KEY         = 'cladogame_v1_unlocked';
const LONGEST_STREAK_KEY = 'cladogame_v1_longest_streak';
const PRESTIGE_KEY       = 'cladogame_v1_prestige';
const ALLTIME_KEY        = 'cladogame_v1_alltime';

function tripleKey(a, b, c) { return [a, b, c].sort().join(','); }

function loadFromStorage(key) {
  try { return JSON.parse(localStorage.getItem(key) || '{}'); }
  catch { return {}; }
}
function saveToStorage(key, data) {
  try { localStorage.setItem(key, JSON.stringify(data)); }
  catch (e) { console.warn(`Failed to save ${key}:`, e); }
}

function loadHistory()        { return loadFromStorage(HISTORY_KEY); }
function loadCreatureScores() { return loadFromStorage(CREATURE_KEY); }

function saveResult(a, b, c, wasCorrect) {
  const history = loadHistory();
  const key = tripleKey(a, b, c);
  const prev = history[key] || { played: 0, correct: 0 };
  history[key] = { played: prev.played + 1, correct: prev.correct + (wasCorrect ? 1 : 0) };
  saveToStorage(HISTORY_KEY, history);
}

// Update familiarity after a guess.
//   oddId    — the correct answer (the odd one out)
//   pairAId, pairBId — the closer pair
//   guessedId — what the player actually clicked
// If wrong: the guessed creature and the missed correct answer both lose
// familiarity (they were confused with each other).  The untouched pair member
// gets a small positive signal (correctly left alone).
// If correct: all three gain a little.
function updateCreatureScores(oddId, pairAId, pairBId, guessedId) {
  const scores = loadCreatureScores();
  const bump = (id, delta) => {
    scores[id] = Math.max(-5, Math.min(5, (scores[id] || 0) + delta));
  };
  if (guessedId === oddId) {
    bump(oddId,   0.2);
    bump(pairAId, 0.1);
    bump(pairBId, 0.1);
  } else {
    bump(guessedId, -3.0); // wrongly chosen as the odd one
    bump(oddId,     -2.0); // failed to identify as the odd one
  }
  saveToStorage(CREATURE_KEY, scores);
}

// ── XP and creature unlocks ───────────────────────────────────────────────────
function loadXp() {
  return Math.max(0, parseInt(localStorage.getItem(XP_KEY) || '0', 10) || 0);
}
function saveXp(n) {
  try { localStorage.setItem(XP_KEY, String(Math.max(0, n))); } catch {}
}

function loadLongestStreak() {
  return Math.max(0, parseInt(localStorage.getItem(LONGEST_STREAK_KEY) || '0', 10) || 0);
}
function saveLongestStreak(n) {
  try { localStorage.setItem(LONGEST_STREAK_KEY, String(n)); } catch {}
}

function loadPrestige() {
  return Math.max(0, parseInt(localStorage.getItem(PRESTIGE_KEY) || '0', 10) || 0);
}
function savePrestige(n) {
  try { localStorage.setItem(PRESTIGE_KEY, String(n)); } catch {}
}

function loadAlltime() {
  try {
    const d = JSON.parse(localStorage.getItem(ALLTIME_KEY) || '{}');
    return { played: d.played || 0, correct: d.correct || 0 };
  } catch { return { played: 0, correct: 0 }; }
}
function saveAlltime(d) {
  try { localStorage.setItem(ALLTIME_KEY, JSON.stringify(d)); } catch {}
}

const PRESTIGE_TITLES = [
  'Naturalist', 'Biologist', 'Ecologist',
  'Taxonomist', 'Phylogeneticist', 'Systematist',
];
function prestigeTitle(level) {
  if (level === 0) return null;
  return PRESTIGE_TITLES[Math.min(level - 1, PRESTIGE_TITLES.length - 1)];
}

// True when every creature in the tree (all tiers) is available to the player.
function allCreaturesUnlocked() {
  return leavesAvailable().length === leaves.length;
}

// Resets per-run data (XP, unlocks, history, creature scores, session counters)
// while accumulating totals into the all-time bucket and incrementing prestige.
// Returns the new prestige level.
function doPrestige() {
  // Fold current run's history into all-time before clearing
  const alltime = loadAlltime();
  for (const rec of Object.values(loadHistory())) {
    alltime.played  += rec.played;
    alltime.correct += rec.correct;
  }
  saveAlltime(alltime);

  // Clear per-run data
  saveToStorage(HISTORY_KEY,  {});
  saveToStorage(CREATURE_KEY, {});
  saveXp(0);
  saveUnlocked([]);

  // Reset in-session counters
  streak = 0; correct = 0; played = 0;
  recentCorrectTimes = [];

  const newLevel = loadPrestige() + 1;
  savePrestige(newLevel);
  return newLevel;
}

function loadUnlocked() {
  try { return JSON.parse(localStorage.getItem(UNLOCK_KEY) || '[]'); }
  catch { return []; }
}
function saveUnlocked(arr) {
  try { localStorage.setItem(UNLOCK_KEY, JSON.stringify(arr)); } catch {}
}

// All tier-1 leaves plus any individually unlocked creatures.
function leavesAvailable() {
  const unlocked = new Set(loadUnlocked());
  return leaves.filter(l => l.tier === 1 || unlocked.has(l.id));
}

// Cumulative XP threshold for the next unlock.
// Cost of each unlock = 5 × tier.  Unlocks proceed tier-by-tier (tier 2 first,
// then tier 3, etc.); within a tier the order is random.
function computeNextUnlockThreshold() {
  const unlockedArr = loadUnlocked();
  const unlockedSet = new Set(unlockedArr);
  let totalCost = 0;
  for (const id of unlockedArr) {
    const node = nodeMap[id];
    if (node) totalCost += 5 * node.tier;
  }
  for (let t = 2; t <= 9; t++) {
    if (leaves.some(l => l.tier === t && !unlockedSet.has(l.id)))
      return totalCost + 5 * t;
  }
  return Infinity; // everything unlocked
}

// Checks whether current XP crosses the next threshold and, if so, picks a
// random creature from the lowest locked tier, unlocks it, and returns it.
// Returns null if no unlock triggered.
function tryUnlock(xp) {
  if (xp < computeNextUnlockThreshold()) return null;
  const unlockedArr = loadUnlocked();
  const unlockedSet = new Set(unlockedArr);
  for (let t = 2; t <= 9; t++) {
    const locked = leaves.filter(l => l.tier === t && !unlockedSet.has(l.id));
    if (locked.length > 0) {
      const creature = locked[Math.floor(Math.random() * locked.length)];
      saveUnlocked([...unlockedArr, creature.id]);
      return creature;
    }
  }
  return null;
}

// Updates XP after a guess (+2 correct, −1 wrong, floor 0).
// Returns the newly unlocked creature node, or null.
function applyGuessXp(isCorrect) {
  const xp = Math.max(0, loadXp() + (isCorrect ? 2 : -1));
  saveXp(xp);
  return tryUnlock(xp);
}

// ── Statistics ───────────────────────────────────────────────────────────────
// Computes all-time stats from localStorage history.
// Clade attribution: each round is counted once per distinct major clade
// represented among its three organisms (so a round with two mammals and one
// bird contributes one tally to Mammals and one to Birds).
function computeStats() {
  // Most-specific clades first: each leaf walks ancestors until a match is found.
  const STAT_CLADES = [
    { id: 'mammalia',       label: 'Mammals' },
    { id: 'aves',           label: 'Birds' },
    { id: 'sauropsida',     label: 'Reptiles' },
    { id: 'amphibia_clade', label: 'Amphibians' },
    { id: 'actinopterygii', label: 'Ray-finned fish' },
    { id: 'chondrichthyes', label: 'Sharks & rays' },
    { id: 'sarcopterygii',  label: 'Lobe-finned fish' },
    { id: 'arthropoda',     label: 'Arthropods' },
    { id: 'mollusca',       label: 'Molluscs' },
    { id: 'animalia',       label: 'Other animals' },
    { id: 'plants_clade',   label: 'Plants' },
    { id: 'fungi',          label: 'Fungi' },
    { id: 'diaphoretickes', label: 'Algae & protists' },
    { id: 'bacteria',       label: 'Bacteria' },
    { id: 'archaea',        label: 'Archaea' },
    { id: 'root',           label: 'Other' },
  ];
  const cladeSet   = new Set(STAT_CLADES.map(c => c.id));
  const cladeLabel = Object.fromEntries(STAT_CLADES.map(c => [c.id, c.label]));

  function leafClade(id) {
    for (let cur = id; cur !== null; cur = nodeMap[cur]?.parent) {
      if (cladeSet.has(cur)) return cladeLabel[cur];
    }
    return 'Other';
  }

  const history    = loadHistory();
  const cladeStats = {};     // label → { played, correct }
  let hardestCorrect = null;
  let hardestH = -1;
  let totalPlayed = 0, totalCorrect = 0;

  for (const [key, rec] of Object.entries(history)) {
    if (!rec.played) continue;
    totalPlayed  += rec.played;
    totalCorrect += rec.correct;

    const [a, b, c] = key.split(',');
    if (!nodeMap[a] || !nodeMap[b] || !nodeMap[c]) continue; // stale entry

    const h = tripleHardness(a, b, c);
    if (h < 0) continue; // polytomy

    const ans = oddOneOut(nodeMap[a], nodeMap[b], nodeMap[c]);
    if (!ans) continue;

    // Attribute this round to the odd-one-out's clade only
    const label = leafClade(ans.odd);
    if (!cladeStats[label]) cladeStats[label] = { played: 0, correct: 0 };
    cladeStats[label].played  += rec.played;
    cladeStats[label].correct += rec.correct;

    // Track hardest triple answered correctly at least once
    if (rec.correct > 0 && h > hardestH) {
      hardestH = h; hardestCorrect = { odd: ans.odd, pairA: ans.pairA, pairB: ans.pairB, h };
    }
  }

  const alltime = loadAlltime();
  return {
    totalPlayed,
    totalCorrect,
    alltimePlayed:  alltime.played  + totalPlayed,
    alltimeCorrect: alltime.correct + totalCorrect,
    prestige:       loadPrestige(),
    longestStreak:  loadLongestStreak(),
    cladeAccuracy:  Object.entries(cladeStats)
                      .map(([label, s]) => ({ label, played: s.played, correct: s.correct }))
                      .sort((a, b) => b.played - a.played),
    hardestCorrect,
  };
}

// ── Hot-streak detection ──────────────────────────────────────────────────────
let recentCorrectTimes = [];

const STREAK_WINDOW_MS = 30_000; // 30 seconds
const STREAK_THRESHOLD = 3;      // 3 correct answers within the window

function resetStreak() {
  streak = 0;
  recentCorrectTimes = [];
}

// Records a correct answer timestamp and returns true if a hot streak is
// detected (and resets the window so it doesn't fire again immediately).
function recordCorrectAndCheckStreak(now) {
  recentCorrectTimes.push(now);
  if (streak < STREAK_THRESHOLD) return false;
  const n = recentCorrectTimes.length;
  if (n >= STREAK_THRESHOLD && (now - recentCorrectTimes[n - STREAK_THRESHOLD]) <= STREAK_WINDOW_MS) {
    recentCorrectTimes = [];
    return true;
  }
  return false;
}

// ── Result explanation (HTML string, no DOM writes) ───────────────────────────
function buildExplanation(answer, isCorrect) {
  const { odd, pairA, pairB, pairNode, pairAge } = answer;
  const clade = nodeMap[pairNode];
  const cladeUrl = node => 'https://en.wikipedia.org/wiki/' + (node.wiki || node.sci).replace(/ /g, '_');
  const formatClade = node => `<a class="clade-name" href="${cladeUrl(node)}" target="_blank" rel="noopener noreferrer">${node.label}</a> (<i>${node.sci}</i>)`;
  const age = pairAge >= 1000
    ? `${(pairAge / 1000).toFixed(1)} billion`
    : `${Math.round(pairAge)} million`;
  const intro = isCorrect ? 'Correct!' : `The odd one out was <strong>${nodeMap[odd].commonName}</strong>.`;
  const traitOf = node => node.trait ? ` — ${node.trait}` : '';
  const pairSep = clade.trait ? ` —` : `,`;
  let explanation = `${intro} <strong>${nodeMap[pairA].commonName}</strong> and <strong>${nodeMap[pairB].commonName}</strong> `
    + `are both ${formatClade(clade)}${traitOf(clade)}${pairSep} `
    + `having diverged ~${age} years ago — making <strong>${nodeMap[odd].commonName}</strong> the more distant relative.`;

  const excId = exclusiveClade(odd, pairNode);
  if (excId === odd) {
    const parent = nodeMap[nodeMap[odd].parent];
    explanation += ` All three belong to ${formatClade(parent)}${traitOf(parent)}.`;
  } else {
    const excNode = nodeMap[excId];
    explanation += ` <strong>${nodeMap[odd].commonName}</strong> belongs to ${formatClade(excNode)}${traitOf(excNode)}.`;
  }

  return explanation;
}

// ── Node.js exports (browser ignores this block) ──────────────────────────────
if (typeof module !== 'undefined') {
  module.exports = {
    initTree, ancestors, lca, lcaAge, tripleHardness, exclusiveClade, oddOneOut,
    targetHardness, buildExplanation,
    recordCorrectAndCheckStreak,
    tripleKey, loadHistory, saveResult, loadCreatureScores, updateCreatureScores,
    resolveImage, pickTriple,
    STREAK_THRESHOLD, STREAK_WINDOW_MS,
    HISTORY_KEY,
    loadXp, saveXp, loadUnlocked, saveUnlocked, leavesAvailable,
    computeNextUnlockThreshold, tryUnlock, applyGuessXp, setForcedCreature,
    XP_KEY, UNLOCK_KEY,
    loadLongestStreak, saveLongestStreak, LONGEST_STREAK_KEY,
    loadPrestige, savePrestige, PRESTIGE_KEY,
    loadAlltime, saveAlltime, ALLTIME_KEY,
    PRESTIGE_TITLES, prestigeTitle,
    allCreaturesUnlocked, doPrestige,
    computeStats,
    _set(s) {
      if (s.streak             !== undefined) streak             = s.streak;
      if (s.correct            !== undefined) correct            = s.correct;
      if (s.played             !== undefined) played             = s.played;
      if (s.recentCorrectTimes !== undefined) recentCorrectTimes = s.recentCorrectTimes;
    },
    _get() {
      return { streak, correct, played, recentCorrectTimes: [...recentCorrectTimes] };
    },
  };
}
