// rewards.js - XP/coin floater queue and reward snapshot processing

import { getToken, getUsername } from '../core/state.js';
import { updateCoinsDisplay, refreshCoinsDisplay, updateShopSnapshot, COIN_SVG } from './shop.js';
import { renderBooksXpSummary } from '../account/profile.js';
import { updateDiamondsDisplay, DIAMOND_SVG } from './diamonds.js';
import { updateRubiesDisplay, RUBY_SVG } from './rubies.js';
import { closeBlackMarket } from './exchange-shop.js';
import { updateHeartbeatCoinsDisplay } from './heartbeat-coins.js';
import { readRewardCache, saveRewardCache, clearRewardCache } from './snapshot-cache.js';
import { _broadcastLiveEvent } from '../core/livetab.js';
import { _scheduleLiveUiRefresh } from '../community/notif.js';
import { escapeHtml } from '../core/util.js';
import { floatiesEnabled } from './floaties.js';
import { rewardFloaterTypeEnabled } from './floater-policy.js';
import { enqueueRewardFloater, clearRewardFloaters } from './floater-queue.js';
import { waitForCameraIdle } from '../graph/camera-motion.js';
import { activeSeasonalEvents } from '../seasonal-events/calendar.js';

// ── State ─────────────────────────────────────────────────────────────────────
let _lastRewardXp        = null;
let _lastRewardCoins     = null;
let _lastCoinsEarned     = null;
let _lastRewardLevel     = null;
let _lastHeartbeatGold   = null;
let _lastHeartbeatXp = null;
const _rewardAccumSurvival = new Map();
const survivalPhrases = ['Surviving', 'Running', 'Hiding', 'Escaping', 'Fleeing', 'Sneaking', 'Dodging', 'Cowering', 'Trembling', 'Scrambling'];
let _lastDiamondsEarned  = null;
let _lastRubiesEarned = null;
let _lastCollectibleRubies = null;
let _lastRewardUserKey   = null;
let _rewardAccumXp       = 0;
let _rewardAccumCoins    = 0;
let _rewardFlushTimer    = null;
let _rewardProfileTimer  = null;
let _pendingSummary = null;
let _rewardLayoutObserver = null;
let _rewardBodyObserver = null;
const REWARD_LAYOUT_ANCHORS = ['play-bottom-stack','play-btn-row','app-banner-community','dice-roller-wrap','feed-panel','landing-right','graph-container','covers-panel','landing-wrapper','books-screen','main-screen'];

function rewardAnchorTransition(event) {
  if (REWARD_LAYOUT_ANCHORS.includes(event.target?.id)) _positionRewardLayer();
}

function flushRewardSummary() {
  if (!_pendingSummary) return;
  const {data,opts}=_pendingSummary;_pendingSummary=null;
  renderBooksXpSummary(data,opts);
}

function updateRewardSummary(data,opts={}) {
  const fromXp=_pendingSummary?.opts.fromXp ?? opts.fromXp;
  _pendingSummary={data,opts:{...opts,fromXp}};
  if (!waitForCameraIdle(flushRewardSummary)) flushRewardSummary();
}

window.addEventListener('floaties-change', () => {
  if (floatiesEnabled()) { _positionRewardLayer(); return; }
  _rewardLayoutObserver?.disconnect(); _rewardLayoutObserver = null;
  _rewardBodyObserver?.disconnect(); _rewardBodyObserver = null;
  document.removeEventListener('transitionend', rewardAnchorTransition);
  clearRewardFloaters('personal');
  _rewardAccumXp = 0; _rewardAccumCoins = 0; _rewardAccumSurvival.clear();
  clearTimeout(_rewardFlushTimer); _rewardFlushTimer = null;
});

