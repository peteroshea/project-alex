'use strict';

// =============================================
//  PROJECT ALEX — PokeAPI version
//  pokeapi.co is CDN-backed, fast, and free
// =============================================

const API          = 'https://pokeapi.co/api/v2/pokemon/';
const TOTAL_POKEMON = 1025;   // Gen 1–9
const POOL_SIZE    = 20;      // parallel fetches per batch
const POOL_REFILL  = 5;       // refill when pool drops below this
const COLL_KEY     = 'projectAlex_collection';
const DATE_KEY     = 'projectAlex_lastClaim';

// =============================================
//  TYPE → CARD BACKGROUND
// =============================================
const TYPE_COLORS = {
  fire:     'linear-gradient(160deg,#6b1a0a,#b83220)',
  water:    'linear-gradient(160deg,#0a2d5c,#165a9e)',
  grass:    'linear-gradient(160deg,#12311f,#205a3a)',
  electric: 'linear-gradient(160deg,#4a3100,#7a5500)',
  psychic:  'linear-gradient(160deg,#3d0028,#6e0048)',
  ice:      'linear-gradient(160deg,#0a2d4a,#0f4a7a)',
  dragon:   'linear-gradient(160deg,#0a0050,#150080)',
  dark:     'linear-gradient(160deg,#0a0a0a,#141428)',
  fairy:    'linear-gradient(160deg,#4a0030,#7a0052)',
  fighting: 'linear-gradient(160deg,#4a0000,#780f0f)',
  normal:   'linear-gradient(160deg,#1c2633,#273647)',
  flying:   'linear-gradient(160deg,#141450,#202070)',
  poison:   'linear-gradient(160deg,#250040,#3d0066)',
  ground:   'linear-gradient(160deg,#2e1a10,#4a2e1e)',
  rock:     'linear-gradient(160deg,#1e1e10,#30301a)',
  bug:      'linear-gradient(160deg,#152000,#243500)',
  ghost:    'linear-gradient(160deg,#120020,#200038)',
  steel:    'linear-gradient(160deg,#141420,#202032)',
};

// =============================================
//  RARITIES
// =============================================
const RARITIES = {
  'Common':     { tier: 1, color: '#9ca3af', holo: false },
  'Uncommon':   { tier: 2, color: '#4ade80', holo: false },
  'Rare':       { tier: 3, color: '#60a5fa', holo: false },
  'Rare Holo':  { tier: 4, color: '#a78bfa', holo: true  },
  'Ultra Rare': { tier: 7, color: '#f43f5e', holo: true  },
  'Hyper Rare': { tier: 9, color: '#d946ef', holo: true  },
};

function getRarity(r) {
  return RARITIES[r] || { tier: 1, color: '#9ca3af', holo: false };
}

function assignRarity(baseExp) {
  if (baseExp >= 300) return 'Hyper Rare';
  if (baseExp >= 250) return 'Ultra Rare';
  if (baseExp >= 180) return 'Rare Holo';
  if (baseExp >= 120) return 'Rare';
  if (baseExp >= 70)  return 'Uncommon';
  return 'Common';
}

function getGen(id) {
  if (id <= 151) return 'Gen I';
  if (id <= 251) return 'Gen II';
  if (id <= 386) return 'Gen III';
  if (id <= 493) return 'Gen IV';
  if (id <= 649) return 'Gen V';
  if (id <= 721) return 'Gen VI';
  if (id <= 809) return 'Gen VII';
  if (id <= 905) return 'Gen VIII';
  return 'Gen IX';
}

function mapPokemon(p) {
  const type = p.types?.[0]?.type?.name || 'normal';
  const rarity = assignRarity(p.base_experience || 0);
  return {
    id: p.id,
    name: p.name.charAt(0).toUpperCase() + p.name.slice(1).replace(/-/g, ' '),
    images: {
      large: p.sprites?.other?.['official-artwork']?.front_default || p.sprites?.front_default,
      small: p.sprites?.front_default,
    },
    rarity,
    set: { name: getGen(p.id) },
    hp: p.stats?.find(s => s.stat.name === 'hp')?.base_stat?.toString() || '',
    types: p.types?.map(t => t.type.name.charAt(0).toUpperCase() + t.type.name.slice(1)) || [],
    typeBg: TYPE_COLORS[type] || TYPE_COLORS.normal,
  };
}

// =============================================
//  STATE
// =============================================
const S = {
  card: null,
  collection: [],
  lastClaim: null,
  revealed: false,
  loading: false,
  countdownTimer: null,
  pool: [],
  poolFilling: false,
  nextImg: null,
  readyCard: null,
  readyImg: null,
};

// =============================================
//  DOM
// =============================================
const $ = id => document.getElementById(id);

