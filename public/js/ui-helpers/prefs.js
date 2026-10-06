// prefs.js - Server-side UI pref persistence and panel collapse helpers

import { getToken, getUsername, isDemoMode, apiFetch } from '../core/state.js';
import { setTrailCollapsed, setChoicesRecordedCount, CHOICES_PULSE_THRESHOLD } from '../play.js';
import { setCoversPrefsState, _updateLandingBgDragUi } from '../covers.js';
import { setExpandedPrefs, renderBooksList, getCachedBooks, getCachedAllSeries, getCachedStashes } from '../books.js';

let _hooks = {};
export function setPrefsHooks(h) { _hooks = h || {}; }

let _localPrefOverrides   = {};
let _landingPanelRestoreState = null;
let _playPanelRestoreState    = null;
let _feedScrollBeforeCollapse  = null;

export function savePrefs(patch) {
  if (!getToken()) return;
  Object.assign(_localPrefOverrides, patch);
  try {
    const key = `ui_prefs_v1:${getUsername()}`;
    const cached = JSON.parse(localStorage.getItem(key) || '{}');
    localStorage.setItem(key, JSON.stringify({ ...cached, ...patch }));
  } catch {}
  apiFetch('/api/prefs', { method: 'PATCH', body: JSON.stringify(patch) }).catch(() => {});
}

export function applyPrefs(p, { renderBooks = true } = {}) {
  setCoversPrefsState(p);
  setExpandedPrefs(p.bookExpanded, p.seriesExpanded, p.stashExpanded);
  const boolKeys = {
    'covers-collapsed':  { cls: 'covers-collapsed',  btn: 'covers-toggle',  collapsed: '›', expanded: '‹' },
    'right-collapsed':   { cls: 'right-collapsed',   btn: 'right-toggle',   collapsed: '‹', expanded: '›' },
    'sidebar-collapsed': { cls: 'sidebar-collapsed', btn: 'sidebar-toggle', collapsed: '›', expanded: '‹' },
  };
  for (const [key, { cls, btn, collapsed, expanded }] of Object.entries(boolKeys)) {
    if (!(key in p)) continue;
    const val = p[key] === '1';
    localStorage.setItem(key, val ? '1' : '0');
    document.body.classList.toggle(cls, val);
    const el = document.getElementById(btn);
    if (el) el.textContent = val ? collapsed : expanded;
  }
  if ('legendCollapsed' in p) {
    const val = p.legendCollapsed === '1';
    localStorage.setItem('legendCollapsed', val ? '1' : '0');
    document.getElementById('legend')?.classList.toggle('legend-collapsed', val);
  }
  if ('diceRollerCollapsed' in p) {
    const val = p.diceRollerCollapsed === '1';
    localStorage.setItem('diceRollerCollapsed', val ? '1' : '0');
    document.getElementById('dice-roller')?.classList.toggle('dice-collapsed', val);
  }
  if ('trailCollapsed' in p) {
    const val = p.trailCollapsed === '1';
    localStorage.setItem('trailCollapsed', val ? '1' : '0');
    setTrailCollapsed(val);
  }
  if ('playXpCollapsed' in p) {
    const val = p.playXpCollapsed === '1';
    localStorage.setItem('playXpCollapsed', val ? '1' : '0');
    document.getElementById('play-xp-summary')?.classList.toggle('play-xp-collapsed', val);
  }
  if ('choicesRecordedCount' in p) {
    setChoicesRecordedCount(p.choicesRecordedCount);
    // Apply onboarding pulse state directly if the async preference sync follows rendering.
    document.getElementById('choices-input')?.classList.toggle(
      'choices-input--pulse', Number(p.choicesRecordedCount) < CHOICES_PULSE_THRESHOLD
    );
  }
  if (renderBooks && getCachedBooks() && Array.isArray(getCachedBooks())) {
    renderBooksList(getCachedBooks(), getCachedAllSeries(), getCachedStashes());
  }
  // Recalculate feed tile sizes after applying saved panel widths.
  if ('covers-collapsed' in p || 'right-collapsed' in p) _hooks.refreshDayCovers?.();
}

