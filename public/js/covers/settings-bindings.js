import { _coverTooltipTitlePercent } from './filters.js';
import { _refreshCoversDisplay } from './grid.js';
import { _persistLandingCoverPos, _applyLandingBgPosition, _canDragLandingBg, _updateLandingBgDragUi } from './background.js';
import { _applyCoverTooltipTitlePrefs, _persistCoverTooltipPrefs, _applyReduceMotionPref, _persistReduceMotionPref, _applyFeedDayCoversPref, _persistFeedDayCoversPref, _applyFeedGlassCardsPref, _persistFeedGlassCardsPref, _applyLandingBgHiddenPref, _persistLandingBgHiddenPref, _applyLandingCoverSourcePrefs, _persistLandingCoverSourcePref, _toggleCoverTooltipSettings } from './prefs.js';
import { coversState } from './state.js';
import { getToken, isDemoMode } from '../core/state.js';
import { t } from '../i18n.js';

export function _initCoverSettings() {
  // Initial pref application
  _applyCoverTooltipTitlePrefs();
  _applyLandingCoverSourcePrefs();
  _applyReduceMotionPref();
  _applyFeedDayCoversPref();
  _applyFeedGlassCardsPref();
  _applyLandingBgHiddenPref();

  // Cover tooltip size/bold/cyrillic
  document.getElementById('cover-tooltip-size-dec')?.addEventListener('click', () => {
    coversState._coverTooltipTitlePct = Math.max(100, _coverTooltipTitlePercent() - 1);
    _persistCoverTooltipPrefs();
  });
  document.getElementById('cover-tooltip-size-inc')?.addEventListener('click', () => {
    coversState._coverTooltipTitlePct = Math.min(148, _coverTooltipTitlePercent() + 1);
    _persistCoverTooltipPrefs();
  });
  document.getElementById('cover-tooltip-bold-cb')?.addEventListener('change', e => {
    coversState._coverTooltipTitleBold = !!e.target.checked;
    _persistCoverTooltipPrefs();
  });
  document.getElementById('cover-tooltip-hide-cyrillic-cb')?.addEventListener('change', e => {
    coversState._hideCyrillicCovers = !!e.target.checked;
    _persistCoverTooltipPrefs();
    _refreshCoversDisplay();
  });
  document.getElementById('reduce-motion-cb')?.addEventListener('change', e => {
    coversState._reduceMotion = !!e.target.checked;
    _persistReduceMotionPref();
    // The 60s landing rotation keeps running either way (reduce-motion only
    // calms the transition via CSS) - nothing to start/stop here.
  });
  document.getElementById('feed-day-covers-cb')?.addEventListener('change', e => {
    coversState._feedDayCovers = !!e.target.checked;
    _persistFeedDayCoversPref();
  });
  document.getElementById('feed-glass-cards-cb')?.addEventListener('change', e => {
    coversState._feedGlassCards = !!e.target.checked;
    _persistFeedGlassCardsPref();
  });

  // Covers overlays (own mousedown tracker to avoid sharing main.js _mousedownOnOverlay)
  let _overlayMousedownTarget = null;
  document.getElementById('cover-tooltip-settings-overlay')?.addEventListener('mousedown', e => { _overlayMousedownTarget = e.target === e.currentTarget ? e.target : null; });
  document.getElementById('cover-tooltip-settings-overlay')?.addEventListener('click', e => {
    if (e.target === e.currentTarget && _overlayMousedownTarget === e.target) _toggleCoverTooltipSettings(false);
  });
  document.getElementById('cover-tooltip-settings-close')?.addEventListener('click', () => _toggleCoverTooltipSettings(false));

  // Cover rotation source radio
  document.querySelectorAll('input[name="cover-rotation-source"]').forEach(radio => {
    radio.addEventListener('change', e => {
      coversState._landingCoverSource = e.target.value === 'mine' ? 'mine' : 'public';
      _persistLandingCoverSourcePref();
    });
  });

  // Landing bg context menu
  const _landingCtxMenu = document.getElementById('landing-ctx-menu');
  function _showLandingCtxMenu(x, y) {
    if (!_landingCtxMenu) return;
    document.getElementById('landing-ctx-toggle-btn').textContent = coversState._landingBgHidden ? t('bg.show_background') : t('bg.hide_background');
    _landingCtxMenu.style.display = 'block';
    const mw = _landingCtxMenu.offsetWidth, mh = _landingCtxMenu.offsetHeight;
    _landingCtxMenu.style.left = `${Math.min(x, window.innerWidth  - mw - 8)}px`;
    _landingCtxMenu.style.top  = `${Math.min(y, window.innerHeight - mh - 8)}px`;
  }
  function _hideLandingCtxMenu() { if (_landingCtxMenu) _landingCtxMenu.style.display = 'none'; }
  document.getElementById('landing-wrapper')?.addEventListener('contextmenu', e => {
    if (!getToken() || isDemoMode) return;
    if (e.target.closest('button, a, input, textarea, select, label, .cover-thumb, .feed-entry, .feed-user-group, .feed-pinned-card, .feed-day-card, #app-banner, #covers-panel, #feed-panel, #books-xp-summary, .books-container')) return;
    e.preventDefault();
    _showLandingCtxMenu(e.clientX, e.clientY);
  });
  document.getElementById('landing-ctx-toggle-btn')?.addEventListener('click', () => {
    coversState._landingBgHidden = !coversState._landingBgHidden;
    _persistLandingBgHiddenPref();
    _hideLandingCtxMenu();
  });
  document.addEventListener('click', e => {
    if (_landingCtxMenu && !_landingCtxMenu.contains(e.target)) _hideLandingCtxMenu();
  });

  // Landing bg drag handlers
  const _landingWrapper = document.getElementById('landing-wrapper');
  _landingWrapper?.addEventListener('mousedown', e => {
    if (!_canDragLandingBg()) return;
    if (e.target.closest('button, a, input, textarea, select, label, .cover-thumb, .feed-entry, .feed-user-group, .feed-pinned-card, .feed-day-card, #app-banner')) return;
    coversState._landingBgDragging = true;
    coversState._landingBgDragDirty = false;
    e.preventDefault();
  });
  window.addEventListener('mousemove', e => {
    if (!coversState._landingBgDragging || !_canDragLandingBg()) return;
    coversState._landingBgPosY = Math.max(0, Math.min(100, coversState._landingBgPosY - e.movementY * 0.12));
    coversState._landingBgDragDirty = true;
    _applyLandingBgPosition();
  });
  window.addEventListener('mouseup', () => {
    if (coversState._landingBgDragging && coversState._landingBgDragDirty) _persistLandingCoverPos();
    coversState._landingBgDragging = false;
    coversState._landingBgDragDirty = false;
  });
  _updateLandingBgDragUi();

}
