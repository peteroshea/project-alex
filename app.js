'use strict';

// =============================================
//  PROJECT ALEX — App Logic
// =============================================

const API = 'https://api.pokemontcg.io/v2/cards';
const COLL_KEY = 'projectAlex_collection';
const DATE_KEY = 'projectAlex_lastClaim';

// Pool config — fetch 100 cards per batch from low page numbers (fast offsets)
const POOL_BATCH = 100;
const POOL_MAX_PAGE = 40;   // pages 1-40 = fast server response
const POOL_REFILL_AT = 15;  // start background refill when pool drops below this

// Rarity tiers: higher = more rare
const RARITIES = {
  'Common':                    { tier: 1, color: '#9ca3af', holo: false },
  'Uncommon':                  { tier: 2, color: '#4ade80', holo: false },
  'Rare':                      { tier: 3, color: '#60a5fa', holo: false },
  'Rare Holo':                 { tier: 4, color: '#a78bfa', holo: true  },
  'Rare Reverse Holo':         { tier: 4, color: '#a78bfa', holo: true  },
  'Rare Holo EX':              { tier: 5, color: '#f59e0b', holo: true  },
  'Rare Holo GX':              { tier: 5, color: '#f59e0b', holo: true  },
  'Rare Holo V':               { tier: 5, color: '#f59e0b', holo: true  },
  'Rare Holo LV.X':            { tier: 5, color: '#f59e0b', holo: true  },
  'Rare Holo Star':            { tier: 6, color: '#fb923c', holo: true  },
  'Rare Holo VMAX':            { tier: 6, color: '#fb923c', holo: true  },
  'Rare Holo VSTAR':           { tier: 6, color: '#fb923c', holo: true  },
  'Rare Ultra':                { tier: 7, color: '#f43f5e', holo: true  },
  'Illustration Rare':         { tier: 7, color: '#f43f5e', holo: true  },
  'Trainer Gallery Rare Holo': { tier: 7, color: '#f43f5e', holo: true  },
  'Rare Rainbow':              { tier: 8, color: '#e879f9', holo: true  },
  'Rare Secret':               { tier: 8, color: '#e879f9', holo: true  },
  'Special Illustration Rare': { tier: 8, color: '#e879f9', holo: true  },
  'Hyper Rare':                { tier: 9, color: '#d946ef', holo: true  },
};

function getRarity(r) {
  return RARITIES[r] || { tier: 1, color: '#9ca3af', holo: false };
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
  pool: [],           // pre-fetched card pool
  poolFilling: false, // prevent concurrent refills
  nextImg: null,      // preloaded Image object for next card
  readyCard: null,    // single card pre-fetched for instant first draw
  readyImg: null,     // preloaded image for readyCard
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
  prefetchFirstCard(); // fast single-card fetch + image preload
  fillPool();          // background pool for subsequent draws
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
      width:${size}px; height:${size}px;
      left:${Math.random()*100}%; top:${Math.random()*100}%;
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

  dom.cardScene.addEventListener('mouseleave', () => {
    dom.holoOverlay.style.opacity = '0';
  });

  dom.cardScene.addEventListener('mouseenter', () => {
    if (S.revealed && dom.holoOverlay.classList.contains('active')) {
      dom.holoOverlay.style.opacity = '';
    }
  });
}

