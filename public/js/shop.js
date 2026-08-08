// ── Shop ──────────────────────────────────────────────────────────────────────
// Self-contained module. Imports only from state.js and util.js.
// To remove: delete this file, remove its import line and initShop()/openShopModal()/
// refreshCoinsDisplay()/updateCoinsDisplay()/setShopHooks() calls from boot.js,
// and delete public/css/shop.css (and its <link> in index.html).

import { apiFetch, getToken } from './state.js?v=13';
import { escapeHtml } from './util.js?v=52';
import { t } from './i18n.js?v=42';

// Callbacks wired in by main.js at boot
let _hooks = {};
export function setShopHooks(h) { _hooks = h || {}; }

export const COIN_SVG = `<svg class="coin-icon" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7.5" fill="#f59e0b" stroke="#92400e" stroke-width="0.75"/><circle cx="8" cy="8" r="5.5" fill="none" stroke="#fde68a" stroke-width="1"/><text x="8" y="8" text-anchor="middle" dominant-baseline="central" font-size="7" font-weight="bold" fill="#78350f" font-family="serif">G</text></svg>`;

// 1 purchase per 10 levels: level 0-10 -> 1, 11-20 -> 2, 21-30 -> 3, etc. Mirrors
// undoFastTravelCap() in server/db.js (the real enforcement) - keep both in sync.
function _undoFastTravelCap(level) {
  return Math.floor((Math.max(level, 1) - 1) / 10) + 1;
}

const SHOP_ITEMS = [
  {
    id:        'xp_boost',
    label:     () => t('shop.item.xp_boost.label'),
    costFn:    d => (d.xpBoostPurchased  || 0) + 1,
    desc:      () => { const cap = _shopData?.level || 0; return t('shop.item.xp_boost.desc', { cap: (cap * 0.1).toFixed(1) }); },
    statKey:   'xpBoostPurchased',
    statLabel: n => t('shop.item.xp_boost.owned', { pct: (n * 0.1).toFixed(1) }),
    atCap:     d => (d.xpBoostPurchased || 0) >= (d.level || 0),
  },
  {
    id:        'heartbeat_xp',
    label:     () => t('shop.item.heartbeat_xp.label'),
    costFn:    d => (d.bonusHeartbeatXp  || 0) + 1,
    desc:      () => { const cap = _shopData?.level || 0; return t('shop.item.heartbeat_xp.desc', { cap: (cap * 0.1).toFixed(1) }); },
    statKey:   'bonusHeartbeatXp',
    statLabel: n => t('shop.item.heartbeat_xp.owned', { pct: (n * 0.1).toFixed(1) }),
    atCap:     d => (d.bonusHeartbeatXp  || 0) >= (d.level || 0),
  },
  {
    id:        'undo',
    label:     () => t('shop.item.undo.label'),
    costFn:    d => ((d.bonusUndos       || 0) + 1) * 3,
    desc:      () => { const cap = _undoFastTravelCap(_shopData?.level || 0); return t('shop.item.undo.desc', { cap }); },
    statKey:   'bonusUndos',
    statLabel: n => t('shop.item.owned', { n }),
    atCap:     d => (d.bonusUndos || 0) >= _undoFastTravelCap(d.level || 0),
  },
  {
    id:        'fast_travel',
    label:     () => t('shop.item.fast_travel.label'),
    costFn:    d => ((d.bonusFastTravels || 0) + 1) * 5,
    desc:      () => { const cap = _undoFastTravelCap(_shopData?.level || 0); return t('shop.item.fast_travel.desc', { cap }); },
    statKey:   'bonusFastTravels',
    statLabel: n => t('shop.item.owned', { n }),
    atCap:     d => (d.bonusFastTravels || 0) >= _undoFastTravelCap(d.level || 0),
  },
  {
    id:        'gc_chance',
    label:     () => t('shop.item.gc_chance.label'),
    costFn:    d => (d.bonusGcChancePurchased || 0) + 1,
    desc:      () => { const cap = _shopData?.level || 0; return t('shop.item.gc_chance.desc', { cap: (cap * 0.01).toFixed(2) }); },
    statKey:   'bonusGcChancePurchased',
    statLabel: n => t('shop.item.gc_chance.owned', { pct: (n * 0.01).toFixed(2) }),
    atCap:     d => (d.bonusGcChancePurchased || 0) >= (d.level || 0),
  },
];

