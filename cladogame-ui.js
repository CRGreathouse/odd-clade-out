// ══════════════════════════════════════════════════════════════════════════════
// DOM helpers
// ══════════════════════════════════════════════════════════════════════════════
const $ = id => document.getElementById(id);

function flashEl(el, animName) {
  el.style.animation = 'none';
  void el.offsetWidth; // force reflow
  el.style.animation = `${animName} 0.6s ease forwards`;
  el.classList.add('bump');
  setTimeout(() => { el.style.animation = ''; el.classList.remove('bump'); }, 650);
}

function updateStats() {
  $('streak-display').textContent   = streak;
  $('correct-display').textContent  = correct + '/' + played;
  $('species-display').textContent  = leavesAvailable().length;
}

// ══════════════════════════════════════════════════════════════════════════════
// Card HTML builder
// ══════════════════════════════════════════════════════════════════════════════
function buildCardHTML(org) {
  const src = resolveImage(org);
  const placeholder = `<div class="card-image-placeholder">
    <div class="card-image-icon">${org.emoji}</div>
    <div class="card-image-text">Image coming soon</div>
  </div>`;
  // onerror falls back to placeholder; using data-emoji avoids closure issues
  const imageContent = src
    ? `<img src="${src}" alt="${org.commonName}" loading="lazy"
            data-emoji="${org.emoji}"
            onerror="this.parentElement.innerHTML='<div class=\\'card-image-placeholder\\'><div class=\\'card-image-icon\\'>' + this.dataset.emoji + '</div><div class=\\'card-image-text\\'>Image unavailable</div></div>'">`
    : placeholder;
  return `
    <div class="card-image">${imageContent}</div>
    <div class="card-common">${org.commonName}</div>
    <div class="card-sci">${org.sci}</div>
    ${org.funFact ? `<div class="card-divider"></div><div class="card-fact">${org.funFact}</div>` : ''}
    <div class="card-overlay"><div class="x-mark"></div><div class="check-mark"></div></div>`;
}

// ══════════════════════════════════════════════════════════════════════════════
// Animations
// ══════════════════════════════════════════════════════════════════════════════
function triggerHotStreak() {
  const overlay = $('streak-overlay');
  overlay.classList.add('active');
  for (let i = 0; i < 28; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.cssText = `
      left: ${Math.random() * 100}%;
      top: ${Math.random() * 100}%;
      --dx: ${(Math.random() - 0.5) * 200}px;
      --dy: ${-(60 + Math.random() * 140)}px;
      --hue: ${Math.random() * 60 + 30};
      animation-delay: ${Math.random() * 0.4}s;
      animation-duration: ${0.7 + Math.random() * 0.5}s;`;
    overlay.appendChild(p);
  }
  setTimeout(() => {
    overlay.classList.remove('active');
    overlay.querySelectorAll('.particle').forEach(p => p.remove());
  }, 1800);
}

// ── New-creature unlock reveal ────────────────────────────────────────────────
let pendingUnlock       = null;
let lastUnlockedCreature = null; // creature shown in reveal; forced into next round

function triggerNewCreature(creature) {
  lastUnlockedCreature = creature;
  const overlay  = $('newcreature-overlay');
  const src      = resolveImage(creature);
  $('newcreature-image').innerHTML = src
    ? `<img src="${src}" alt="${creature.commonName}" loading="lazy">`
    : `<div class="card-image-placeholder"><div class="card-image-icon">${creature.emoji}</div></div>`;
  $('newcreature-common').textContent = creature.commonName;
  $('newcreature-sci').textContent    = creature.sci;
  $('newcreature-fact').textContent   = creature.funFact;

  for (let i = 0; i < 30; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.cssText = `left:${Math.random()*100}%;top:${Math.random()*100}%;` +
      `--dx:${(Math.random()-0.5)*220}px;--dy:${-(80+Math.random()*160)}px;` +
      `--hue:${Math.random()*180+200};` +
      `animation-delay:${Math.random()*0.35}s;animation-duration:${0.8+Math.random()*0.6}s;`;
    overlay.appendChild(p);
  }
  overlay.classList.add('active');
}