// ── Floater queue ─────────────────────────────────────────────────────────────
export function _positionRewardLayer() {
  if (!floatiesEnabled()) return;
  if (waitForCameraIdle(_positionRewardLayer)) return;
  const layer = document.getElementById('reward-float-layer');
  if (!layer) return;
  // Layout changes update the anchors; spawning a chip never measures the page.
  if (!_rewardLayoutObserver && typeof ResizeObserver!=='undefined') {
    _rewardLayoutObserver=new ResizeObserver(_positionRewardLayer);
    for (const id of REWARD_LAYOUT_ANCHORS) {
      const anchor=document.getElementById(id);if(anchor)_rewardLayoutObserver.observe(anchor);
    }
  }
  if (!_rewardBodyObserver && typeof MutationObserver!=='undefined') {
    _rewardBodyObserver=new MutationObserver(_positionRewardLayer);
    _rewardBodyObserver.observe(document.body,{attributes:true,attributeFilter:['class']});
    for (const id of REWARD_LAYOUT_ANCHORS) {
      const anchor=document.getElementById(id);
      if (anchor) _rewardBodyObserver.observe(anchor,{attributes:true,attributeFilter:['class','style']});
    }
    document.addEventListener('transitionend', rewardAnchorTransition);
  }
  const booksVisible = document.getElementById('books-screen')?.style.display !== 'none'
    && document.getElementById('landing-wrapper')?.style.display !== 'none';
  const mainVisible = document.getElementById('main-screen')?.style.display !== 'none';
  // Read panel geometry before changing styles so a reward arriving during a
  // camera animation does not force layout between our own writes and reads.
  let left = '', right = '', transform = '', alignItems = 'flex-end';
  const landingFullyCollapsed =
    document.body.classList.contains('covers-collapsed') &&
    document.body.classList.contains('right-collapsed') &&
    document.body.classList.contains('feed-collapsed');
  if (booksVisible && landingFullyCollapsed) {
    left = '50%'; right = 'auto'; transform = 'translateX(-50%)'; alignItems = 'center';
  } else if (booksVisible) {
    const feed = document.getElementById('feed-panel');
    const rightPanel = document.getElementById('landing-right');
    const feedRect = feed?.getBoundingClientRect();
    const rightRect = rightPanel?.getBoundingClientRect();
    if (feedRect && rightRect && rightRect.left > feedRect.right) {
      const centerX = feedRect.right + ((rightRect.left - feedRect.right) / 2);
      left = `${Math.round(centerX)}px`; right = 'auto';
      transform = 'translateX(-50%)'; alignItems = 'center';
    }
  }
  if (mainVisible && !left) {
    // Measure the actual row containers, not wrapped or reversed child buttons.
    const playStack = document.getElementById('play-bottom-stack');
    const btnRow    = document.getElementById('play-btn-row');
    const stackRect = playStack?.getBoundingClientRect();
    const rowRect   = btnRow?.getBoundingClientRect();
    if (stackRect && rowRect && rowRect.left > stackRect.right) {
      const centerX = stackRect.right + ((rowRect.left - stackRect.right) / 2);
      left = `${Math.round(centerX)}px`; right = 'auto';
      transform = 'translateX(-50%)'; alignItems = 'center';
    }
  }
  // Mobile feedback shares the clear bottom lane to the left of visible actions.
  // Measure only on existing layout notifications, never for each reward chip.
  let mobileRight = '';
  if (window.matchMedia?.('(max-width: 768px)')?.matches) {
    const edges = ['app-banner-community', 'play-btn-row'].flatMap(id => {
      const element = document.getElementById(id), rect = element?.getBoundingClientRect();
      return rect?.width > 0 && rect.height > 0 && rect.bottom > innerHeight - 120
        && rect.top < innerHeight && getComputedStyle(element).visibility !== 'hidden' ? [rect.left] : [];
    });
    if (edges.length) mobileRight = `${Math.max(12, innerWidth - Math.min(...edges) + 8)}px`;
  }
  const rootStyle = document.documentElement?.style;
  if (rootStyle) {
    if (mobileRight) rootStyle.setProperty('--mobile-reward-right', mobileRight);
    else rootStyle.removeProperty('--mobile-reward-right');
  }
  window.dispatchEvent(new Event('reward-layer-layout'));
  Object.assign(layer.style, { left, right, bottom: '1rem', transform, alignItems });
  // Dialog top layers inherit these anchors without measuring layout when a chip spawns.
  if (rootStyle) {
    for (const [name, value] of [['--personal-reward-left', left], ['--personal-reward-transform', transform]]) {
      if (rootStyle.getPropertyValue(name) === value) continue;
      if (value) rootStyle.setProperty(name, value);
      else rootStyle.removeProperty(name);
    }
  }
}

function _spawnRewardFloater(type, html) {
  if (!floatiesEnabled() || !rewardFloaterTypeEnabled('personal', type)) return;
  enqueueRewardFloater('personal', type, html);
}