let _shopData = null;
let _rewardProfileFetchPromise = null;

function _shopHasAffordable(balance) {
  if (!_shopData || balance <= 0) return false;
  return SHOP_ITEMS.some(item => {
    if (item.atCap(_shopData)) return false;
    const cost = item.costFn(_shopData);
    return balance >= cost;
  });
}

export function updateCoinsDisplay(balance) {
  const el = document.getElementById('coins-display');
  if (el) el.innerHTML = `${COIN_SVG} ${balance}`;
  const shopBalance = document.getElementById('shop-balance');
  if (shopBalance) shopBalance.innerHTML = `${COIN_SVG} ${balance}`;
  if (_shopData && typeof _shopData === 'object') _shopData.coinsBalance = balance;
  const btn = document.getElementById('shop-btn');
  if (btn) btn.classList.toggle('shop-btn--spendable', _shopHasAffordable(balance));
}

function updateSpentDisplay(spent) {
  const el = document.getElementById('shop-spent');
  if (el) el.textContent = t('shop.spent', { n: spent });
}

// Mirrors the server's _rollBonusGc formula exactly (xp.js) - level x 0.01%
// base, plus up to another level x 0.01% from purchases (capped at level
// purchases there too) - just for display, the server is always the real
// authority on what actually gets rolled.
function _bonusGcChancePct() {
  const level = _shopData?.level || 0;
  const purchased = Math.min(_shopData?.bonusGcChancePurchased || 0, level);
  return (level + purchased) * 0.01;
}

let _claimingBonusGc = false;
export function updateBonusGcIndicator(pending) {
  const btn = document.getElementById('bonus-gc-btn');
  if (!btn) return;
  btn.classList.toggle('bonus-gc-btn--ready', !!pending);
  btn.disabled = !pending || _claimingBonusGc;
  btn.dataset.tooltip = pending
    ? t('bonus_gc.tooltip_ready')
    : t('bonus_gc.tooltip_empty_pct', { pct: _bonusGcChancePct().toFixed(2) });
}

async function _claimBonusGc() {
  if (_claimingBonusGc) return;
  _claimingBonusGc = true;
  const btn = document.getElementById('bonus-gc-btn');
  if (btn) btn.disabled = true;
  try {
    const res  = await apiFetch('/api/shop/claim-gc', { method: 'POST' });
    if (!res.ok) return;
    const data = await res.json();
    _shopData = data;
    _hooks.onRewardSnapshot?.(data);
    updateCoinsDisplay(data.coinsBalance || 0);
  } catch (_) {}
  finally {
    _claimingBonusGc = false;
    updateBonusGcIndicator(_shopData?.pendingBonusGc);
  }
}

export async function refreshCoinsDisplay() {
  if (!getToken()) return;
  if (_rewardProfileFetchPromise) return _rewardProfileFetchPromise;
  _rewardProfileFetchPromise = (async () => {
    try {
      const res = await apiFetch('/api/profile');
      if (!res.ok) return;
      const data = await res.json();
      _hooks.onRewardSnapshot?.(data);
      if (!_shopData) _shopData = data;
      else _shopData.pendingBonusGc = data.pendingBonusGc;
      updateCoinsDisplay(data.coinsBalance || 0);
      updateBonusGcIndicator(data.pendingBonusGc);
    } catch {}
    finally { _rewardProfileFetchPromise = null; }
  })();
  return _rewardProfileFetchPromise;
}