// ══════════════════════════════════════════════════════════════════════════════
// Round management
// ══════════════════════════════════════════════════════════════════════════════
function nextRound() {
  roundResolved = false;
  const resultPanel = $('result-panel');
  resultPanel.className = 'result-panel';
  resultPanel.innerHTML = '';
  $('next-btn').classList.remove('visible');

  const triple = pickTriple();
  currentAnswer = oddOneOut(...triple); // pickTriple filters polytomies, so null is unexpected here
  if (!currentAnswer) { nextRound(); return; } // safety fallback

  const grid = $('cards-grid');
  grid.innerHTML = '';
  grid.classList.remove('post-round');

  const displayOrder = [...triple].sort(() => Math.random() - 0.5);
  for (const org of displayOrder) {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.id = org.id;
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.innerHTML = buildCardHTML(org);
    grid.appendChild(card);
  }
  grid.querySelector('.card')?.focus();
}

function handleGuess(guessedId) {
  if (roundResolved) return;
  roundResolved = true;

  const isCorrect = guessedId === currentAnswer.odd;
  const now = Date.now();
  played++;
  saveResult(currentAnswer.odd, currentAnswer.pairA, currentAnswer.pairB, isCorrect);
  saveRoundLog(currentAnswer.odd, currentAnswer.pairA, currentAnswer.pairB, guessedId, isCorrect);
  updateCreatureScores(currentAnswer.odd, currentAnswer.pairA, currentAnswer.pairB, guessedId);

  if (isCorrect) {
    streak++;
    correct++;
    if (streak > loadLongestStreak()) saveLongestStreak(streak);
    flashEl($('streak-display'), 'scoreFlash');
    if (recordCorrectAndCheckStreak(now)) triggerHotStreak();
  } else {
    resetStreak();
    flashEl($('streak-display'), 'scoreFlashRed');
  }

  const unlocked = applyGuessXp(isCorrect);
  if (unlocked) pendingUnlock = unlocked;
  updateStats();

  for (const card of document.querySelectorAll('.card')) {
    card.classList.add('resolved');
    card.tabIndex = -1;
    if (card.dataset.id === currentAnswer.odd)              card.classList.add('correct');
    else if (card.dataset.id === guessedId && !isCorrect)   card.classList.add('wrong');
    else                                                     card.classList.add('dimmed');
  }

  const resultPanel = $('result-panel');
  $('cards-grid').classList.add('post-round');
  resultPanel.innerHTML = buildExplanation(currentAnswer, isCorrect);
  resultPanel.insertAdjacentHTML('beforeend',
    '<div class="cladogram">' + buildCladogram(currentAnswer) + '</div>');

  resultPanel.classList.add('visible');
  setTimeout(() => {
    const nextBtn = $('next-btn');
    nextBtn.classList.add('visible');
    nextBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    nextBtn.focus();
  }, 600);
}

// ══════════════════════════════════════════════════════════════════════════════
// Mini cladogram SVG
// ══════════════════════════════════════════════════════════════════════════════

