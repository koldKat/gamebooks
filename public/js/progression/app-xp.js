// Aggregate app XP and average player level.
// Other-player reward floaters remain admin-only.

import { apiFetch, getToken, isDemoMode } from '../core/state.js';
import { COIN_SVG } from './shop.js';
import { escapeHtml } from '../core/util.js';
import { t } from '../i18n.js';

let _hooks = {};
export function setAppXpHooks(h) { _hooks = h || {}; }

function _hbRateText(ratePerMin) {
  const rate = Math.round(ratePerMin * 10) / 10;
  return t('appxp.hb_rate', { rate: rate % 1 === 0 ? rate : rate.toFixed(1) });
}

// Calculate bounds from animated XP using the app's player-count scale.
function _levelBounds(xp, scale) {
  const n = xp <= 0 ? 0 : Math.floor((-1 + Math.sqrt(1 + 8 * xp / scale)) / 2);
  return { levelXp: scale * n * (n + 1) / 2, nextLevelXp: scale * (n + 1) * (n + 2) / 2 };
}

function _paintXp(xp, data) {
  const scale = Math.max(1, (data.users || 0) * 1000);
  const { levelXp, nextLevelXp } = _levelBounds(xp, scale);
  const span = Math.max(1, nextLevelXp - levelXp);
  const pct  = Math.max(0, Math.min(100, Math.round(((xp - levelXp) / span) * 100)));
  document.getElementById('app-xp-bar-fill').style.width = `${pct}%`;
  const toGo = Math.max(0, Math.round(nextLevelXp - xp));
  document.getElementById('app-xp-text').innerHTML =
    `<span class="xp-val">${Math.round(xp).toLocaleString()} XP</span> · ${toGo.toLocaleString()} to next LVL`;
}

function _paintBoost(boostXp, data) {
  const boostEl = document.getElementById('app-xp-boost');
  const xpBoostPct = Number(data?.xpBoostPct) || 0;
  boostEl.innerHTML = xpBoostPct > 0
    ? `<span style="color:#f472b6">+${xpBoostPct}% boost</span> <span>(${Math.round(Math.max(0, boostXp)).toLocaleString()} XP)</span>`
    : '';
}

let _displayedXp      = null; // last value actually painted (may be mid-tween)
let _displayedBoostXp = null;
let _animQueue    = []; // pending {toXp, toBoostXp, data} segments, played back to back
let _animRunning  = false;
let _animGen      = 0; // bumped only on a hard reset (see _render's !data branch)
const XP_ANIM_MS_PER_LEVEL = 100; // same convention as profile.js: level * 100ms
// Cap animation duration at level 100, not the app's level.
const ANIM_DURATION_LEVEL_CAP = 100;

// Queue level tweens instead of interrupting the current animation.
function _runAnimQueue(gen) {
  if (_animRunning) return;
  const next = _animQueue.shift();
  if (!next) return;
  _animRunning = true;
  const { toXp, toBoostXp, data } = next;
  const fromXp      = _displayedXp != null ? _displayedXp : toXp;
  const fromBoostXp = _displayedBoostXp != null ? _displayedBoostXp : toBoostXp;
  const animLevel = Math.min(Math.max(0, Number(data.level) || 0), ANIM_DURATION_LEVEL_CAP);
  const durationMs = animLevel * XP_ANIM_MS_PER_LEVEL;
  const jump = Math.abs(toXp - fromXp);
  const finish = () => {
    _displayedXp = toXp;
    _displayedBoostXp = toBoostXp;
    _animRunning = false;
    _runAnimQueue(gen);
  };
  // Animate every positive delta; snap zero deltas without suppressing small awards.
  if (jump === 0 || durationMs <= 0) {
    _paintXp(toXp, data); _paintBoost(toBoostXp, data);
    finish();
    return;
  }
  const start = performance.now();
  function step(now) {
    if (gen !== _animGen) { _animRunning = false; return; } // invalidated by a hard reset
    const t = Math.min(1, (now - start) / durationMs);
    const current      = fromXp      + (toXp      - fromXp)      * t;
    const currentBoost = fromBoostXp + (toBoostXp - fromBoostXp) * t;
    _paintXp(current, data);
    _paintBoost(currentBoost, data);
    _displayedXp = current;
    _displayedBoostXp = currentBoost;
    if (t < 1) requestAnimationFrame(step);
    else finish();
  }
  requestAnimationFrame(step);
}