function renderShopItems() {
  const list = document.getElementById('shop-items');
  if (!list || !_shopData) return;
  list.innerHTML = SHOP_ITEMS.map(item => {
    const balance   = _shopData.coinsBalance || 0;
    const cappedOut = item.atCap(_shopData);
    const cost      = item.costFn(_shopData);
    const canBuy    = !cappedOut && balance >= cost;
    const owned     = _shopData[item.statKey] || 0;
    const btnLabel  = cappedOut ? t('shop.btn.max') : t('shop.btn.buy');
    return `<div class="shop-item">
      <div class="shop-item-info">
        <div class="shop-item-label">${escapeHtml(item.label())}</div>
        <div class="shop-item-desc">${escapeHtml(typeof item.desc === 'function' ? item.desc() : item.desc)}</div>
        ${owned > 0 ? `<div class="shop-item-owned">${escapeHtml(item.statLabel(owned))}</div>` : ''}
      </div>
      <div class="shop-item-buy">
        <div class="shop-item-cost">${COIN_SVG} ${cost}</div>
        <button class="shop-buy-btn${canBuy ? '' : ' shop-buy-btn--disabled'}" data-item="${item.id}"${canBuy ? '' : ' disabled'}>${btnLabel}</button>
      </div>
    </div>`;
  }).join('');

  list.querySelectorAll('.shop-buy-btn:not([disabled])').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = '…';
      try {
        const res  = await apiFetch('/api/shop/purchase', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item: btn.dataset.item }) });
        const data = await res.json();
        if (!res.ok) {
          if (data.error?.includes('cap') || res.status === 403) { renderShopItems(); return; }
          btn.disabled = false; btn.textContent = t('shop.btn.buy'); showShopError(data.error || t('msg.error')); return;
        }
        _shopData = data;
        _hooks.onRewardSnapshot?.(data);
        _hooks.onSetBonusUndos?.(data.bonusUndos || 0);
        _hooks.onSetBonusFastTravels?.(data.bonusFastTravels || 0);
        updateCoinsDisplay(data.coinsBalance || 0);
        updateSpentDisplay(data.coinsSpent || 0);
        renderShopItems();
      } catch (_) { btn.disabled = false; btn.textContent = t('shop.btn.buy'); showShopError(t('shop.request_failed')); }
    });
  });
}

function showShopError(msg) {
  const el = document.getElementById('shop-error');
  if (!el) return;
  el.textContent = msg;
  setTimeout(() => { if (el.textContent === msg) el.textContent = ''; }, 3000);
}

export async function openShopModal() {
  document.getElementById('shop-modal-overlay').classList.add('active');
  document.getElementById('shop-error').textContent = '';
  document.getElementById('shop-items').innerHTML = `<div class="shop-loading">${t('shop.loading')}</div>`;
  try {
    const res = await apiFetch('/api/profile');
    if (!res.ok) throw new Error();
    _shopData = await res.json();
    _hooks.onRewardSnapshot?.(_shopData);
    updateCoinsDisplay(_shopData.coinsBalance || 0);
    document.getElementById('shop-balance').innerHTML = `${COIN_SVG} ${_shopData.coinsBalance || 0}`;
    updateSpentDisplay(_shopData.coinsSpent || 0);
    updateBonusGcIndicator(_shopData.pendingBonusGc);
    renderShopItems();
  } catch (_) { document.getElementById('shop-items').innerHTML = `<div class="shop-loading">${t('shop.load_failed')}</div>`; }
}

export function initShop() {
  document.getElementById('shop-btn')?.addEventListener('click', openShopModal);
  document.getElementById('shop-close-btn')?.addEventListener('click', () =>
    document.getElementById('shop-modal-overlay').classList.remove('active'));
  document.getElementById('shop-modal-overlay')?.addEventListener('click', e => {
    if (e.target === e.currentTarget && _hooks.getMousedownOverlay?.() === e.currentTarget)
      e.currentTarget.classList.remove('active');
  });
  document.getElementById('bonus-gc-btn')?.addEventListener('click', _claimBonusGc);
}
