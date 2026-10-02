import { _setCoverFavoritesFromPrefs, _coverTooltipTitlePercent } from './filters.js';
import { _effectiveLandingCoverSource, _landingCoverPool, _resetLandingCoverQueue, _rotateLandingCover, _startLandingCoverRotation, _stopLandingCoverRotation } from './background.js';
import { coversState } from './state.js';
import { getToken, isDemoMode } from '../core/state.js';
import { t } from '../i18n.js';

// ── Cover settings ─────────────────────────────────────────────────────────────
export function _applyCoverTooltipTitlePrefs() {
  document.body.classList.toggle('cover-tooltip-title-bold', !!coversState._coverTooltipTitleBold);
  document.documentElement.style.setProperty('--cover-preview-title-size', `${(0.84 * coversState._coverTooltipTitlePct / 100).toFixed(4)}rem`);
  const sizeVal = document.getElementById('cover-tooltip-size-value');
  const boldCb = document.getElementById('cover-tooltip-bold-cb');
  const cyrillicCb = document.getElementById('cover-tooltip-hide-cyrillic-cb');
  if (sizeVal) sizeVal.textContent = `${_coverTooltipTitlePercent()}%`;
  if (boldCb) boldCb.checked = !!coversState._coverTooltipTitleBold;
  if (cyrillicCb) cyrillicCb.checked = !!coversState._hideCyrillicCovers;
}

export function _persistCoverTooltipPrefs() {
  localStorage.setItem('cover-tooltip-title-pct', String(coversState._coverTooltipTitlePct));
  localStorage.setItem('cover-tooltip-title-bold', coversState._coverTooltipTitleBold ? '1' : '0');
  localStorage.setItem('hide-cyrillic-covers', coversState._hideCyrillicCovers ? '1' : '0');
  _applyCoverTooltipTitlePrefs();
  if (getToken() && !isDemoMode) {
    coversState._hooks.savePrefs?.({
      coverTooltipTitlePct: String(coversState._coverTooltipTitlePct),
      coverTooltipTitleBold: coversState._coverTooltipTitleBold ? '1' : '0',
      hideCyrillicCovers: coversState._hideCyrillicCovers ? '1' : '0',
    });
  }
}

export function _applyReduceMotionPref() {
  document.body.classList.toggle('reduce-motion', !!coversState._reduceMotion);
  const cb = document.getElementById('reduce-motion-cb');
  if (cb) cb.checked = !!coversState._reduceMotion;
}

export function _persistReduceMotionPref() {
  localStorage.setItem('reduce-motion', coversState._reduceMotion ? '1' : '0');
  _applyReduceMotionPref();
  if (getToken() && !isDemoMode) {
    coversState._hooks.savePrefs?.({ reduceMotion: coversState._reduceMotion ? '1' : '0' });
  }
}

export function _applyFeedDayCoversPref() {
  document.body.classList.toggle('no-feed-day-covers', !coversState._feedDayCovers);
  const cb = document.getElementById('feed-day-covers-cb');
  if (cb) cb.checked = !!coversState._feedDayCovers;
}

export function _persistFeedDayCoversPref() {
  localStorage.setItem('feed-day-covers', coversState._feedDayCovers ? '1' : '0');
  _applyFeedDayCoversPref();
  // Repopulate cover stacks when re-enabling covers; hidden stacks were never loaded.
  coversState._hooks.refreshDayCovers?.();
  if (getToken() && !isDemoMode) {
    coversState._hooks.savePrefs?.({ feedDayCovers: coversState._feedDayCovers ? '1' : '0' });
  }
}

export function _applyFeedGlassCardsPref() {
  document.body.classList.toggle('no-feed-glass-cards', !coversState._feedGlassCards);
  const cb = document.getElementById('feed-glass-cards-cb');
  if (cb) cb.checked = !!coversState._feedGlassCards;
}

export function _persistFeedGlassCardsPref() {
  localStorage.setItem('feed-glass-cards', coversState._feedGlassCards ? '1' : '0');
  _applyFeedGlassCardsPref();
  if (getToken() && !isDemoMode) {
    coversState._hooks.savePrefs?.({ feedGlassCards: coversState._feedGlassCards ? '1' : '0' });
  }
}

// Showing the background must not clear existing layer opacity; only ensure rotation is running.
export function _applyLandingBgHiddenPref() {
  if (coversState._landingBgHidden) {
    ['a', 'b'].forEach(l => {
      const el = document.getElementById(`landing-bg-${l}`);
      if (el) el.style.opacity = '0';
    });
    _stopLandingCoverRotation();
  } else if (_landingCoverPool().length) {
    _startLandingCoverRotation();
  }
  const btn = document.getElementById('landing-ctx-toggle-btn');
  if (btn) btn.textContent = coversState._landingBgHidden ? t('bg.show_background') : t('bg.hide_background');
}