// Restore account-specific layout before rendering a cached library.
export function restoreCachedPrefs() {
  if (!getToken() || isDemoMode) return;
  try {
    const prefs = JSON.parse(localStorage.getItem(`ui_prefs_v1:${getUsername()}`) || 'null');
    if (prefs && typeof prefs === 'object' && !Array.isArray(prefs)) applyPrefs(prefs, { renderBooks: false });
  } catch {}
}

export async function syncPrefs(options) {
  const sessionToken = getToken();
  if (!sessionToken || isDemoMode) return;
  const username = getUsername();
  try {
    const snapshotBefore = { ..._localPrefOverrides };
    const r = await apiFetch('/api/prefs');
    if (!r.ok) return;
    const serverPrefs = await r.json();
    if (getToken() !== sessionToken) return;
    // Merge current overrides after the request, preserving preferences changed while it was in flight.
    const prefs = { ...serverPrefs, ..._localPrefOverrides };
    applyPrefs(prefs, options);
    try { localStorage.setItem(`ui_prefs_v1:${username}`, JSON.stringify(prefs)); } catch {}
    for (const k of Object.keys(snapshotBefore)) {
      if (_localPrefOverrides[k] === snapshotBefore[k]) delete _localPrefOverrides[k];
    }
  } catch {}
}

export function _setLandingPanelCollapsed(prefKey, collapsed) {
  const cfg = {
    'covers-collapsed': { cls: 'covers-collapsed', btn: 'covers-toggle', collapsedText: '›', expandedText: '‹' },
    'right-collapsed':  { cls: 'right-collapsed',  btn: 'right-toggle',  collapsedText: '‹', expandedText: '›' },
    'feed-collapsed':   { cls: 'feed-collapsed',   btn: 'feed-toggle',   collapsedText: '▾', expandedText: '▴' },
  }[prefKey];
  if (!cfg) return;
  // Restore scroll next frame after expanding the feed; collapse may have clamped scrollTop.
  if (prefKey === 'feed-collapsed') {
    const wrapper = document.getElementById('landing-wrapper');
    const wasCollapsed = document.body.classList.contains(cfg.cls);
    if (collapsed && !wasCollapsed && wrapper) _feedScrollBeforeCollapse = wrapper.scrollTop;
    else if (!collapsed && wasCollapsed && wrapper && _feedScrollBeforeCollapse != null) {
      const restore = _feedScrollBeforeCollapse;
      _feedScrollBeforeCollapse = null;
      requestAnimationFrame(() => requestAnimationFrame(() => { wrapper.scrollTop = restore; }));
    }
  }
  document.body.classList.toggle(cfg.cls, collapsed);
  document.getElementById(cfg.btn).textContent = collapsed ? cfg.collapsedText : cfg.expandedText;
  if (prefKey === 'feed-collapsed') {
    localStorage.removeItem('feed-collapsed');
  } else {
    localStorage.setItem(prefKey, collapsed ? '1' : '0');
    savePrefs({ [prefKey]: collapsed ? '1' : '0' });
  }
  _updateLandingBgDragUi();
  _hooks.refreshDayCovers?.();
}

export function _toggleAllLandingPanelsCollapsed() {
  const allCollapsed =
    document.body.classList.contains('covers-collapsed') &&
    document.body.classList.contains('right-collapsed') &&
    document.body.classList.contains('feed-collapsed');
  if (allCollapsed) {
    const restore = _landingPanelRestoreState || {
      'covers-collapsed': '0',
      'right-collapsed': '0',
      'feed-collapsed': '0',
    };
    _setLandingPanelCollapsed('covers-collapsed', restore['covers-collapsed'] === '1');
    _setLandingPanelCollapsed('right-collapsed', restore['right-collapsed'] === '1');
    _setLandingPanelCollapsed('feed-collapsed', restore['feed-collapsed'] === '1');
    _landingPanelRestoreState = null;
    return;
  }
  _landingPanelRestoreState = {
    'covers-collapsed': document.body.classList.contains('covers-collapsed') ? '1' : '0',
    'right-collapsed':  document.body.classList.contains('right-collapsed')  ? '1' : '0',
    'feed-collapsed':   document.body.classList.contains('feed-collapsed')   ? '1' : '0',
  };
  _setLandingPanelCollapsed('covers-collapsed', true);
  _setLandingPanelCollapsed('right-collapsed', true);
  _setLandingPanelCollapsed('feed-collapsed', true);
}