const dom = {
  cardScene:      $('cardScene'),
  cardInner:      $('cardInner'),
  cardFront:      $('cardFront'),
  cardImage:      $('cardImage'),
  holoOverlay:    $('holoOverlay'),
  cardHint:       $('cardHint'),
  cardLoading:    $('cardLoading'),
  cardInfo:       $('cardInfo'),
  cardName:       $('cardName'),
  rarityBadge:    $('rarityBadge'),
  setName:        $('setName'),
  cardType:       $('cardType'),
  cardHp:         $('cardHp'),
  cardActions:    $('cardActions'),
  claimBtn:       $('claimBtn'),
  skipBtn:        $('skipBtn'),
  claimedNotice:  $('claimedNotice'),
  countdown:      $('countdown'),
  skipBtnClaimed: $('skipBtnClaimed'),
  emptyState:     $('emptyState'),
  collTiers:      $('collectionTiers'),
  totalCards:     $('totalCards'),
  totalRarities:  $('totalRarities'),
  toast:          $('toast'),
  drawView:       $('drawView'),
  collView:       $('collectionView'),
  navBtns:        document.querySelectorAll('.nav-btn'),
};

// =============================================
//  INIT
// =============================================
function init() {
  loadStorage();
  buildStarfield();
  bindEvents();
  setupHolo();
  prefetchFirstCard(); // single fast fetch + image preload
  fillPool();          // background pool fill (parallel)
}

// =============================================
//  STORAGE
// =============================================
function loadStorage() {
  try {
    const raw = localStorage.getItem(COLL_KEY);
    S.collection = raw ? JSON.parse(raw) : [];
  } catch { S.collection = []; }
  S.lastClaim = localStorage.getItem(DATE_KEY) || null;
}

function saveStorage() {
  localStorage.setItem(COLL_KEY, JSON.stringify(S.collection));
}

// =============================================
//  STARFIELD
// =============================================
function buildStarfield() {
  const container = $('starfield');
  for (let i = 0; i < 130; i++) {
    const s = document.createElement('div');
    s.className = 'star';
    const size = Math.random() * 2.2 + 0.4;
    s.style.cssText = `
      width:${size}px;height:${size}px;
      left:${Math.random()*100}%;top:${Math.random()*100}%;
      --dur:${(Math.random()*4+2).toFixed(1)}s;
      --delay:-${(Math.random()*6).toFixed(1)}s;
      --bright:${(Math.random()*0.55+0.15).toFixed(2)};
    `;
    container.appendChild(s);
  }
}

// =============================================
//  HOLOGRAPHIC MOUSE EFFECT
// =============================================
function setupHolo() {
  dom.cardScene.addEventListener('mousemove', e => {
    if (!S.revealed) return;
    const r = dom.cardScene.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width * 100).toFixed(1);
    const y = ((e.clientY - r.top) / r.height * 100).toFixed(1);
    const angle = (Math.atan2(e.clientY - r.top - r.height/2, e.clientX - r.left - r.width/2) * 180 / Math.PI).toFixed(1);
    dom.holoOverlay.style.setProperty('--mx', `${x}%`);
    dom.holoOverlay.style.setProperty('--my', `${y}%`);
    dom.holoOverlay.style.setProperty('--angle', `${angle}deg`);
  });
  dom.cardScene.addEventListener('mouseleave', () => { dom.holoOverlay.style.opacity = '0'; });
  dom.cardScene.addEventListener('mouseenter', () => {
    if (S.revealed && dom.holoOverlay.classList.contains('active'))
      dom.holoOverlay.style.opacity = '';
  });
}

// =============================================
//  EVENTS
// =============================================
function bindEvents() {
  dom.navBtns.forEach(btn =>
    btn.addEventListener('click', () => switchView(btn.dataset.view))
  );
  dom.cardScene.addEventListener('click', onCardTap);

  let tx = 0, ty = 0;
  dom.cardScene.addEventListener('touchstart', e => {
    tx = e.touches[0].clientX; ty = e.touches[0].clientY;
  }, { passive: true });
  dom.cardScene.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - tx;
    const dy = e.changedTouches[0].clientY - ty;
    if (Math.sqrt(dx*dx + dy*dy) < 25) onCardTap();
  }, { passive: true });

  dom.claimBtn.addEventListener('click', claimCard);
  dom.skipBtn.addEventListener('click', drawAnother);
  dom.skipBtnClaimed.addEventListener('click', drawAnother);
}

function switchView(view) {
  dom.navBtns.forEach(b => b.classList.toggle('active', b.dataset.view === view));
  dom.drawView.classList.toggle('active', view === 'draw');
  dom.collView.classList.toggle('active', view === 'collection');
  if (view === 'collection') renderCollection();
}

