import { _isMobile, _shuffle } from './helpers.js';
import { coversState } from './state.js';
import { getToken, isDemoMode } from '../state.js';

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
  // Show the "real" cover, undimmed, once all three landing panels (covers,
  // my books, feed) are collapsed - reapply the dim the moment any comes
  // back, since it exists purely for legibility behind those panels.
  const dim = document.getElementById('landing-bg-dim');
  if (dim) dim.style.opacity = allCollapsed ? '0' : '1';
}

// ── Landing background rotation ─────────────────────────────────────────────
// Once the interval exists, ONLY two things are allowed to touch it or the
// visible cover: the explicit Ctrl+X hide/show toggle, and an explicit
// cover-source setting change. Routine calls (returning to the landing
// screen, a background data refresh, a transient empty-pool/fetch-failure
// blip) must never start, stop, or restart the interval, and must never
// touch layer opacity - they just call _startLandingCoverRotation(), which
// is a no-op once the interval is already running. This is deliberately
// simple: no per-call flags, no "pause vs stop" distinction, no fingerprint
// gating - every one of those was tried in turn and each still found some
// path that blanked the background or re-triggered a rotation on an
// unrelated action.

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

// In-flight guard: a rotation request arriving mid-crossfade queues instead
// of stomping the transition already in progress (which could otherwise
// leave both layers at opacity 0).
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
  // Darkening is a separate #landing-bg-dim layer (see landing.css), not
  // baked into this image, so it can be faded independently of rotation -
  // see _updateLandingBgDragUi() below.
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
  // Coverless feed day cards (.feed-day-card--glass, demo.css) get their own
  // copy of the raw cover art via --landing-cover-url, rather than showing
  // #landing-bg-a/-b through genuine transparency - #landing-bg-dim (92%
  // opaque, for legibility behind the landing panels) sits physically
  // between those fixed layers and anything painted on top, so a
  // transparent card can only ever show the pre-dimmed composite, never the
  // raw image a real cover-tile card gets. A card-local copy paints fresh,
  // undimmed pixels that never touch #landing-bg-dim at all.
  //
  // The card's background-image swaps instantly (no browser support for
  // transitioning that property), so without the block below it would pop
  // to the new cover well ahead of the real #landing-bg-a/-b crossfade
  // above, which takes 1.5s. --landing-cover-url-prev/-fade drive a
  // ::before layer (demo.css) that holds the OLD cover at full opacity and
  // fades it out over the same 1.5s, so the card's reveal is paced to
  // match. Order matters: capture the outgoing url/pos and pin
  // --landing-cover-fade at 1 (still showing old, no transition yet)
  // BEFORE swapping the base image, then flush layout so the browser
  // commits that frame before setting fade to 0 - otherwise the browser
  // could coalesce the 1->0 change with the initial 1 and skip the
  // transition entirely. Skipped entirely when there's no prior url (first
  // paint of the session, or right after _stopLandingCoverRotation() blanked
  // it) - crossfading FROM a blank/stale frame is exactly the flash bug this
  // whole thing exists to avoid, so a fresh start just paints directly.
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

// No-op if the interval already exists - the only case that starts it is the
// very first call this session. The 60s rotation runs under BOTH motion
// modes: it's a slow periodic swap, not a continuous animation, and the user
// expects the background to keep changing either way (reduce-motion only
// calms HOW it changes - reduce-motion.css drops the crossfade transition, so
// the swap is instant). The immediate paint, however, is gated on nothing
// currently being visible (first paint of the session, or right after
// _stopLandingCoverRotation blanked the layers for the Ctrl+X hide toggle) in
// both modes: routine callers (showBooks(), prefs syncs, the drag-release
// prefs save) hit this function constantly, and painting unconditionally made
// every one of those rotate the background on the spot instead of waiting for
// the next tick.
export function _startLandingCoverRotation() {
  if (coversState._landingBgHidden || document.getElementById('landing-wrapper')?.style.display === 'none') return;
  _applyLandingBgPosition();
  if (window._landingCoverInterval) return;
  window._landingCoverInterval = setInterval(_rotateLandingCover, 60_000);
  const a = document.getElementById('landing-bg-a');
  const b = document.getElementById('landing-bg-b');
  if (a?.style.opacity !== '1' && b?.style.opacity !== '1') _rotateLandingCover();
}

// Explicit user action only (the Ctrl+X hide toggle) - actually blanks the
// background and stops the timer, since that's the point. Also clears the
// glass-card's copied cover vars (not just the fixed layers) - leaving
// --landing-cover-url pointing at the last-shown cover meant the next
// _rotateLandingCover() treated it as a real "previous" frame to crossfade
// FROM, so restoring the panels flashed that stale cover for the first
// 1.5s. A blank prev makes the next rotation paint directly instead.
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
