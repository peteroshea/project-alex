'use strict';

// =============================================
//  PROJECT ALEX — Local card data version
//  Cards loaded from cards-data.js (no API calls for card selection)
//  Images served from images.pokemontcg.io CDN
// =============================================

const COLL_KEY = 'projectAlex_collection';

// =============================================
//  RARITIES
// =============================================
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
  revealed: false,
  loading: false,
  deck: [],
  nextImg: null,
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
  if (!window.CARDS_DATA?.length) {
    alert('Card data failed to load. Please refresh.');
    return;
  }
  loadStorage();
  buildStarfield();
  bindEvents();
  setupHolo();
  buildDeck();
  preloadNext(); // preload first card image immediately
}

// =============================================
//  DECK — shuffle local data, refill when empty
// =============================================
function buildDeck() {
  S.deck = [...window.CARDS_DATA];
  shuffle(S.deck);
}

function drawCard() {
  if (S.deck.length === 0) buildDeck(); // reshuffle when exhausted
  return S.deck.pop();
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function preloadNext() {
  const next = S.deck[S.deck.length - 1];
  if (!next) return;
  const img = new Image();
  img.src = next.images?.large || next.images?.small || '';
  S.nextImg = img;
}

// =============================================
//  STORAGE
// =============================================
function loadStorage() {
  try {
    const raw = localStorage.getItem(COLL_KEY);
    S.collection = raw ? JSON.parse(raw) : [];
  } catch { S.collection = []; }
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
function onCardTap() {
  if (S.loading || S.revealed) return;
  revealCard();
}

function revealCard() {
  if (S.loading) return;
  S.loading = true;
  dom.cardHint.classList.add('hidden');

  const card = drawCard();
  S.card = card;

  const imgSrc = card.images?.large || card.images?.small || '';
  const imageReady = S.nextImg?.complete && S.nextImg.naturalHeight > 0;

  if (imageReady) {
    // Image already cached — flip immediately, no spinner
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
      // Skip broken image, try next card
      dom.cardLoading.classList.add('hidden');
      S.loading = false;
      S.revealed = false;
      revealCard();
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
    triggerSparkle(card);
    S.loading = false;
    preloadNext();
  }, 550);
}

function drawAnother() {
  if (S.loading) return;
  dom.cardInfo.classList.add('hidden');
  dom.cardActions.classList.add('hidden');

  S.revealed = false;
  dom.cardInner.classList.remove('revealed');
  dom.cardFront.className = 'card-face card-front';
  dom.holoOverlay.className = 'holo-overlay';
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
  dom.setName.textContent = card.setName || card.set?.name || '';
  dom.cardType.textContent = card.types?.length ? `⚡ ${card.types.join(' / ')}` : '';
  dom.cardHp.textContent = card.hp ? `${card.hp} HP` : '';
}

function showActions() {
  dom.cardActions.classList.remove('hidden');
  dom.claimBtn.disabled = false;
  dom.claimBtn.textContent = 'Add to Collection';
}

// =============================================
//  CLAIM
// =============================================
function claimCard() {
  if (!S.card) return;
  S.collection.push({ ...S.card, claimedAt: new Date().toISOString() });
  saveStorage();
  dom.claimBtn.disabled = true;
  dom.claimBtn.textContent = 'Added ✓';
  toast(`${S.card.name} added to your collection!`);
}

// =============================================
//  SPARKLE
// =============================================
function triggerSparkle(card) {
  const cfg = getRarity(card.rarity);
  if (!cfg.holo) return;

  const container = dom.cardScene;
  const colors = cfg.tier >= 8
    ? ['#e879f9','#f0abfc','#fff','#fbbf24','#a78bfa']
    : cfg.tier >= 7
    ? ['#f43f5e','#fb923c','#fff','#fbbf24']
    : cfg.tier >= 5
    ? ['#f59e0b','#fcd34d','#fff','#60a5fa']
    : ['#a78bfa','#c4b5fd','#fff','#60a5fa'];

  const count = cfg.tier >= 7 ? 120 : 80;

  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    p.className = 'sparkle-particle';
    const angle = Math.random() * 360;
    const dist  = 120 + Math.random() * 220;
    const size  = 5 + Math.random() * 12;
    const color = colors[Math.floor(Math.random() * colors.length)];
    const dur   = 800 + Math.random() * 700;
    const shape = Math.random() > 0.5 ? '50%' : '2px';

    p.style.cssText = `
      width:${size}px; height:${size}px;
      background:${color};
      border-radius:${shape};
      box-shadow: 0 0 ${size*3}px ${size}px ${color}88;
      --tx:${Math.cos(angle * Math.PI/180) * dist}px;
      --ty:${Math.sin(angle * Math.PI/180) * dist}px;
      animation: sparkle-fly ${dur}ms ease-out forwards;
      animation-delay: ${Math.random() * 400}ms;
    `;
    container.appendChild(p);
    setTimeout(() => p.remove(), dur + 200);
  }
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
      <div class="coll-card ${cfg.holo ? 'holo' : ''}" title="${c.name}">
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
