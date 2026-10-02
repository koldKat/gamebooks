// One elected tab owns SSE and polling; followers receive BroadcastChannel updates.

import { getToken, isDemoMode, apiFetch } from './state.js';
import { refreshCoinsDisplay } from '../progression/shop.js';

// Callbacks wired in by main.js at boot
let _hooks = {};
export function setLiveTabHooks(h) { _hooks = h || {}; }

// ── Internal state ────────────────────────────────────────────────────────────

const _LIVE_TAB_LOCK_KEY      = 'gamebooks_live_tab_leader';
const _LIVE_TAB_HEARTBEAT_MS  = 10000;
const _LIVE_TAB_STALE_MS      = 30000;
const _liveTabId               = `${Date.now()}_${Math.random().toString(36).slice(2)}`;

let _liveChannel                = null;
let _liveLeaderCheckInterval    = null;
let _liveLeaderHeartbeatInterval = null;
let _isLiveLeader               = false;
let _liveControllerStarted      = false;

let _publicCatalogSource = null;
let _feedSource          = null;
let _userBadgeSource     = null;
let _appXpSource         = null;

let _feedDirty           = false;
let _feedSseDebounce     = null;
let _publicCatalogDirty  = false;
let _userBadgeDirty      = false;
let _coinsDirty          = false;
let _feedPollInterval    = null;
let _booksPollInterval   = null;
let _lastFeedVersion     = null;
let _feedVersionPrimed   = false;

// ── Exports ───────────────────────────────────────────────────────────────────

export function _broadcastLiveEvent(type, payload = null) {
  if (!_liveChannel) return;
  try { _liveChannel.postMessage({ type, payload, from: _liveTabId, ts: Date.now() }); } catch (_) {}
}

function _disconnectPublicCatalogSSE() {
  if (_publicCatalogSource) {
    try { _publicCatalogSource.close(); } catch (_) {}
    _publicCatalogSource = null;
  }
}

function _disconnectFeedSSE() {
  if (_feedSource) {
    try { _feedSource.close(); } catch (_) {}
    _feedSource = null;
  }
}

// Stagger app-wide XP from personal XP so their stacked animations remain distinct.
const APP_XP_STAGGER_MS = 1200;
let _appXpStaggerTimer = null;
function _refreshAppXpStaggered() {
  // Coalesce award bursts into one app-XP refresh.
  if (_appXpStaggerTimer) clearTimeout(_appXpStaggerTimer);
  _appXpStaggerTimer = setTimeout(() => { _appXpStaggerTimer = null; _hooks.refreshAppXp?.(); }, APP_XP_STAGGER_MS);
}

// Use feed versions to avoid unchanged DOM rebuilds; reload on version-check failure.

async function _fetchFeedVersion() {
  const res = getToken()
    ? await apiFetch('/api/feed/version')
    : await _hooks.publicFetch?.('/api/feed/version');
  if (!res || !res.ok) throw new Error('feed version fetch failed');
  const data = await res.json();
  return data.version;
}

async function _refreshFeedIfChanged() {
  let version;
  try { version = await _fetchFeedVersion(); }
  catch (_) { _hooks.loadFeed?.(); return; }
  // First tick primes the baseline without reloading - boot already did the
  // initial loadFeed(), so rebuilding here would duplicate it.
  if (!_feedVersionPrimed) { _feedVersionPrimed = true; _lastFeedVersion = version; return; }
  if (version === _lastFeedVersion) return;
  _lastFeedVersion = version;
  _hooks.loadFeed?.();
}

// Rebaseline after direct/SSE reloads so polling does not render the same change twice.
export async function _syncFeedVersionBaseline() {
  try {
    const version = await _fetchFeedVersion();
    _feedVersionPrimed = true;
    _lastFeedVersion = version;
  } catch (_) {}
}

function _startLeaderIntervals() {
  if (!_feedPollInterval) {
    // Heartbeat awards come only from this timer, not feed reloads.
    // Continue in background tabs, but skip anonymous and demo sessions.
    _feedPollInterval = setInterval(() => {
      // Check feed versions only on the landing screen; heartbeat continues while playing.
      if (document.getElementById('main-screen')?.style.display === 'none') _refreshFeedIfChanged();
      if (getToken() && !isDemoMode) _hooks.sendHeartbeat?.();
      _refreshAppXpStaggered();
    }, 60_000);
  }
  if (!_booksPollInterval) {
    _booksPollInterval = setInterval(() => {
      const booksVisible = document.visibilityState === 'visible'
        && document.getElementById('books-screen')?.style.display !== 'none'
        && document.getElementById('main-screen')?.style.display === 'none';
      if (!booksVisible) return;
      _hooks.refreshBooksListOnly?.();
      _broadcastLiveEvent('books_changed');
    }, 5 * 60_000);
  }
}

function _stopLeaderIntervals() {
  if (_feedPollInterval)  { clearInterval(_feedPollInterval);  _feedPollInterval  = null; }
  if (_booksPollInterval) { clearInterval(_booksPollInterval); _booksPollInterval = null; }
}