function _queueRewardFloater(xpDelta = 0, coinDelta = 0, survivalDelta = 0, survivalType = 'survival') {
  if (!floatiesEnabled()) return;
  if (!rewardFloaterTypeEnabled('personal', 'coins')) coinDelta = 0;
  if (xpDelta <= 0 && coinDelta <= 0 && survivalDelta <= 0) return;
  if (xpDelta > 0) _rewardAccumXp += xpDelta;
  if (coinDelta > 0) _rewardAccumCoins += coinDelta;
  if (survivalDelta > 0) _rewardAccumSurvival.set(survivalType, (_rewardAccumSurvival.get(survivalType) || 0) + survivalDelta);
  if (_rewardFlushTimer) return;
  _rewardFlushTimer = setTimeout(() => {
    const xp = _rewardAccumXp; const coins = _rewardAccumCoins;
    const survival = [..._rewardAccumSurvival];
    _rewardAccumSurvival.clear();
    _rewardAccumXp = 0; _rewardAccumCoins = 0; _rewardFlushTimer = null;
    if (xp > 0)    _spawnRewardFloater('xp',    `<span>+${xp.toLocaleString()} XP</span>`);
    for (const [type, amount] of survival) {
      const phrase = survivalPhrases[Math.floor(Math.random() * survivalPhrases.length)];
      _spawnRewardFloater(type, `<span>+${amount.toLocaleString()} XP for ${phrase.toLowerCase()}</span>`);
    }
    if (coins > 0 && rewardFloaterTypeEnabled('personal', 'coins')) _spawnRewardFloater('coins', `${COIN_SVG}<span>+${coins.toLocaleString()}</span>`);
  }, 750);
}

// ── Snapshot processing ───────────────────────────────────────────────────────
export function _resetRewardSnapshotState() {
  _pendingSummary = null;
  updateShopSnapshot(null);
  clearRewardCache();
  closeBlackMarket();
  updateRubiesDisplay(null);
  _lastRubiesEarned = null;
  _lastCollectibleRubies = null;
  updateDiamondsDisplay(null);
  updateHeartbeatCoinsDisplay(null);
  _lastHeartbeatGold = null;
  _lastHeartbeatXp = null; _rewardAccumSurvival.clear();
  _lastDiamondsEarned = null;
  _lastRewardXp = null; _lastRewardCoins = null; _lastRewardLevel = null;
  _lastCoinsEarned = null;
  _lastRewardUserKey = null; _rewardAccumXp = 0; _rewardAccumCoins = 0;
  if (_rewardFlushTimer) { clearTimeout(_rewardFlushTimer); _rewardFlushTimer = null; }
  clearRewardFloaters('personal');
}

// Return XP, coin, and level deltas; the first snapshot establishes a baseline.
export async function _restoreRewardSnapshot() {
  const token = getToken();
  const cached = await readRewardCache();
  if (getToken() === token && _lastRewardXp === null && cached) _processRewardSnapshot(cached, { broadcast: false, cache: false });
}

