import { bootState } from './state.js';
import { state, apiFetch } from '../core/state.js';
import { t } from '../i18n.js';
import { initStats, closeStatsModal } from '../stats.js';
import { _closeAddBook, _closeAddComp, _closeAddSeries } from '../books/add-book.js';
import { closeEditBookModal, _closeEditStash, _closeAddStash } from '../edit-book.js';
import { closePublicModal } from '../account/public-profile.js';
import { _toggleCoverTooltipSettings } from '../covers.js';
import { _closeNotifDropdown, _openNotifDropdown, isNotifDropdownOpen } from '../community/notif.js';

export function initDialogBindings(openForumModal) {
  document.addEventListener('click', e => {
    if (isNotifDropdownOpen() && !e.target.closest('#notif-dropdown') && !e.target.closest('#notif-btn'))
      _closeNotifDropdown();
  });

  // Capture non-bubbling scroll events and close the fixed dropdown unless its own list scrolled.
  document.addEventListener('scroll', e => {
    if (isNotifDropdownOpen() && e.target !== document.getElementById('notif-dropdown'))
      _closeNotifDropdown();
  }, { capture: true });

  // ── Forum ─────────────────────────────────────────────────────────
  document.getElementById('forum-btn').addEventListener('click', () => {
    document.getElementById('forum-btn').classList.remove('forum-btn--active');
    openForumModal('/forum');
  });

  // ── Stats for nerds ─────────────────────────���─────────────────────
  initStats();

  document.getElementById('notif-btn').addEventListener('click', async (e) => {
    e.stopPropagation();
    if (isNotifDropdownOpen()) { _closeNotifDropdown(); return; }
    const btn = document.getElementById('notif-btn');
    let data = btn._notifData;
    if (!data) {
      try {
        const res = await apiFetch('/api/notifications');
        if (!res.ok) return;
        data = await res.json();
      } catch { return; }
    }
    _openNotifDropdown(btn, data);
  });

  document.getElementById('display-settings-btn').addEventListener('click', () => {
    _toggleCoverTooltipSettings();
  });

  // Track modal visibility centrally for history only when it overlays a mobile panel.
  let _dialogHistoryPushed = false;
  new MutationObserver(() => {
    const isActive = document.getElementById('public-modal-overlay').classList.contains('active');
    const panelOpen = document.body.classList.contains('mobile-books-open') ||
                       document.body.classList.contains('mobile-addbook-open');
    if (isActive && panelOpen && !_dialogHistoryPushed && !history.state?.dialogOpen) {
      _dialogHistoryPushed = true;
      history.pushState({ ...history.state, dialogOpen: true }, '');
    } else if (!isActive && _dialogHistoryPushed) {
      _dialogHistoryPushed = false;
      // Consume dialog history entries on explicit dismissal to avoid stale Back states.
      if (history.state?.dialogOpen) history.back();
    }
  }).observe(document.getElementById('public-modal-overlay'), { attributes: true, attributeFilter: ['class'] });
  window.addEventListener('popstate', e => {
    if (!e.state?.dialogOpen && document.getElementById('public-modal-overlay').classList.contains('active')) {
      _dialogHistoryPushed = false;
      closePublicModal();
    }
  });
  document.getElementById('pub-close-btn').addEventListener('click', closePublicModal);
  document.getElementById('public-modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('public-modal-overlay') && bootState._mousedownOnOverlay === e.currentTarget) closePublicModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.getElementById('public-modal-overlay').classList.contains('active')) closePublicModal();
    if (e.key === 'Escape' && document.getElementById('stats-modal-overlay').classList.contains('active')) closeStatsModal();
    if (e.key === 'Escape' && document.getElementById('edit-comp-overlay').classList.contains('active')) document.getElementById('edit-comp-overlay').classList.remove('active');
    if (e.key === 'Escape' && document.getElementById('edit-series-overlay').classList.contains('active')) document.getElementById('edit-series-overlay').classList.remove('active');
    if (e.key === 'Escape' && document.getElementById('add-comp-overlay').classList.contains('active')) _closeAddComp();
    if (e.key === 'Escape' && document.getElementById('add-series-overlay').classList.contains('active')) _closeAddSeries();
    if (e.key === 'Escape' && document.getElementById('edit-book-modal-overlay').classList.contains('active')) closeEditBookModal();
    if (e.key === 'Escape' && document.getElementById('add-book-overlay').classList.contains('active')) _closeAddBook();
    if (e.key === 'Escape' && document.getElementById('add-stash-overlay').classList.contains('active')) _closeAddStash();
    if (e.key === 'Escape' && document.getElementById('edit-stash-overlay').classList.contains('active')) _closeEditStash();
    if (e.key === 'Escape' && document.getElementById('feedback-modal-overlay').classList.contains('active')) document.getElementById('feedback-modal-overlay').classList.remove('active');
    if (e.key === 'Escape' && document.getElementById('inbox-modal-overlay').classList.contains('active')) document.getElementById('inbox-modal-overlay').classList.remove('active');
  });

  // ── Scroll-to-top buttons ─────────────────────────────────────────
  {
    const SCROLL_THRESHOLD = 200;
    const scrollPanels = [
      { el: document.getElementById('covers-panel'),    btn: document.getElementById('covers-scroll-top') },
      { el: document.getElementById('landing-wrapper'), btn: document.getElementById('center-scroll-top') },
      { el: document.getElementById('landing-right'),   btn: document.getElementById('right-scroll-top') },
    ];
    window._syncScrollTopBtns = () => {
      const onLanding = document.getElementById('landing-wrapper')?.style.display !== 'none';
      for (const { el, btn } of scrollPanels) {
        if (!el || !btn) continue;
        btn.classList.toggle('visible', onLanding && el.scrollTop > SCROLL_THRESHOLD);
      }
    };
    for (const { el, btn } of scrollPanels) {
      if (!el || !btn) continue;
      el.addEventListener('scroll', window._syncScrollTopBtns, { passive: true });
      btn.addEventListener('click', () => el.scrollTo({ top: 0, behavior: 'smooth' }));
    }
  }

}
