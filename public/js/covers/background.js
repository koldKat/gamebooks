import { _isMobile, _shuffle } from './helpers.js';
import { coversState } from './state.js';
import { getToken, isDemoMode } from '../core/state.js';

// ── Landing bg ─────────────────────────────────────────────────────────────────
export function _landingCoverKey(cover) {
  return cover?.id != null ? String(cover.id) : '';
}

export function _landingCoverPosForKey(key) {
  const val = Number(coversState._landingCoverPosPrefs?.[key]);
  return Number.isFinite(val) ? Math.max(0, Math.min(100, val)) : 50;
}

export function _persistLandingCoverPos() {
  if (!getToken() || isDemoMode || !coversState._landingBgCurrentKey) return;
  coversState._landingCoverPosPrefs = {
    ...coversState._landingCoverPosPrefs,
    [coversState._landingBgCurrentKey]: Math.round(coversState._landingBgPosY * 10) / 10,
  };
  coversState._hooks.savePrefs?.({ landingCoverPos: coversState._landingCoverPosPrefs });
}

export function _effectiveLandingCoverSource() {
  return (coversState._landingCoverSource === 'mine' && getToken() && !isDemoMode) ? 'mine' : 'public';
}

export function _ownedLandingCoverPool() {
  const books = Array.isArray(coversState._hooks.getCachedBooks?.()) ? coversState._hooks.getCachedBooks() : [];
  const seen = new Set();
  return books
    .filter(b => !!b?.cover_path)
    .map(b => ({
      id: `owned_${b.id}`,
      entityId: b.id,
      type: b.is_container ? 'anthology' : 'book',
      isSeries: false,
      isContainer: !!b.is_container,
      name: b.name,
      description: b.description || null,
      createdAt: b.created_at || b.createdAt || 0,
      authors: b.authors || null,
      seriesName: b.series_name || null,
      coverUrl: `/covers/${b.cover_path}`,
    }))
    .filter(entry => {
      if (!entry.coverUrl || seen.has(entry.coverUrl)) return false;
      seen.add(entry.coverUrl);
      return true;
    });
}

export function _landingCoverPool() {
  if (_effectiveLandingCoverSource() !== 'mine') return (coversState._allCovers || []).filter(c => c.coverUrl);
  return _ownedLandingCoverPool();
}

export function _applyLandingBgPosition() {
  ['a', 'b'].forEach(l => {
    const el = document.getElementById(`landing-bg-${l}`);
    if (el) el.style.backgroundPosition = `center ${coversState._landingBgPosY}%`;
  });
  document.documentElement.style.setProperty('--landing-cover-pos', `center ${coversState._landingBgPosY}%`);
}

export function _canDragLandingBg() {
  if (_isMobile()) return false;
  if (document.getElementById('landing-wrapper')?.style.display === 'none') return false;
  return document.body.classList.contains('covers-collapsed')
    && document.body.classList.contains('right-collapsed')
    && document.body.classList.contains('feed-collapsed');
}

export function _updateLandingBgDragUi() {
  const wrapper = document.getElementById('landing-wrapper');
  if (!wrapper) return;
  const allCollapsed = _canDragLandingBg();
  wrapper.classList.toggle('landing-bg-draggable', allCollapsed);
  // Remove dimming when all panels collapse; restore it when any panel returns.
  const dim = document.getElementById('landing-bg-dim');
  if (dim) dim.style.opacity = allCollapsed ? '0' : '1';
}

// Routine refreshes must not restart rotation or clear the visible layer.

export function _resetLandingCoverQueue() {
  coversState._landingBgQueue = [];
  coversState._landingBgQueueIdx = 0;
}

export function _nextLandingCover() {
  const coversPool = _landingCoverPool();
  if (!coversPool.length) return null;
  if (coversState._landingBgQueueIdx >= coversState._landingBgQueue.length) {
    coversState._landingBgQueue = _shuffle(coversPool);
    coversState._landingBgQueueIdx = 0;
  }
  return coversState._landingBgQueue[coversState._landingBgQueueIdx++] || null;
}

// Queue rotations during crossfade so overlapping transitions cannot blank both layers.
let _rotationInFlight = false;
let _rotationQueued   = false;
let _rotationGeneration = 0;
let _rotationFadeTimer = null;
let _rotationFinishTimer = null;