export function _processRewardSnapshot(data, opts = {}) {
  const { broadcast = true, cache = true } = opts;
  if (!data || typeof data !== 'object') return null;
  const xp    = Number(data.xp); const coins = Number(data.coinsBalance);
  const level = Number(data.level); const title = data.title || '';
  const rewardUserKey = String(data.userId ?? getUsername() ?? '');
  if (!Number.isFinite(xp) || !Number.isFinite(coins) || !Number.isFinite(level)) { updateRewardSummary(data); return null; }
  if (_lastRewardUserKey !== null && rewardUserKey && _lastRewardUserKey !== rewardUserKey) {
    _resetRewardSnapshotState();
  }
  updateShopSnapshot(data);
  updateCoinsDisplay(coins);
  updateHeartbeatCoinsDisplay(data);
  const heartbeatGold = Number(data.heartbeatGoldEarned) || 0;
  const showCoins = rewardFloaterTypeEnabled('personal', 'coins');
  const silentGold = !showCoins || _lastHeartbeatGold === null ? 0 : Math.max(0, heartbeatGold - _lastHeartbeatGold);
  _lastHeartbeatGold = heartbeatGold;
  const heartbeatXp = Number(data.heartbeatXpEarned) || 0;
  const heartbeatDelta = _lastHeartbeatXp === null ? 0 : Math.max(0, heartbeatXp - _lastHeartbeatXp);
  _lastHeartbeatXp = heartbeatXp;
  const rubiesEarned = data.rubiesEarned;
  const collectibleRubies = Number(data.rubiesCollectibleEarned) || 0;
  const silentRubies = _lastCollectibleRubies === null ? 0 : Math.max(0,collectibleRubies-_lastCollectibleRubies);
  _lastCollectibleRubies = collectibleRubies;
  const rubyDelta = rewardFloaterTypeEnabled('personal', 'rubies') && Number.isSafeInteger(rubiesEarned) && _lastRubiesEarned !== null
    ? Math.max(0, rubiesEarned - _lastRubiesEarned - silentRubies) : 0;
  _lastRubiesEarned = Number.isSafeInteger(rubiesEarned) ? rubiesEarned : null;
  const diamondsEarned = data.diamondsEarned;
  const diamondDelta = rewardFloaterTypeEnabled('personal', 'diamonds') && Number.isSafeInteger(diamondsEarned) && _lastDiamondsEarned !== null
    ? Math.max(0, diamondsEarned - _lastDiamondsEarned) : 0;
  if (Number.isSafeInteger(diamondsEarned)) _lastDiamondsEarned = diamondsEarned;
  if (cache) saveRewardCache(data);
  const prevXp = _lastRewardXp;
  const coinsEarned = Number(data.coinsEarned);
  const coinsGained = !showCoins ? 0 : Number.isFinite(coinsEarned) && _lastCoinsEarned !== null
    ? Math.max(0,coinsEarned-_lastCoinsEarned) : Math.max(0,coins-(_lastRewardCoins??coins));
  _lastCoinsEarned = Number.isFinite(coinsEarned) ? coinsEarned : null;
  if (_lastRewardXp === null || _lastRewardCoins === null || _lastRewardLevel === null) {
    _lastRewardUserKey = rewardUserKey; _lastRewardXp = xp; _lastRewardCoins = coins;
    _lastRewardLevel = level;
    updateRewardSummary(data);
    if (broadcast) _broadcastLiveEvent('reward_snapshot', data); return null;
  }
  const xpDelta    = xp    - _lastRewardXp;
  const coinDelta  = coins - _lastRewardCoins;
  const levelDelta = level - _lastRewardLevel;
  _lastRewardUserKey = rewardUserKey; _lastRewardXp = xp; _lastRewardCoins = coins; _lastRewardLevel = level;
  updateRewardSummary(data, { fromXp: prevXp });
  if (broadcast) _broadcastLiveEvent('reward_snapshot', data);
  if (coinDelta > 0 || levelDelta > 0) _scheduleLiveUiRefresh({ notif: true }, 60);
  if (!floatiesEnabled()) return { xpDelta, coinDelta, levelDelta };
  const survivalType = heartbeatDelta > 0 && activeSeasonalEvents().find(event => event.heartbeatFloater)?.heartbeatFloater;
  const survival = survivalType
    ? Math.min(Math.max(0, xpDelta), heartbeatDelta) : 0;
  if (xpDelta > 0 || coinsGained > silentGold) _queueRewardFloater(Math.max(0, xpDelta - survival), Math.max(0, coinsGained - silentGold), survival, survivalType);
  if (rubyDelta > 0) _spawnRewardFloater('rubies', `${RUBY_SVG}<span>+${rubyDelta.toLocaleString()}</span>`);
  if (diamondDelta > 0) _spawnRewardFloater('diamonds', `${DIAMOND_SVG}<span>+${diamondDelta.toLocaleString()}</span>`);
  if (levelDelta > 0 && rewardFloaterTypeEnabled('personal', 'level')) {
    for (let i = 0; i < levelDelta; i++) {
      const reachedLevel = level - levelDelta + i + 1;
      _spawnRewardFloater('level', `<span class="reward-float-kicker">LEVEL UP!</span><span>Lvl ${reachedLevel}</span>${title ? `<span class="reward-float-title">${escapeHtml(title)}</span>` : ''}`);
    }
  }
  return { xpDelta, coinDelta, levelDelta };
}

export function _scheduleRewardProfileRefresh(delay = 750) {
  if (!getToken()) return;
  if (_rewardProfileTimer) clearTimeout(_rewardProfileTimer);
  _rewardProfileTimer = setTimeout(() => {
    _rewardProfileTimer = null;
    if (!waitForCameraIdle(refreshRewardProfile)) refreshRewardProfile();
  }, delay);
}

function refreshRewardProfile() {
  if (getToken()) refreshCoinsDisplay();
}