export function _setPlayPanelCollapsed(prefKey, collapsed) {
  if (prefKey === 'sidebar-collapsed') {
    document.body.classList.toggle('sidebar-collapsed', collapsed);
    document.getElementById('sidebar-toggle').textContent = collapsed ? '›' : '‹';
    localStorage.setItem('sidebar-collapsed', collapsed ? '1' : '0');
    savePrefs({ 'sidebar-collapsed': collapsed ? '1' : '0' });
    return;
  }
  if (prefKey === 'legendCollapsed') {
    document.getElementById('legend')?.classList.toggle('legend-collapsed', collapsed);
    localStorage.setItem('legendCollapsed', collapsed ? '1' : '0');
    savePrefs({ legendCollapsed: collapsed ? '1' : '0' });
    return;
  }
  if (prefKey === 'diceRollerCollapsed') {
    document.getElementById('dice-roller')?.classList.toggle('dice-collapsed', collapsed);
    localStorage.setItem('diceRollerCollapsed', collapsed ? '1' : '0');
    savePrefs({ diceRollerCollapsed: collapsed ? '1' : '0' });
    return;
  }
  if (prefKey === 'trailCollapsed') {
    setTrailCollapsed(collapsed);
    document.getElementById('run-trail-float')?.classList.toggle('trail-collapsed', collapsed);
    localStorage.setItem('trailCollapsed', collapsed ? '1' : '0');
    savePrefs({ trailCollapsed: collapsed ? '1' : '0' });
    return;
  }
  if (prefKey === 'playXpCollapsed') {
    document.getElementById('play-xp-summary')?.classList.toggle('play-xp-collapsed', collapsed);
    localStorage.setItem('playXpCollapsed', collapsed ? '1' : '0');
    savePrefs({ playXpCollapsed: collapsed ? '1' : '0' });
  }
}

export function _toggleAllPlayPanelsCollapsed() {
  const allCollapsed =
    document.body.classList.contains('sidebar-collapsed') &&
    document.getElementById('legend')?.classList.contains('legend-collapsed') &&
    document.getElementById('dice-roller')?.classList.contains('dice-collapsed') &&
    document.getElementById('run-trail-float')?.classList.contains('trail-collapsed') &&
    document.getElementById('play-xp-summary')?.classList.contains('play-xp-collapsed');
  if (allCollapsed) {
    const restore = _playPanelRestoreState || {
      'sidebar-collapsed': '0',
      legendCollapsed: '0',
      diceRollerCollapsed: '0',
      trailCollapsed: '0',
      playXpCollapsed: '0',
    };
    _setPlayPanelCollapsed('sidebar-collapsed', restore['sidebar-collapsed'] === '1');
    _setPlayPanelCollapsed('legendCollapsed', restore.legendCollapsed === '1');
    _setPlayPanelCollapsed('diceRollerCollapsed', restore.diceRollerCollapsed === '1');
    _setPlayPanelCollapsed('trailCollapsed', restore.trailCollapsed === '1');
    _setPlayPanelCollapsed('playXpCollapsed', restore.playXpCollapsed === '1');
    _playPanelRestoreState = null;
    return;
  }
  _playPanelRestoreState = {
    'sidebar-collapsed': document.body.classList.contains('sidebar-collapsed') ? '1' : '0',
    legendCollapsed:     document.getElementById('legend')?.classList.contains('legend-collapsed') ? '1' : '0',
    diceRollerCollapsed: document.getElementById('dice-roller')?.classList.contains('dice-collapsed') ? '1' : '0',
    trailCollapsed:      document.getElementById('run-trail-float')?.classList.contains('trail-collapsed') ? '1' : '0',
    playXpCollapsed:     document.getElementById('play-xp-summary')?.classList.contains('play-xp-collapsed') ? '1' : '0',
  };
  _setPlayPanelCollapsed('sidebar-collapsed', true);
  _setPlayPanelCollapsed('legendCollapsed', true);
  _setPlayPanelCollapsed('diceRollerCollapsed', true);
  _setPlayPanelCollapsed('trailCollapsed', true);
  _setPlayPanelCollapsed('playXpCollapsed', true);
}