// Always safe to call: silently does nothing (leaves whatever is currently
// showing untouched) if there's no cover available right now.
export function _rotateLandingCover() {
  if (coversState._landingBgHidden || document.getElementById('landing-wrapper')?.style.display === 'none') return;
  if (_rotationInFlight) { _rotationQueued = true; return; }
  const pick = _nextLandingCover();
  if (!pick) return;
  const key = _landingCoverKey(pick);
  coversState._landingBgCurrentKey = key || null;
  coversState._landingBgPosY = _landingCoverPosForKey(key);
  // Keep dimming separate from the rotating image.
  const url = `url(${pick.coverUrl})`;
  const next = coversState._landingBgActive === 'a' ? 'b' : 'a';
  const cur = document.getElementById(`landing-bg-${coversState._landingBgActive}`);
  const nxt = document.getElementById(`landing-bg-${next}`);
  if (!cur || !nxt) return;
  const generation = _rotationGeneration;
  _rotationInFlight = true;
  nxt.style.willChange = 'opacity';
  nxt.style.backgroundImage = url;
  nxt.style.backgroundPosition = `center ${coversState._landingBgPosY}%`;
  nxt.style.opacity = '1';
  // Copy raw covers into glass cards to bypass the landing dim layer.
  // Commit the outgoing frame before fading; skip crossfade when no previous image exists.
  const root = document.documentElement;
  const prevUrl = root.style.getPropertyValue('--landing-cover-url');
  if (prevUrl) {
    root.style.setProperty('--landing-cover-url-prev', prevUrl);
    root.style.setProperty('--landing-cover-pos-prev', root.style.getPropertyValue('--landing-cover-pos'));
    root.style.setProperty('--landing-cover-fade', '1');
  }
  root.style.setProperty('--landing-cover-url', url);
  root.style.setProperty('--landing-cover-pos', `center ${coversState._landingBgPosY}%`);
  if (prevUrl) {
    void root.offsetHeight; // flush layout before starting the fade-out
    requestAnimationFrame(() => {
      if (generation === _rotationGeneration) root.style.setProperty('--landing-cover-fade', '0');
    });
  } else {
    root.style.setProperty('--landing-cover-fade', '0');
  }
  _rotationFadeTimer = setTimeout(() => {
    if (generation !== _rotationGeneration) return;
    _rotationFadeTimer = null;
    cur.style.opacity = '0';
    _rotationFinishTimer = setTimeout(() => {
      if (generation !== _rotationGeneration) return;
      _rotationFinishTimer = null;
      cur.style.willChange = 'auto';
      _rotationInFlight = false;
      if (_rotationQueued) { _rotationQueued = false; _rotateLandingCover(); }
    }, 1600);
  }, 1500);
  coversState._landingBgActive = next;
}

// Start one interval; paint immediately only if no layer is visible.
// Reduce-motion changes the transition, not the rotation cadence.
export function _startLandingCoverRotation() {
  if (coversState._landingBgHidden || document.getElementById('landing-wrapper')?.style.display === 'none') return;
  _applyLandingBgPosition();
  if (window._landingCoverInterval) return;
  window._landingCoverInterval = setInterval(_rotateLandingCover, 60_000);
  const a = document.getElementById('landing-bg-a');
  const b = document.getElementById('landing-bg-b');
  if (a?.style.opacity !== '1' && b?.style.opacity !== '1') _rotateLandingCover();
}

// Clear copied cover variables too, so restarting cannot crossfade from a stale frame.
export function _stopLandingCoverRotation() {
  // Invalidate an unfinished crossfade before hiding or restarting the layers.
  _rotationGeneration++;
  clearTimeout(_rotationFadeTimer);
  clearTimeout(_rotationFinishTimer);
  _rotationFadeTimer = null;
  _rotationFinishTimer = null;
  _rotationInFlight = false;
  _rotationQueued = false;
  clearInterval(window._landingCoverInterval);
  window._landingCoverInterval = null;
  _resetLandingCoverQueue();
  ['a','b'].forEach(l => {
    const el = document.getElementById(`landing-bg-${l}`);
    if (el) { el.style.opacity = '0'; el.style.willChange = 'auto'; }
  });
  const root = document.documentElement;
  root.style.setProperty('--landing-cover-url', '');
  root.style.setProperty('--landing-cover-url-prev', '');
  root.style.setProperty('--landing-cover-fade', '0');
}