export function _persistLandingBgHiddenPref() {
  _applyLandingBgHiddenPref();
  if (getToken() && !isDemoMode) coversState._hooks.savePrefs?.({ landingBgHidden: coversState._landingBgHidden ? '1' : '0' });
}

export function _applyLandingCoverSourcePrefs() {
  localStorage.setItem('landing-cover-source', coversState._landingCoverSource);
  const publicRadio = document.getElementById('cover-rotation-source-public');
  const mineRadio = document.getElementById('cover-rotation-source-mine');
  const preview = document.getElementById('cover-rotation-settings-preview');
  const effective = _effectiveLandingCoverSource();
  if (publicRadio) publicRadio.checked = coversState._landingCoverSource === 'public';
  if (mineRadio) {
    mineRadio.checked = coversState._landingCoverSource === 'mine';
    mineRadio.disabled = !getToken() || isDemoMode;
  }
  if (preview) preview.textContent = effective === 'mine' ? t('covers.my_books_covers') : t('covers.all_public_covers');
}

export function _persistLandingCoverSourcePref() {
  _applyLandingCoverSourcePrefs();
  if (getToken() && !isDemoMode) coversState._hooks.savePrefs?.({ landingCoverSource: coversState._landingCoverSource });
  // Apply source changes immediately, without waiting for the rotation timer.
  _resetLandingCoverQueue();
  _startLandingCoverRotation();
  _rotateLandingCover();
}

export function _toggleCoverTooltipSettings(open) {
  const overlay = document.getElementById('cover-tooltip-settings-overlay');
  if (!overlay) return;
  const shouldOpen = open ?? !overlay.classList.contains('active');
  if (shouldOpen) {
    _applyLandingCoverSourcePrefs();
  }
  overlay.classList.toggle('active', shouldOpen);
}

// Restore guest cover/glass defaults instead of inheriting the previous account's preferences.
export function resetFeedDisplayPrefsForLogout() {
  coversState._feedDayCovers = true;
  coversState._feedGlassCards = true;
  localStorage.setItem('feed-day-covers', '1');
  localStorage.setItem('feed-glass-cards', '1');
  _applyFeedDayCoversPref();
  _applyFeedGlassCardsPref();
  coversState._hooks.refreshDayCovers?.();
}

// ── Prefs state setter (called from applyPrefs in main.js) ────────────────────
export function setCoversPrefsState(p) {
  _setCoverFavoritesFromPrefs(p);
  if (p.landingCoverPos && typeof p.landingCoverPos === 'object' && !Array.isArray(p.landingCoverPos)) {
    coversState._landingCoverPosPrefs = p.landingCoverPos;
  }
  if ('coverTooltipTitlePct' in p) {
    coversState._coverTooltipTitlePct = Math.max(100, Math.min(148, parseInt(p.coverTooltipTitlePct || '100', 10) || 100));
    localStorage.setItem('cover-tooltip-title-pct', String(coversState._coverTooltipTitlePct));
  }
  if ('coverTooltipTitleBold' in p) {
    coversState._coverTooltipTitleBold = p.coverTooltipTitleBold === '1';
    localStorage.setItem('cover-tooltip-title-bold', coversState._coverTooltipTitleBold ? '1' : '0');
  }
  if ('hideCyrillicCovers' in p) {
    coversState._hideCyrillicCovers = p.hideCyrillicCovers === '1';
    localStorage.setItem('hide-cyrillic-covers', coversState._hideCyrillicCovers ? '1' : '0');
  }
  if ('landingCoverSource' in p) {
    coversState._landingCoverSource = p.landingCoverSource === 'mine' ? 'mine' : 'public';
    localStorage.setItem('landing-cover-source', coversState._landingCoverSource);
  }
  if ('reduceMotion' in p) {
    coversState._reduceMotion = p.reduceMotion === '1';
    localStorage.setItem('reduce-motion', coversState._reduceMotion ? '1' : '0');
    _applyReduceMotionPref();
  }
  if ('feedDayCovers' in p) {
    coversState._feedDayCovers = p.feedDayCovers !== '0';
    localStorage.setItem('feed-day-covers', coversState._feedDayCovers ? '1' : '0');
    _applyFeedDayCoversPref();
  }
  if ('feedGlassCards' in p) {
    coversState._feedGlassCards = p.feedGlassCards !== '0';
    localStorage.setItem('feed-glass-cards', coversState._feedGlassCards ? '1' : '0');
    _applyFeedGlassCardsPref();
  }
  coversState._landingBgHidden = p.landingBgHidden === '1';
  _applyLandingBgHiddenPref();
  _applyCoverTooltipTitlePrefs();
  _applyLandingCoverSourcePrefs();
}

// ── DOM event wiring (called once from DOMContentLoaded) ──────────────────────
