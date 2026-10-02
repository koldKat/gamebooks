import { bootState } from './state.js';
import { setToken } from '../core/state.js';
import { setTranslationOverride } from '../i18n.js';
import { _setLandingPanelCollapsed, _toggleAllLandingPanelsCollapsed, _setPlayPanelCollapsed, _toggleAllPlayPanelsCollapsed } from '../prefs.js';
import { _toggleCoverTooltipSettings, initCoversPanel, _refillLazyIfShort } from '../covers.js';
import { _setupCtxSubmenuFlip } from '../play/bg.js';
import { setAdminUsername } from '../account/user.js';
import { fetchPublic as publicFetch } from '../core/util.js';
import { _toggleShortcutsModal } from './helpers.js';
import { _openMobilePanel } from './navigation.js';

export function initShell() {

  _setupCtxSubmenuFlip();

  // Impersonation handoff - consume ?_imp=<token> from URL, store in localStorage
  const _impParam = new URLSearchParams(location.search).get('_imp');
  if (_impParam) {
    setToken(_impParam);
    history.replaceState({}, '', '/');
  }

  // Footer copyright year - auto-extends to a range once the year rolls over
  const _footerStartYear = 2026;
  const _footerYear = new Date().getFullYear();
  document.getElementById('app-footer-copy').textContent =
    _footerYear > _footerStartYear ? `© ${_footerStartYear}-${_footerYear}` : `© ${_footerStartYear}`;

  // Load app version + admin username from server
  publicFetch('/api/config').then(r => r.ok ? r.json() : null).then(cfg => {
    if (cfg?.version)       document.getElementById('app-version').textContent = cfg.version;
    if (cfg?.adminUsername) setAdminUsername(cfg.adminUsername);
  }).catch(() => {});

  // Panel collapse toggles - persist state across refreshes
  if (localStorage.getItem('covers-collapsed') === '1') {
    document.body.classList.add('covers-collapsed');
    document.getElementById('covers-toggle').textContent = '›';
  }
  if (localStorage.getItem('right-collapsed') === '1') {
    document.body.classList.add('right-collapsed');
    document.getElementById('right-toggle').textContent = '‹';
  }
  localStorage.removeItem('feed-collapsed');
  document.body.classList.remove('feed-collapsed');
  document.getElementById('feed-toggle').textContent = '▴';
  if (localStorage.getItem('sidebar-collapsed') === '1') {
    document.body.classList.add('sidebar-collapsed');
    document.getElementById('sidebar-toggle').textContent = '›';
  }
  document.getElementById('covers-toggle').addEventListener('click', () => {
    _setLandingPanelCollapsed('covers-collapsed', !document.body.classList.contains('covers-collapsed'));
  });
  document.getElementById('right-toggle').addEventListener('click', () => {
    _setLandingPanelCollapsed('right-collapsed', !document.body.classList.contains('right-collapsed'));
  });
  document.getElementById('feed-toggle').addEventListener('click', () => {
    _setLandingPanelCollapsed('feed-collapsed', !document.body.classList.contains('feed-collapsed'));
  });
  document.getElementById('sidebar-toggle').addEventListener('click', () => {
    _setPlayPanelCollapsed('sidebar-collapsed', !document.body.classList.contains('sidebar-collapsed'));
  });
  // Mobile only (see mobile.css) - on desktop, "My Books" already sits in
  // #landing-right next to the feed, so there's nothing to open/close here.
  // Wire once: duplicate panel listeners would push multiple history entries
  // for one tap, requiring multiple back gestures to close the panel.
  if (!bootState._mobilePanelWired) {
    bootState._mobilePanelWired = true;
    window.addEventListener('popstate', e => {
      if (!e.state?.mobilePanel) document.body.classList.remove('mobile-books-open', 'mobile-addbook-open');
    });
    document.getElementById('mobile-books-btn').addEventListener('click', () => _openMobilePanel('books'));
    document.getElementById('mobile-books-close-btn').addEventListener('click', () => history.back());
    // Same idea as My Books above - #covers-panel is the search/browse-and-
    // add panel, permanently hidden on mobile otherwise (mobile.css).
    // Toggled full screen instead of the fixed-left-column layout it has on
    // desktop.
    document.getElementById('mobile-addbook-btn').addEventListener('click', () => {
      _openMobilePanel('addbook');
      // The panel's own lazy-fill loop measured a zero height while it was
      // hidden and stopped after one small batch - top it up now that it
      // actually has room, once the reveal's layout has been committed.
      requestAnimationFrame(() => requestAnimationFrame(_refillLazyIfShort));
    });
    document.getElementById('mobile-addbook-close-btn').addEventListener('click', () => history.back());
  }
  initCoversPanel();
  document.getElementById('shortcuts-modal-close')?.addEventListener('click', () => _toggleShortcutsModal(false));
  document.getElementById('shortcuts-modal-overlay')?.addEventListener('mousedown', e => { bootState._mousedownOnOverlay = e.target === e.currentTarget ? e.target : null; });
  document.getElementById('shortcuts-modal-overlay')?.addEventListener('click', e => {
    if (e.target === e.currentTarget && bootState._mousedownOnOverlay === e.target) _toggleShortcutsModal(false);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'F1') {
      e.preventDefault();
      _toggleShortcutsModal();
      return;
    }
    if (e.key === 'Escape' && document.getElementById('shortcuts-modal-overlay')?.classList.contains('active')) {
      _toggleShortcutsModal(false);
      return;
    }
    if (e.key === 'Escape' && document.getElementById('cover-tooltip-settings-overlay')?.classList.contains('active')) {
      _toggleCoverTooltipSettings(false);
      return;
    }
    if (e.ctrlKey && !e.shiftKey && !e.altKey && (e.code === 'KeyY' || String(e.key || '').toLowerCase() === 'y')) {
      if (document.getElementById('main-screen')?.style.display !== 'none') return;
      e.preventDefault();
      _toggleCoverTooltipSettings();
      return;
    }
    const panelToggleModifier = (e.ctrlKey || e.metaKey) && !(e.ctrlKey && e.metaKey);
    if (!(panelToggleModifier && !e.shiftKey && !e.altKey && (e.code === 'KeyX' || String(e.key || '').toLowerCase() === 'x'))) return;
    const tag = e.target?.tagName || '';
    const targetEl = e.target instanceof HTMLElement ? e.target : null;
    const targetVisible = !!(targetEl && targetEl.offsetParent !== null);
    if (targetVisible && (targetEl?.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT')) return;
    e.preventDefault();
    if (document.getElementById('main-screen')?.style.display !== 'none') _toggleAllPlayPanelsCollapsed();
    else _toggleAllLandingPanelsCollapsed();
  });


  // Global +/- button handler for number inputs using data-target
  document.addEventListener('click', e => {
    const btn = e.target.closest('.cs-num-btn[data-target]');
    if (!btn) return;
    const inp = document.getElementById(btn.dataset.target);
    if (!inp) return;
    const min = inp.min !== '' ? Number(inp.min) : -Infinity;
    const max = inp.max !== '' ? Number(inp.max) :  Infinity;
    inp.value = Math.max(min, Math.min(max, (Number(inp.value) || 0) + Number(btn.dataset.delta)));
    inp.dispatchEvent(new Event('input'));
  });

  publicFetch('/api/tagline').then(r => r.json()).then(({ tagline }) => {
    if (!tagline) return;
    setTranslationOverride('app.tagline', tagline);
    document.getElementById('app-banner-sub').textContent = tagline;
    document.querySelectorAll('[data-i18n="app.tagline"]').forEach(el => { el.textContent = tagline; });
  }).catch(() => {});

}