function _enqueueXpAnim(data) {
  const toXp      = Math.floor(Number(data.xp) || 0);
  const toBoostXp = Math.floor(Number(data.xpFromBoost) || 0);
  _animQueue.push({ toXp, toBoostXp, data });
  _runAnimQueue(_animGen);
}

function _render(data) {
  const wrap = document.getElementById('app-xp-summary');
  if (!wrap) return;
  if (!data) {
    wrap.hidden = true;
    _animGen++; // hard reset: invalidate any in-flight animation
    _animQueue = []; _animRunning = false;
    _displayedXp = null; _displayedBoostXp = null;
    return;
  }
  const { level = 0, title = '', heartbeatRatePerMin = 0 } = data;
  document.getElementById('app-xp-level').textContent   = t('feed.hover_level', { n: level });
  document.getElementById('app-xp-title').textContent    = title || '';
  document.getElementById('app-xp-hb-rate').textContent  = _hbRateText(heartbeatRatePerMin);
  _enqueueXpAnim(data);
  wrap.hidden = false;
}

// Average levels snap rather than tween; the value is not derived from XP.
function _renderAvgLevel(data) {
  const wrap = document.getElementById('avg-lvl-summary');
  if (!wrap) return;
  if (!data) { wrap.hidden = true; return; }
  const { users = 0, avgLevel = 0, avgLevelTitle = '', avgLevelFraction = 0,
          sumLevels = 0, levelsNeededForNextAvg = 0, minLevel = 0, maxLevel = 0 } = data;
  document.getElementById('avg-lvl-level').textContent = t('feed.hover_level', { n: avgLevel });
  document.getElementById('avg-lvl-title').textContent  = avgLevelTitle || '';
  document.getElementById('avg-lvl-users').textContent  = t('appxp.users', { n: users.toLocaleString(), s: users === 1 ? '' : 's' });
  const pct = Math.max(0, Math.min(100, Math.round(avgLevelFraction * 100)));
  document.getElementById('avg-lvl-bar-fill').style.width = `${pct}%`;
  document.getElementById('avg-lvl-text').innerHTML =
    `<span class="lvl-val">${t('appxp.total_levels', { n: sumLevels.toLocaleString() })}</span> · ${t('appxp.more_to_lvl', { n: levelsNeededForNextAvg.toLocaleString(), lvl: avgLevel + 1 })}`;
  document.getElementById('avg-lvl-range').textContent = t('appxp.range', { min: minLevel, max: maxLevel });
  wrap.hidden = false;
}

let _appXpFetchPromise = null;
let _appXpDebounceTimer = null;
let _appXpPendingResolvers = [];
// Debounce reward-refresh bursts with a trailing update.
const APP_XP_DEBOUNCE_MS = 300;

export function refreshAppXp() {
  const wrap    = document.getElementById('app-xp-summary');
  const avgWrap = document.getElementById('avg-lvl-summary');
  if (!getToken() || isDemoMode || !_hooks.getCanSeeAppXp?.()) {
    if (wrap) wrap.hidden = true;
    if (avgWrap) avgWrap.hidden = true;
    _animGen++; // hard reset: invalidate any in-flight animation
    _animQueue = []; _animRunning = false;
    _displayedXp = null; _displayedBoostXp = null;
    return Promise.resolve();
  }
  if (_appXpFetchPromise) return _appXpFetchPromise; // a merged fetch is already in flight - join it
  return new Promise(resolve => {
    _appXpPendingResolvers.push(resolve);
    clearTimeout(_appXpDebounceTimer);
    _appXpDebounceTimer = setTimeout(() => {
      _appXpDebounceTimer = null;
      const resolvers = _appXpPendingResolvers;
      _appXpPendingResolvers = [];
      _appXpFetchPromise = (async () => {
        try {
          const res = await apiFetch('/api/app-xp');
          if (!res.ok) { if (wrap) wrap.hidden = true; if (avgWrap) avgWrap.hidden = true; return; }
          const data = await res.json();
          _render(data);
          _renderAvgLevel(data);
        } catch {}
        finally {
          _appXpFetchPromise = null;
          resolvers.forEach(r => r());
        }
      })();
    }, APP_XP_DEBOUNCE_MS);
  });
}

// ── "Someone else earned XP/GC" live floaters ────────────────────────────────

function _isBooksScreenVisible() {
  return document.getElementById('books-screen')?.style.display !== 'none'
    && document.getElementById('landing-wrapper')?.style.display !== 'none';
}

function _isMainScreenVisible() {
  return document.getElementById('main-screen')?.style.display !== 'none';
}

