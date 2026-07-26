// ── Shop ──────────────────────────────────────────────────────────────────────
// Self-contained module. Imports only from state.js and util.js.
// To remove: delete this file, remove its import line and initShop()/openShopModal()/
// refreshCoinsDisplay()/updateCoinsDisplay()/setShopHooks() calls from boot.js,
// and delete public/css/shop.css (and its <link> in index.html).

import { apiFetch, getToken } from './state.js?v=11';
import { escapeHtml } from './util.js?v=7';

// Callbacks wired in by main.js at boot
let _hooks = {};
export function setShopHooks(h) { _hooks = h || {}; }

export const COIN_SVG = `<svg class="coin-icon" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7.5" fill="#f59e0b" stroke="#92400e" stroke-width="0.75"/><circle cx="8" cy="8" r="5.5" fill="none" stroke="#fde68a" stroke-width="1"/><text x="8" y="11.5" text-anchor="middle" font-size="7" font-weight="bold" fill="#78350f" font-family="serif">G</text></svg>`;

// 1 purchase per 10 levels: level 0-10 -> 1, 11-20 -> 2, 21-30 -> 3, etc. Mirrors
// undoFastTravelCap() in server/db.js (the real enforcement) - keep both in sync.
function _undoFastTravelCap(level) {
  return Math.floor((Math.max(level, 1) - 1) / 10) + 1;
}

const SHOP_ITEMS = [
  {
    id:        'xp_boost',
    label:     'XP Boost',
    costFn:    d => (d.xpBoostPurchased  || 0) + 1,
    desc:      () => { const cap = _shopData?.level || 0; return `+0.1% XP gain permanently (cap: ${(cap * 0.1).toFixed(1)}% at your lvl)`; },
    statKey:   'xpBoostPurchased',
    statLabel: n => `+${(n * 0.1).toFixed(1)}% XP boost purchased`,
    atCap:     d => (d.xpBoostPurchased || 0) >= (d.level || 0),
  },
  {
    id:        'heartbeat_xp',
    label:     'Heartbeat XP',
    costFn:    d => (d.bonusHeartbeatXp  || 0) + 1,
    desc:      () => { const cap = _shopData?.level || 0; return `+0.1 base idle heartbeat XP permanently (cap: ${(cap * 0.1).toFixed(1)} XP at your lvl)`; },
    statKey:   'bonusHeartbeatXp',
    statLabel: n => `+${(n * 0.1).toFixed(1)} base heartbeat XP purchased`,
    atCap:     d => (d.bonusHeartbeatXp  || 0) >= (d.level || 0),
  },
  {
    id:        'undo',
    label:     'Extra Undo',
    costFn:    d => ((d.bonusUndos       || 0) + 1) * 3,
    desc:      () => { const cap = _undoFastTravelCap(_shopData?.level || 0); return `+1 undo per run permanently (cap: ${cap} at your lvl)`; },
    statKey:   'bonusUndos',
    statLabel: n => `+${n} purchased`,
    atCap:     d => (d.bonusUndos || 0) >= _undoFastTravelCap(d.level || 0),
  },
  {
    id:        'fast_travel',
    label:     'Fast Travel',
    costFn:    d => ((d.bonusFastTravels || 0) + 1) * 5,
    desc:      () => { const cap = _undoFastTravelCap(_shopData?.level || 0); return `+1 fast travel per run permanently (cap: ${cap} at your lvl)`; },
    statKey:   'bonusFastTravels',
    statLabel: n => `+${n} purchased`,
    atCap:     d => (d.bonusFastTravels || 0) >= _undoFastTravelCap(d.level || 0),
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
  if (el) el.textContent = `${spent} spent`;
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
      updateCoinsDisplay(data.coinsBalance || 0);
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
    const btnLabel  = cappedOut ? 'Max' : 'Buy';
    return `<div class="shop-item">
      <div class="shop-item-info">
        <div class="shop-item-label">${escapeHtml(item.label)}</div>
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
          btn.disabled = false; btn.textContent = 'Buy'; showShopError(data.error || 'Error'); return;
        }
        _shopData = data;
        _hooks.onRewardSnapshot?.(data);
        _hooks.onSetBonusUndos?.(data.bonusUndos || 0);
        _hooks.onSetBonusFastTravels?.(data.bonusFastTravels || 0);
        updateCoinsDisplay(data.coinsBalance || 0);
        updateSpentDisplay(data.coinsSpent || 0);
        renderShopItems();
      } catch (_) { btn.disabled = false; btn.textContent = 'Buy'; showShopError('Request failed'); }
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
  document.getElementById('shop-items').innerHTML = '<div class="shop-loading">Loading…</div>';
  try {
    const res = await apiFetch('/api/profile');
    if (!res.ok) throw new Error();
    _shopData = await res.json();
    _hooks.onRewardSnapshot?.(_shopData);
    updateCoinsDisplay(_shopData.coinsBalance || 0);
    document.getElementById('shop-balance').innerHTML = `${COIN_SVG} ${_shopData.coinsBalance || 0}`;
    updateSpentDisplay(_shopData.coinsSpent || 0);
    renderShopItems();
  } catch (_) { document.getElementById('shop-items').innerHTML = '<div class="shop-loading">Failed to load.</div>'; }
}

export function initShop() {
  document.getElementById('shop-btn')?.addEventListener('click', openShopModal);
  document.getElementById('shop-close-btn')?.addEventListener('click', () =>
    document.getElementById('shop-modal-overlay').classList.remove('active'));
  document.getElementById('shop-modal-overlay')?.addEventListener('click', e => {
    if (e.target === e.currentTarget && _hooks.getMousedownOverlay?.() === e.currentTarget)
      e.currentTarget.classList.remove('active');
  });
}