// Returns an inline SVG string showing a proportional 3-taxon horizontal
// phylogram.  Root is on the left; tips (present day) are on the right.
// The pair clade is drawn in gold; the odd-one-out branch is dim.
// Branch lengths are proportional to age, with a 30px minimum for the pair
// split so it stays visible even when the pair is very young relative to root.
function buildCladogram(answer) {
  const { odd, pairA, pairB, pairAge } = answer;
  const rootAge = lcaAge(odd, pairA);   // age of the triple's overall LCA

  // ── Layout constants ────────────────────────────────────────────────────────
  const W = 460, H = 112;
  const xL = 22, xR = 258;             // root x, tip-line x
  const tw = xR - xL;                   // pixel width of time axis
  const yO = 15, yA = 58, yB = 96;     // y positions: odd, pairA, pairB
  const yM = (yA + yB) / 2;             // 77 — midpoint of pair span
  const lx = xR + 12;                   // organism label start x

  // Pair-node x: proportional to age, clamped so the pair split stays visible
  const xP = Math.min(xL + (1 - pairAge / rootAge) * tw, xR - 30);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const fmt = m => m >= 1000
    ? `${(m / 1000).toFixed(2).replace(/\.?0+$/, '')} Ga`
    : `${Math.round(m)} Ma`;

  const ln = (x1, y1, x2, y2, c, w = 1.5) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`;
  const tx = (x, y, s, c, anchor = 'start', fs = '0.67rem') =>
    `<text x="${x}" y="${y}" fill="${c}" font-size="${fs}" font-family="var(--font-body)" text-anchor="${anchor}" dominant-baseline="middle">${s}</text>`;
  const ct = (x, y, r, c) =>
    `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/>`;

  const DIM = 'var(--text-dim)', SEC = 'var(--text-secondary)', GOLD = 'var(--gold)';

  return [
    `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;overflow:visible" xmlns="http://www.w3.org/2000/svg">`,
    // Tree lines
    ln(xL, yO, xL, yM, DIM),            // root vertical (odd side → pair side)
    ln(xL, yO, xR, yO, DIM),            // odd-one-out horizontal branch
    ln(xL, yM, xP, yM, GOLD),           // stem leading to pair node
    ln(xP, yA, xP, yB, GOLD),           // pair vertical
    ln(xP, yA, xR, yA, GOLD),           // pairA horizontal
    ln(xP, yB, xR, yB, GOLD),           // pairB horizontal
    // Node dots
    ct(xL, yO, 2.5, DIM),
    ct(xL, yM, 2.5, GOLD),
    ct(xP, yM, 2.5, GOLD),
    // Organism labels
    tx(lx, yO, nodeMap[odd].commonName,   SEC),
    tx(lx, yA, nodeMap[pairA].commonName, SEC),
    tx(lx, yB, nodeMap[pairB].commonName, SEC),
    // Age labels below their respective junction points
    tx(xL + 3, yM + 11, fmt(rootAge), DIM,  'start', '0.61rem'),
    tx(xP + 3, yM + 11, fmt(pairAge), GOLD, 'start', '0.61rem'),
    '</svg>',
  ].join('');
}