// =============================================
//  CARD FLOW
// =============================================
async function onCardTap() {
  if (S.loading || S.revealed) return;
  await revealCard();
}

async function revealCard() {
  if (S.loading) return;
  S.loading = true;
  dom.cardHint.classList.add('hidden');

  let card, preImg;

  if (S.readyCard) {
    card = S.readyCard; preImg = S.readyImg;
    S.readyCard = null; S.readyImg = null;
  } else if (S.pool.length > 0) {
    card = S.pool.pop(); preImg = S.nextImg;
    if (S.pool.length < POOL_REFILL) fillPool();
  } else {
    dom.cardLoading.classList.remove('hidden');
    await waitForPool();
    card = S.pool.pop();
  }

  if (!card) {
    dom.cardLoading.classList.add('hidden');
    dom.cardHint.classList.remove('hidden');
    S.loading = false;
    toast('Could not load Pokémon — check your connection.');
    return;
  }

  S.card = card;
  const imgSrc = card.images?.large || card.images?.small || '';
  const imageReady = preImg?.complete && preImg.naturalHeight > 0;

  if (imageReady) {
    dom.cardImage.src = imgSrc;
    flipReveal(card);
  } else {
    dom.cardLoading.classList.remove('hidden');
    const img = new Image();
    img.onload = () => {
      dom.cardLoading.classList.add('hidden');
      dom.cardImage.src = imgSrc;
      flipReveal(card);
    };
    img.onerror = () => {
      dom.cardLoading.classList.add('hidden');
      S.loading = false;
      drawAnother();
    };
    img.src = imgSrc;
  }
}

function flipReveal(card) {
  applyCardStyle(card);
  S.revealed = true;
  dom.cardInner.classList.add('revealed');
  setTimeout(() => {
    populateInfo(card);
    dom.cardInfo.classList.remove('hidden');
    showActions();
    S.loading = false;
    preloadNext();
  }, 550);
}

function preloadNext() {
  const next = S.pool[S.pool.length - 1];
  if (!next) return;
  const img = new Image();
  img.src = next.images?.large || next.images?.small || '';
  S.nextImg = img;
}

async function drawAnother() {
  if (S.loading) return;
  dom.cardInfo.classList.add('hidden');
  dom.cardActions.classList.add('hidden');
  dom.claimedNotice.classList.add('hidden');

  S.revealed = false;
  dom.cardInner.classList.remove('revealed');
  dom.cardFront.className = 'card-face card-front';
  dom.cardFront.style.background = '';
  dom.holoOverlay.className = 'holo-overlay';
  dom.claimBtn.textContent = 'Add to Collection';
  dom.claimBtn.disabled = false;

  setTimeout(() => revealCard(), 550);
}

function applyCardStyle(card) {
  const cfg = getRarity(card.rarity);
  dom.cardFront.className = 'card-face card-front';
  dom.holoOverlay.className = 'holo-overlay';
  dom.cardFront.style.background = card.typeBg || TYPE_COLORS.normal;

  if (cfg.tier >= 7) {
    dom.cardFront.classList.add('is-ultra');
    dom.holoOverlay.classList.add('active');
  } else if (cfg.holo) {
    dom.cardFront.classList.add('is-holo');
    dom.holoOverlay.classList.add('active');
  }
}

function populateInfo(card) {
  dom.cardName.textContent = card.name || 'Unknown';
  const rarity = card.rarity || '';
  const cfg = getRarity(rarity);
  dom.rarityBadge.textContent = rarity || 'Unknown';
  dom.rarityBadge.className = 'rarity-badge' + (cfg.holo ? ' gold' : '');
  dom.setName.textContent = card.set?.name || '';
  dom.cardType.textContent = card.types?.length ? `⚡ ${card.types.join(' / ')}` : '';
  dom.cardHp.textContent = card.hp ? `${card.hp} HP` : '';
}

function showActions() {
  const canClaim = canClaimToday();
  dom.cardActions.classList.remove('hidden');
  if (canClaim) {
    dom.claimBtn.disabled = false;
    dom.claimBtn.textContent = 'Add to Collection';
    dom.claimedNotice.classList.add('hidden');
  } else {
    dom.claimBtn.disabled = true;
    dom.claimBtn.textContent = 'Already claimed today';
    dom.claimedNotice.classList.remove('hidden');
    startCountdown();
  }
}

// =============================================
//  CLAIM
// =============================================
function claimCard() {
  if (!S.card || !canClaimToday()) return;
  S.collection.push({ ...S.card, claimedAt: new Date().toISOString() });
  S.lastClaim = todayStr();
  localStorage.setItem(DATE_KEY, S.lastClaim);
  saveStorage();
  dom.claimBtn.disabled = true;
  dom.claimBtn.textContent = 'Added ✓';
  dom.claimedNotice.classList.remove('hidden');
  startCountdown();
  toast(`${S.card.name} added to your collection!`);
}