// =============================================
//  EVENTS
// =============================================
function bindEvents() {
  // Nav
  dom.navBtns.forEach(btn =>
    btn.addEventListener('click', () => switchView(btn.dataset.view))
  );

  // Card click
  dom.cardScene.addEventListener('click', onCardTap);

  // Swipe (mobile)
  let tx = 0, ty = 0;
  dom.cardScene.addEventListener('touchstart', e => {
    tx = e.touches[0].clientX;
    ty = e.touches[0].clientY;
  }, { passive: true });

  dom.cardScene.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - tx;
    const dy = e.changedTouches[0].clientY - ty;
    if (Math.sqrt(dx*dx + dy*dy) < 25) onCardTap(); // tap
  }, { passive: true });

  // Buttons
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

  // Resolve which card + preloaded image to use
  let card, preImg;

  if (S.readyCard) {
    // First draw: instant — single card was pre-fetched on page load
    card = S.readyCard;
    preImg = S.readyImg;
    S.readyCard = null;
    S.readyImg = null;
  } else if (S.pool.length > 0) {
    card = S.pool.pop();
    preImg = S.nextImg;
    if (S.pool.length < POOL_REFILL_AT) fillPool();
  } else {
    // Pool still loading — show spinner and wait
    dom.cardLoading.classList.remove('hidden');
    await waitForPool();
    card = S.pool.pop();
  }

  if (!card) {
    dom.cardLoading.classList.add('hidden');
    dom.cardHint.classList.remove('hidden');
    S.loading = false;
    toast('Could not fetch cards — check your connection.');
    return;
  }

  S.card = card;
  const imgSrc = card.images?.large || card.images?.small || '';
  const imageReady = preImg && preImg.complete && preImg.naturalHeight > 0 && preImg.src.includes(imgSrc.split('/').pop());

  if (imageReady) {
    // Image already in cache — flip instantly, no spinner
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
  applyRarityStyle(card);
  S.revealed = true;
  dom.cardInner.classList.add('revealed');

  setTimeout(() => {
    populateInfo(card);
    dom.cardInfo.classList.remove('hidden');
    showActions();
    S.loading = false;
    preloadNext(); // preload next card image in background
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

  // Reset UI
  dom.cardInfo.classList.add('hidden');
  dom.cardActions.classList.add('hidden');
  dom.claimedNotice.classList.add('hidden');

  // Flip back
  S.revealed = false;
  dom.cardInner.classList.remove('revealed');
  dom.cardFront.className = 'card-face card-front';
  dom.holoOverlay.className = 'holo-overlay';

  // Reset claim btn text
  dom.claimBtn.textContent = 'Add to Collection';
  dom.claimBtn.disabled = false;

  setTimeout(() => revealCard(), 550);
}

function applyRarityStyle(card) {
  const cfg = getRarity(card.rarity);
  dom.cardFront.className = 'card-face card-front';
  dom.holoOverlay.className = 'holo-overlay';

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
//  POOL — fetch 100 cards per call, draw locally
// =============================================

// Fast single-card prefetch on page load — makes first draw instant
async function prefetchFirstCard() {
  try {
    const page = Math.floor(Math.random() * POOL_MAX_PAGE) + 1;
    const url = `${API}?pageSize=1&page=${page}&select=id,name,images,rarity,set,hp,types`;
    const res = await fetch(url);
    if (!res.ok) return;
    const { data } = await res.json();
    const card = data?.[0];
    if (card && (card.images?.large || card.images?.small)) {
      S.readyCard = card;
      // Preload image immediately so flip is instant on tap
      S.readyImg = new Image();
      S.readyImg.src = card.images.large || card.images.small;
    }
  } catch { /* fall back to pool */ }
}

async function fillPool() {
  if (S.poolFilling) return;
  S.poolFilling = true;
  try {
    const page = Math.floor(Math.random() * POOL_MAX_PAGE) + 1;
    const url = `${API}?pageSize=${POOL_BATCH}&page=${page}&select=id,name,images,rarity,set,hp,types`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.status);
    const { data } = await res.json();
    if (data?.length) {
      // Filter out cards missing images, then shuffle and add to pool
      const valid = data.filter(c => c.images?.large || c.images?.small);
      shuffle(valid);
      S.pool.push(...valid);
    }
  } catch { /* silently retry next time */ }
  S.poolFilling = false;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// Wait for pool to have cards (used only on very first load)
function waitForPool() {
  return new Promise(resolve => {
    if (S.pool.length > 0) { resolve(); return; }
    const check = setInterval(() => {
      if (S.pool.length > 0) { clearInterval(check); resolve(); }
    }, 100);
    // Give up after 10s and let error handling deal with it
    setTimeout(() => { clearInterval(check); resolve(); }, 10000);
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

  // Group by rarity
  const groups = {};
  S.collection.forEach(card => {
    const r = card.rarity || 'Unknown';
    if (!groups[r]) groups[r] = [];
    groups[r].push(card);
  });

  // Sort highest tier first
  const sorted = Object.entries(groups).sort((a, b) =>
    getRarity(b[0]).tier - getRarity(a[0]).tier
  );

  dom.totalRarities.textContent = sorted.length;

  dom.collTiers.innerHTML = sorted.map(([rarity, cards]) => {
    const cfg = getRarity(rarity);
    const cardHtml = cards.map(c => `
      <div class="coll-card ${cfg.holo ? 'holo' : ''}" title="${c.name}">
        <img src="${c.images?.small || c.images?.large || ''}" alt="${c.name}" loading="lazy">
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
