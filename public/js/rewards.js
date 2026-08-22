// rewards.js - XP/coin floater queue and reward snapshot processing

import { getToken, getUsername } from './state.js?v=1464';
import { updateCoinsDisplay, refreshCoinsDisplay, COIN_SVG } from './shop.js?v=1464';
import { renderBooksXpSummary } from './profile.js?v=1464';
import { _broadcastLiveEvent } from './livetab.js?v=1464';
import { _scheduleLiveUiRefresh } from './notif.js?v=1464';
import { escapeHtml } from './util.js?v=1464';

// ── State ─────────────────────────────────────────────────────────────────────
let _lastRewardXp        = null;
let _lastRewardCoins     = null;
let _lastRewardLevel     = null;
let _lastRewardUserKey   = null;
let _rewardAccumXp       = 0;
let _rewardAccumCoins    = 0;
let _rewardFlushTimer    = null;
let _rewardProfileTimer  = null;
let _rewardFloaterQueue  = [];
let _rewardFloaterActive = false;

// ── Floater queue ─────────────────────────────────────────────────────────────
function _drainRewardFloaterQueue() {
  if (_rewardFloaterActive) return;
  const next = _rewardFloaterQueue.shift();
  if (!next) return;
  const layer = document.getElementById('reward-float-layer');
  if (!layer) return;
  _rewardFloaterActive = true;
  _positionRewardLayer();
  const chip = document.createElement('div');
  chip.className = `reward-float reward-float--${next.type}`;
  chip.innerHTML = next.html;
  layer.appendChild(chip);
  setTimeout(() => { chip.remove(); _rewardFloaterActive = false; _drainRewardFloaterQueue(); }, 5000);
}

export function _positionRewardLayer() {
  const layer = document.getElementById('reward-float-layer');
  if (!layer) return;
  const booksVisible = document.getElementById('books-screen')?.style.display !== 'none'
    && document.getElementById('landing-wrapper')?.style.display !== 'none';
  const mainVisible = document.getElementById('main-screen')?.style.display !== 'none';
  layer.style.left = ''; layer.style.right = ''; layer.style.bottom = '1rem';
  layer.style.transform = ''; layer.style.alignItems = 'flex-end';
  const landingFullyCollapsed =
    document.body.classList.contains('covers-collapsed') &&
    document.body.classList.contains('right-collapsed') &&
    document.body.classList.contains('feed-collapsed');
  if (booksVisible && landingFullyCollapsed) {
    layer.style.left = '50%'; layer.style.right = 'auto';
    layer.style.transform = 'translateX(-50%)'; layer.style.alignItems = 'center'; return;
  }
  if (booksVisible) {
    const feed = document.getElementById('feed-panel');
    const right = document.getElementById('landing-right');
    const feedRect = feed?.getBoundingClientRect();
    const rightRect = right?.getBoundingClientRect();
    if (feedRect && rightRect && rightRect.left > feedRect.right) {
      const centerX = feedRect.right + ((rightRect.left - feedRect.right) / 2);
      layer.style.left = `${Math.round(centerX)}px`; layer.style.right = 'auto';
      layer.style.transform = 'translateX(-50%)'; layer.style.alignItems = 'center'; return;
    }
  }
  if (mainVisible) {
    // #play-btn-row (charsheet/inventory/equipment/battlesim toggles) uses
    // flex-direction: row-reverse and wraps as more buttons are added, so any
    // one button inside it (e.g. #charsheet-btn) is not a stable stand-in for
    // the row's actual left edge - use the row and stack containers themselves.
    const playStack = document.getElementById('play-bottom-stack');
    const btnRow    = document.getElementById('play-btn-row');
    const stackRect = playStack?.getBoundingClientRect();
    const rowRect   = btnRow?.getBoundingClientRect();
    if (stackRect && rowRect && rowRect.left > stackRect.right) {
      const centerX = stackRect.right + ((rowRect.left - stackRect.right) / 2);
      layer.style.left = `${Math.round(centerX)}px`; layer.style.right = 'auto';
      layer.style.transform = 'translateX(-50%)'; layer.style.alignItems = 'center'; return;
    }
  }
}

