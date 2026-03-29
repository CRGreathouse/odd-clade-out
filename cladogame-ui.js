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
  $('correct-display').textContent  = correct;
  $('played-display').textContent   = played;
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
    <div class="card-overlay"><div class="x-mark"></div></div>`;
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
  updateCreatureScores(currentAnswer.odd, currentAnswer.pairA, currentAnswer.pairB, guessedId);

  if (isCorrect) {
    streak++;
    correct++;
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
  resultPanel.classList.add('visible');
  setTimeout(() => {
    const nextBtn = $('next-btn');
    nextBtn.classList.add('visible');
    nextBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    nextBtn.focus();
  }, 600);
}

// Number keys 1/2/3 select the corresponding card; Enter/Space on Next button
// is handled natively since it's a <button>.
document.addEventListener('keydown', e => {
  if (roundResolved) return;
  const idx = { '1': 0, '2': 1, '3': 2 }[e.key];
  if (idx !== undefined) {
    const cards = document.querySelectorAll('.card');
    if (cards[idx]) handleGuess(cards[idx].dataset.id);
  }
});

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