function _connectLeaderLiveServices() {
  _connectFeedSSE();
  _connectPublicCatalogSSE();
  _connectUserBadgeSSE();
  _connectAppXpSSE(); // no-ops for non-admin/logged-out tabs via its own guard
  _startLeaderIntervals();
}

function _disconnectLeaderLiveServices() {
  _disconnectFeedSSE();
  _disconnectPublicCatalogSSE();
  _disconnectUserBadgeSSE();
  _disconnectAppXpSSE();
  _stopLeaderIntervals();
}

function _readLiveLeaderLock() {
  try {
    const raw = localStorage.getItem(_LIVE_TAB_LOCK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed.id === 'string' && typeof parsed.ts === 'number' ? parsed : null;
  } catch (_) { return null; }
}

function _writeLiveLeaderLock() {
  try { localStorage.setItem(_LIVE_TAB_LOCK_KEY, JSON.stringify({ id: _liveTabId, ts: Date.now() })); } catch (_) {}
}

function _setLiveLeader(active) {
  if (_isLiveLeader === active) return;
  _isLiveLeader = active;
  if (active) _connectLeaderLiveServices();
  else _disconnectLeaderLiveServices();
}

function _claimLiveLeadership() {
  const lock = _readLiveLeaderLock();
  const now  = Date.now();
  if (lock?.id === _liveTabId) { _setLiveLeader(true); return; }
  if (!lock || (now - lock.ts) > _LIVE_TAB_STALE_MS) {
    _writeLiveLeaderLock();
    const verify = _readLiveLeaderLock();
    _setLiveLeader(verify?.id === _liveTabId);
    return;
  }
  _setLiveLeader(false);
}

function _takeLiveLeadership() {
  _writeLiveLeaderLock();
  const verify = _readLiveLeaderLock();
  _setLiveLeader(verify?.id === _liveTabId);
}

function _applyFollowerLiveEvent(type, payload = null) {
  if (type === 'config_changed') {
    if (payload?.version) document.getElementById('app-version').textContent = payload.version;
    return;
  }
  if (type === 'feed_changed') {
    _feedDirty = true;
    if (_hooks.isLandingVisible?.() && document.visibilityState === 'visible') {
      clearTimeout(_feedSseDebounce);
      _feedSseDebounce = setTimeout(() => { _feedDirty = false; _hooks.loadFeed?.(); _syncFeedVersionBaseline(); _refreshAppXpStaggered(); }, 1500);
    }
    return;
  }
  if (type === 'covers_changed') {
    _publicCatalogDirty = true;
    if (_hooks.isLandingVisible?.() && document.visibilityState === 'visible') {
      _publicCatalogDirty = false;
      _hooks.loadCovers?.({ force: true });
    }
    return;
  }
  if (type === 'badges_changed') {
    _userBadgeDirty = true;
    if (document.visibilityState === 'visible' && getToken() && !isDemoMode) {
      _userBadgeDirty = false;
      _hooks.scheduleLiveUiRefresh?.({ inbox: true, notif: true, forum: true, reward: true, party: true, prefs: true }, 80);
    }
    return;
  }
  if (type === 'coins_changed') {
    _coinsDirty = true;
    if (document.visibilityState === 'visible' && getToken() && !isDemoMode) {
      _coinsDirty = false;
      refreshCoinsDisplay();
    }
    return;
  }
  if (type === 'reward_snapshot') {
    if (payload && document.visibilityState === 'visible' && getToken() && !isDemoMode) {
      _hooks.processRewardSnapshot?.(payload, { broadcast: false });
    }
    return;
  }
  if (type === 'app_xp_event') {
    if (payload && document.visibilityState === 'visible' && getToken() && !isDemoMode) {
      _hooks.onAppXpEvent?.(payload);
      _refreshAppXpStaggered();
    }
    return;
  }
  if (type === 'books_changed') {
    if (document.visibilityState === 'visible' && document.getElementById('books-screen')?.style.display !== 'none') {
      _hooks.refreshBooksListOnly?.();
    }
  }
}

function _connectPublicCatalogSSE() {
  if (!_isLiveLeader || _publicCatalogSource || typeof EventSource === 'undefined') return;
  try {
    _publicCatalogSource = new EventSource('/api/public/stream');
    _publicCatalogSource.onmessage = () => {
      _hooks.refreshPublicCatalogIfVisible?.();
      _broadcastLiveEvent('covers_changed');
    };
    _publicCatalogSource.onerror = () => {};
  } catch (_) {}
}

function _connectFeedSSE() {
  if (!_isLiveLeader || _feedSource || typeof EventSource === 'undefined') return;
  try {
    _feedSource = new EventSource('/api/feed/stream');
    _feedSource.onmessage = e => {
      let payload; try { payload = JSON.parse(e.data); } catch { payload = {}; }
      if (payload.type === 'config_changed') {
        if (payload.version) document.getElementById('app-version').textContent = payload.version;
        _broadcastLiveEvent('config_changed', { version: payload.version });
        return;
      }
      _feedDirty = true;
      if (_hooks.isLandingVisible?.()) {
        clearTimeout(_feedSseDebounce);
        _feedSseDebounce = setTimeout(() => { _feedDirty = false; _hooks.loadFeed?.(); _syncFeedVersionBaseline(); _refreshAppXpStaggered(); }, 1500);
      }
      _broadcastLiveEvent('feed_changed');
    };
    _feedSource.onerror = () => {};
  } catch (_) {}
}

export function _disconnectUserBadgeSSE() {
  if (_userBadgeSource) {
    try { _userBadgeSource.close(); } catch (_) {}
    _userBadgeSource = null;
  }
}

export function _connectUserBadgeSSE() {
  if (!_isLiveLeader || _userBadgeSource || typeof EventSource === 'undefined' || !getToken() || isDemoMode) return;
  try {
    _userBadgeSource = new EventSource(`/api/user/stream?token=${encodeURIComponent(getToken())}`);
    _userBadgeSource.onmessage = () => {
      _hooks.scheduleLiveUiRefresh?.({ inbox: true, notif: true, forum: true, reward: true, party: true, prefs: true }, 120);
      _broadcastLiveEvent('badges_changed');
    };
    _userBadgeSource.onerror = () => {};
  } catch (_) {}
}

export function _disconnectAppXpSSE() {
  if (_appXpSource) {
    try { _appXpSource.close(); } catch (_) {}
    _appXpSource = null;
  }
}

export function _connectAppXpSSE() {
  if (!_isLiveLeader || _appXpSource || typeof EventSource === 'undefined' || !getToken() || isDemoMode || !_hooks.getIsAdmin?.()) return;
  try {
    _appXpSource = new EventSource(`/api/app-xp/stream?token=${encodeURIComponent(getToken())}`);
    _appXpSource.onmessage = e => {
      let payload; try { payload = JSON.parse(e.data); } catch { return; }
      _hooks.onAppXpEvent?.(payload);
      // Refresh the summary as well as the floater, using the shared stagger.
      _refreshAppXpStaggered();
      _broadcastLiveEvent('app_xp_event', payload);
    };
    _appXpSource.onerror = () => {};
  } catch (_) {}
}

export function _ensureLiveTabControllerStarted() {
  if (_liveControllerStarted) return;
  _liveControllerStarted = true;

  if (typeof BroadcastChannel !== 'undefined') {
    try {
      _liveChannel = new BroadcastChannel('gamebooks-live');
      _liveChannel.onmessage = e => {
        const msg = e?.data;
        if (!msg || msg.from === _liveTabId || _isLiveLeader) return;
        _applyFollowerLiveEvent(msg.type, msg.payload);
      };
    } catch (_) {}
  }

  window.addEventListener('storage', e => {
    if (e.key !== _LIVE_TAB_LOCK_KEY) return;
    const lock = _readLiveLeaderLock();
    if (!lock) { _claimLiveLeadership(); return; }
    if (lock.id !== _liveTabId) _setLiveLeader(false);
  });

  function _onTabBecomeVisible() {
    _takeLiveLeadership();
    // Catch up feed and reward state after a frozen/throttled tab becomes visible.
    _refreshFeedIfChanged();
    if (getToken() && !isDemoMode) _hooks.scheduleRewardProfileRefresh?.(150);
    if (_feedDirty && _hooks.isLandingVisible?.())          { _feedDirty = false; _hooks.loadFeed?.(); _syncFeedVersionBaseline(); }
    if (_publicCatalogDirty && _hooks.isLandingVisible?.()) { _publicCatalogDirty = false; _hooks.loadCovers?.({ force: true }); }
    if (_userBadgeDirty && getToken() && !isDemoMode) {
      _userBadgeDirty = false;
      _hooks.scheduleLiveUiRefresh?.({ inbox: true, notif: true, forum: true, reward: true, party: true, prefs: true }, 80);
    }
    if (_coinsDirty && getToken() && !isDemoMode) {
      _coinsDirty = false;
      refreshCoinsDisplay();
    }
  }

  function _onWindowFocus() {
    _takeLiveLeadership();
    _refreshFeedIfChanged();
    if (_feedDirty && _hooks.isLandingVisible?.())          { _feedDirty = false; _hooks.loadFeed?.(); _syncFeedVersionBaseline(); }
    if (_publicCatalogDirty && _hooks.isLandingVisible?.()) { _publicCatalogDirty = false; _hooks.loadCovers?.({ force: true }); }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    _onTabBecomeVisible();
  });

  window.addEventListener('focus', _onWindowFocus);

  const _releaseLiveLeaderLock = () => {
    const lock = _readLiveLeaderLock();
    if (lock?.id === _liveTabId) {
      try { localStorage.removeItem(_LIVE_TAB_LOCK_KEY); } catch (_) {}
    }
  };
  window.addEventListener('beforeunload', _releaseLiveLeaderLock);
  window.addEventListener('pagehide',     _releaseLiveLeaderLock);

  _liveLeaderHeartbeatInterval = setInterval(() => {
    if (_isLiveLeader) _writeLiveLeaderLock();
  }, _LIVE_TAB_HEARTBEAT_MS);
  _liveLeaderCheckInterval = setInterval(_claimLiveLeadership, _LIVE_TAB_HEARTBEAT_MS);

  _claimLiveLeadership();
}