function _spawnRewardFloater(type, html) {
  _rewardFloaterQueue.push({ type, html });
  _drainRewardFloaterQueue();
}

function _queueRewardFloater(xpDelta = 0, coinDelta = 0) {
  if (xpDelta > 0) _rewardAccumXp += xpDelta;
  if (coinDelta > 0) _rewardAccumCoins += coinDelta;
  if (_rewardFlushTimer) return;
  _rewardFlushTimer = setTimeout(() => {
    const xp = _rewardAccumXp; const coins = _rewardAccumCoins;
    _rewardAccumXp = 0; _rewardAccumCoins = 0; _rewardFlushTimer = null;
    if (xp > 0)    _spawnRewardFloater('xp',    `<span>+${xp.toLocaleString()} XP</span>`);
    if (coins > 0) _spawnRewardFloater('coins', `${COIN_SVG}<span>+${coins.toLocaleString()}</span>`);
  }, 750);
}

// ── Snapshot processing ───────────────────────────────────────────────────────
export function _resetRewardSnapshotState() {
  _lastRewardXp = null; _lastRewardCoins = null; _lastRewardLevel = null;
  _lastRewardUserKey = null; _rewardAccumXp = 0; _rewardAccumCoins = 0;
  if (_rewardFlushTimer) { clearTimeout(_rewardFlushTimer); _rewardFlushTimer = null; }
  _rewardFloaterQueue = []; _rewardFloaterActive = false;
}

export function _processRewardSnapshot(data, opts = {}) {
  const { broadcast = true } = opts;
  if (!data || typeof data !== 'object') return;
  const xp    = Number(data.xp); const coins = Number(data.coinsBalance);
  const level = Number(data.level); const title = data.title || '';
  const rewardUserKey = String(data.userId ?? getUsername() ?? '');
  if (!Number.isFinite(xp) || !Number.isFinite(coins) || !Number.isFinite(level)) { renderBooksXpSummary(data); return; }
  if (_lastRewardUserKey !== null && rewardUserKey && _lastRewardUserKey !== rewardUserKey) {
    _resetRewardSnapshotState();
  }
  updateCoinsDisplay(coins);
  const prevXp = _lastRewardXp;
  if (_lastRewardXp === null || _lastRewardCoins === null || _lastRewardLevel === null) {
    _lastRewardUserKey = rewardUserKey; _lastRewardXp = xp; _lastRewardCoins = coins;
    _lastRewardLevel = level;
    renderBooksXpSummary(data);
    if (broadcast) _broadcastLiveEvent('reward_snapshot', data); return;
  }
  const xpDelta    = xp    - _lastRewardXp;
  const coinDelta  = coins - _lastRewardCoins;
  const levelDelta = level - _lastRewardLevel;
  _lastRewardUserKey = rewardUserKey; _lastRewardXp = xp; _lastRewardCoins = coins; _lastRewardLevel = level;
  renderBooksXpSummary(data, { fromXp: prevXp });
  if (broadcast) _broadcastLiveEvent('reward_snapshot', data);
  if (xpDelta > 0 || coinDelta > 0) _queueRewardFloater(Math.max(0, xpDelta), Math.max(0, coinDelta));
  if (coinDelta > 0 || levelDelta > 0) _scheduleLiveUiRefresh({ notif: true }, 60);
  if (levelDelta > 0) {
    for (let i = 0; i < levelDelta; i++) {
      const reachedLevel = level - levelDelta + i + 1;
      _spawnRewardFloater('level', `<span class="reward-float-kicker">LEVEL UP!</span><span>Lvl ${reachedLevel}</span>${title ? `<span class="reward-float-title">${escapeHtml(title)}</span>` : ''}`);
    }
  }
}

export function _scheduleRewardProfileRefresh(delay = 750) {
  if (!getToken()) return;
  if (_rewardProfileTimer) clearTimeout(_rewardProfileTimer);
  _rewardProfileTimer = setTimeout(() => { _rewardProfileTimer = null; refreshCoinsDisplay(); }, delay);
}