// =============================================
//  DATE & COUNTDOWN
// =============================================
function todayStr() { return new Date().toISOString().split('T')[0]; }
function canClaimToday() { return S.lastClaim !== todayStr(); }

function startCountdown() {
  clearInterval(S.countdownTimer);
  tick();
  S.countdownTimer = setInterval(tick, 1000);
}

function tick() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const diff = midnight - now;
  if (diff <= 0) {
    clearInterval(S.countdownTimer);
    S.lastClaim = null;
    dom.claimedNotice.classList.add('hidden');
    dom.claimBtn.disabled = false;
    dom.claimBtn.textContent = 'Add to Collection';
    return;
  }
  const h = Math.floor(diff / 3600000).toString().padStart(2, '0');
  const m = Math.floor((diff % 3600000) / 60000).toString().padStart(2, '0');
  const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
  dom.countdown.textContent = `${h}:${m}:${s}`;
}

// =============================================
//  POOL — parallel PokeAPI fetches
// =============================================
function randomId() { return Math.floor(Math.random() * TOTAL_POKEMON) + 1; }

async function prefetchFirstCard() {
  try {
    const res = await fetch(`${API}${randomId()}`);
    const data = await res.json();
    const card = mapPokemon(data);
    if (card.images?.large) {
      S.readyCard = card;
      S.readyImg = new Image();
      S.readyImg.src = card.images.large;
    }
  } catch { /* fall back to pool */ }
}

async function fillPool() {
  if (S.poolFilling) return;
  S.poolFilling = true;
  try {
    const ids = Array.from({ length: POOL_SIZE }, randomId);
    const results = await Promise.allSettled(
      ids.map(id => fetch(`${API}${id}`).then(r => r.json()).then(mapPokemon))
    );
    const cards = results
      .filter(r => r.status === 'fulfilled' && r.value?.images?.large)
      .map(r => r.value);
    shuffle(cards);
    S.pool.push(...cards);
  } catch { /* retry on next draw */ }
  S.poolFilling = false;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function waitForPool() {
  return new Promise(resolve => {
    if (S.pool.length > 0) { resolve(); return; }
    const check = setInterval(() => {
      if (S.pool.length > 0) { clearInterval(check); resolve(); }
    }, 100);
    setTimeout(() => { clearInterval(check); resolve(); }, 8000);
  });
}

// =============================================
//  COLLECTION RENDER
// =============================================
function renderCollection() {
  const total = S.collection.length;
  dom.totalCards.textContent = total;
  if (!total) {
    dom.emptyState.classList.remove('hidden');
    dom.collTiers.innerHTML = '';
    dom.totalRarities.textContent = '0';
    return;
  }
  dom.emptyState.classList.add('hidden');

  const groups = {};
  S.collection.forEach(card => {
    const r = card.rarity || 'Unknown';
    if (!groups[r]) groups[r] = [];
    groups[r].push(card);
  });

  const sorted = Object.entries(groups).sort((a, b) =>
    getRarity(b[0]).tier - getRarity(a[0]).tier
  );
  dom.totalRarities.textContent = sorted.length;

  dom.collTiers.innerHTML = sorted.map(([rarity, cards]) => {
    const cfg = getRarity(rarity);
    const cardHtml = cards.map(c => `
      <div class="coll-card ${cfg.holo ? 'holo' : ''}"
           style="background:${c.typeBg || TYPE_COLORS.normal}"
           title="${c.name}">
        <img src="${c.images?.large || c.images?.small || ''}" alt="${c.name}" loading="lazy">
      </div>
    `).join('');
    return `
      <div class="tier-section">
        <div class="tier-header">
          <div class="tier-dot" style="background:${cfg.color};box-shadow:0 0 8px ${cfg.color}55"></div>
          <span class="tier-label">${rarity}</span>
          <span class="tier-count">${cards.length}</span>
        </div>
        <div class="tier-grid">${cardHtml}</div>
      </div>
    `;
  }).join('');
}

// =============================================
//  TOAST
// =============================================
let toastTimer;
function toast(msg) {
  clearTimeout(toastTimer);
  dom.toast.textContent = msg;
  dom.toast.classList.remove('hidden');
  requestAnimationFrame(() => dom.toast.classList.add('show'));
  toastTimer = setTimeout(() => {
    dom.toast.classList.remove('show');
    setTimeout(() => dom.toast.classList.add('hidden'), 400);
  }, 3000);
}

// =============================================
//  START
// =============================================
init();