// Place app reward floaters opposite personal rewards, in the available panel gap.
function _positionAppRewardLayer(layer) {
  layer.style.bottom = '1rem';
  if (_isMainScreenVisible() && !_isBooksScreenVisible()) {
    const dice     = document.getElementById('dice-roller-wrap');
    const playStack = document.getElementById('play-bottom-stack');
    const diceRect  = dice?.getBoundingClientRect();
    const stackRect = playStack?.getBoundingClientRect();
    if (diceRect?.width > 0 && stackRect?.width > 0 && stackRect.left > diceRect.right) {
      const centerX = diceRect.right + ((stackRect.left - diceRect.right) / 2);
      layer.style.left = `${Math.round(centerX)}px`;
      layer.style.transform = 'translateX(-50%)';
      return;
    }
    layer.style.left = '50%';
    layer.style.transform = 'translateX(-50%)';
    return;
  }
  const covers = document.getElementById('covers-panel');
  const feed   = document.getElementById('feed-panel');
  const coversRect = covers?.getBoundingClientRect();
  const feedRect   = feed?.getBoundingClientRect();
  // Require visible, positive-width anchors and enough space before spawning floaters.
  const MIN_GAP = 200;
  if (coversRect?.width > 0 && feedRect?.width > 0 && (feedRect.left - coversRect.right) >= MIN_GAP) {
    const centerX = coversRect.right + ((feedRect.left - coversRect.right) / 2);
    layer.style.left = `${Math.round(centerX)}px`;
    layer.style.transform = 'translateX(-50%)';
  } else {
    layer.style.left = '50%';
    layer.style.transform = 'translateX(-50%)';
  }
}

let _appRewardFloaterQueue  = [];
let _appRewardFloaterActive = false;

function _drainAppRewardFloaterQueue() {
  if (_appRewardFloaterActive) return;
  const next = _appRewardFloaterQueue.shift();
  if (!next) return;
  const layer = document.getElementById('app-reward-float-layer');
  if (!layer) return;
  _appRewardFloaterActive = true;
  _positionAppRewardLayer(layer);
  const chip = document.createElement('div');
  chip.className = `app-reward-float app-reward-float--${next.type}`;
  chip.innerHTML = next.html;
  layer.appendChild(chip);
  setTimeout(() => { chip.remove(); _appRewardFloaterActive = false; _drainAppRewardFloaterQueue(); }, 5000);
}

function _spawnAppRewardFloater(type, html) {
  _appRewardFloaterQueue.push({ type, html });
  _drainAppRewardFloaterQueue();
}

// Coalesce rewards for the same player within 750ms; never combine different players.
const _appRewardAccum       = new Map(); // username -> { xp, coins }
const _appRewardFlushTimers = new Map(); // username -> timer id

export function handleAppXpEvent(payload) {
  if (!payload || !_hooks.getIsAdmin?.() || !(_isBooksScreenVisible() || _isMainScreenVisible())) return;
  const rawUsername = String(payload.username || '?');
  const username = escapeHtml(rawUsername);
  const xpDelta    = Math.max(0, Math.round(Number(payload.xpDelta) || 0));
  const coinDelta  = Math.max(0, Math.round(Number(payload.coinDelta) || 0));
  if (xpDelta <= 0 && coinDelta <= 0) return;

  const accum = _appRewardAccum.get(rawUsername) || { xp: 0, coins: 0 };
  accum.xp    += xpDelta;
  accum.coins += coinDelta;
  _appRewardAccum.set(rawUsername, accum);

  if (_appRewardFlushTimers.has(rawUsername)) return;
  _appRewardFlushTimers.set(rawUsername, setTimeout(() => {
    _appRewardFlushTimers.delete(rawUsername);
    const { xp, coins } = _appRewardAccum.get(rawUsername) || { xp: 0, coins: 0 };
    _appRewardAccum.delete(rawUsername);
    // Recheck visibility and permissions when the delayed floater spawns.
    if (!_hooks.getIsAdmin?.() || !(_isBooksScreenVisible() || _isMainScreenVisible())) return;
    if (xp > 0) {
      _spawnAppRewardFloater('xp', `<span>+${xp.toLocaleString()} XP</span><span class="app-reward-float-sep">-</span><span class="app-reward-float-user">${username}</span>`);
    }
    if (coins > 0) {
      _spawnAppRewardFloater('coins', `${COIN_SVG}<span>+${coins.toLocaleString()}</span><span class="app-reward-float-sep">-</span><span class="app-reward-float-user">${username}</span>`);
    }
  }, 750));
}