// Number keys 1/2/3 select the corresponding card; Enter/Space on Next button
// is handled natively since it's a <button>.
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeStats(); return; }
  if (roundResolved) return;
  const idx = { '1': 0, '2': 1, '3': 2 }[e.key];
  if (idx !== undefined) {
    const cards = document.querySelectorAll('.card');
    if (cards[idx]) handleGuess(cards[idx].dataset.id);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// Statistics overlay
// ══════════════════════════════════════════════════════════════════════════════
function openStats() {
  renderStats();
  $('stats-overlay').classList.add('active');
}

function closeStats() {
  $('stats-overlay').classList.remove('active');
}

function renderStats() {
  const s = computeStats();

  // Summary: always show all-time numbers
  $('stats-accuracy-val').textContent = s.alltimePlayed > 0
    ? Math.round(s.alltimeCorrect / s.alltimePlayed * 100) + '%' : '—';
  $('stats-played-val').textContent   = s.alltimePlayed  || '—';
  $('stats-streak-val').textContent   = s.longestStreak  || '—';

  // Prestige level in header
  const plEl = $('stats-prestige-level');
  if (s.prestige > 0) {
    plEl.textContent   = `${prestigeTitle(s.prestige)} · Run ${s.prestige + 1}`;
    plEl.style.display = '';
  } else {
    plEl.style.display = 'none';
  }

  // Clade / hardest sections are per-run (reset on prestige)
  if (s.totalPlayed === 0) {
    $('stats-no-data').style.display = '';
    $('stats-data').style.display    = 'none';
  } else {
    $('stats-no-data').style.display = 'none';
    $('stats-data').style.display    = '';

    // Clade accuracy rows
    const cladeEl = $('stats-clades');
    cladeEl.innerHTML = '';
    for (const c of s.cladeAccuracy) {
      const pct = Math.round(c.correct / c.played * 100);
      const row = document.createElement('div');
      row.className = 'clade-stat-row';
      row.innerHTML =
        `<span class="clade-stat-name">${c.label}</span>` +
        `<div class="clade-stat-bar-wrap"><div class="clade-stat-bar" style="width:${pct}%"></div></div>` +
        `<span class="clade-stat-pct">${pct}%</span>` +
        `<span class="clade-stat-n">${c.played}</span>`;
      cladeEl.appendChild(row);
    }

    // Round history log
    const log = loadRoundLog();
    const histEl = $('stats-history');
    histEl.innerHTML = '';
    for (const entry of log) {
      const { odd, pairA, pairB, guessedId, wasCorrect } = entry;
      const oddNode   = nodeMap[odd];
      const pairANode = nodeMap[pairA];
      const pairBNode = nodeMap[pairB];
      if (!oddNode || !pairANode || !pairBNode) continue; // guard against stale IDs
      const row = document.createElement('div');
      row.className = `history-row ${wasCorrect ? 'history-correct' : 'history-wrong'}`;
      const marker = wasCorrect ? '✓' : '✗';
      let guess = '';
      if (!wasCorrect && guessedId && nodeMap[guessedId]) {
        guess = ` <span class="history-guess">(chose ${nodeMap[guessedId].commonName})</span>`;
      }
      row.innerHTML =
        `<span class="history-marker">${marker}</span>` +
        `<span class="history-body">` +
          `<span class="history-pair">${pairANode.commonName} &amp; ${pairBNode.commonName}</span>` +
          ` <span class="history-sep">·</span> ` +
          `<span class="history-odd">${oddNode.commonName}</span>` +
          ` <span class="history-odd-label">odd one out</span>${guess}` +
        `</span>`;
      histEl.appendChild(row);
    }

    // Hardest correct triple
    const hw = $('stats-hardest-wrap');
    if (s.hardestCorrect) {
      const { odd, pairA, pairB, h } = s.hardestCorrect;
      $('stats-hardest').innerHTML =
        `<div class="hardest-row">` +
          `<strong>${nodeMap[odd].commonName}</strong>` +
          ` <span class="hardest-vs">was the odd one out vs</span> ` +
          `<strong>${nodeMap[pairA].commonName}</strong> &amp; <strong>${nodeMap[pairB].commonName}</strong>` +
        `</div>` +
        `<div class="hardest-difficulty">Difficulty: ${Math.round(h * 100)}%</div>`;
      hw.style.display = '';
    } else {
      hw.style.display = 'none';
    }
  }

  // Prestige section: only show when all creatures are unlocked
  const ps = $('stats-prestige-section');
  if (allCreaturesUnlocked()) {
    ps.style.display = '';
    hidePrestigeConfirm();
  } else {
    ps.style.display = 'none';
  }
}

function showPrestigeConfirm() {
  $('stats-prestige-ready').style.display   = 'none';
  $('stats-prestige-confirm').style.display = '';
}

function hidePrestigeConfirm() {
  $('stats-prestige-ready').style.display   = '';
  $('stats-prestige-confirm').style.display = 'none';
}

function confirmPrestige() {
  doPrestige();
  closeStats();
  updateStats();
  updatePrestigeBadge();
  nextRound();
}

function updatePrestigeBadge() {
  const p  = loadPrestige();
  const el = $('prestige-badge');
  if (p > 0) {
    el.textContent   = `${prestigeTitle(p)} · Run ${p + 1}`;
    el.style.display = '';
  } else {
    el.style.display = 'none';
  }
}

function handleNextClick() {
  if (pendingUnlock) {
    triggerNewCreature(pendingUnlock);
    pendingUnlock = null;
  } else {
    nextRound();
  }
}

function boot() {
  initTree(phylogeny);
  updateStats();
  updatePrestigeBadge();

  // Delegated listeners on the grid handle all card interactions for every round.
  const grid = $('cards-grid');
  grid.addEventListener('click', e => {
    const card = e.target.closest('.card');
    if (card) handleGuess(card.dataset.id);
  });
  grid.addEventListener('keydown', e => {
    const card = e.target.closest('.card');
    if (!card) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleGuess(card.dataset.id);
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown' ||
               e.key === 'ArrowLeft'  || e.key === 'ArrowUp') {
      e.preventDefault();
      const cards = [...grid.querySelectorAll('.card')];
      const i = cards.indexOf(card);
      const dir = (e.key === 'ArrowRight' || e.key === 'ArrowDown') ? 1 : -1;
      cards[(i + dir + cards.length) % cards.length]?.focus();
    }
  });

  $('newcreature-overlay').addEventListener('click', () => {
    const overlay = $('newcreature-overlay');
    overlay.classList.remove('active');
    overlay.querySelectorAll('.particle').forEach(p => p.remove());
    if (lastUnlockedCreature) {
      setForcedCreature(lastUnlockedCreature.id);
      lastUnlockedCreature = null;
    }
    nextRound();
  });

  nextRound();
}

boot();
