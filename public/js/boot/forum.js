import { bootState } from './state.js';
import { getToken } from '../core/state.js';
import { render } from '../play.js';
import { closePublicModal } from '../account/public-profile.js';
import { openCoverActivity, openSeriesActivity } from '../covers.js';
import { _cancelForumReveal } from './helpers.js';
import { showBooks } from './screens.js';

export function initGuideAndForum() {
  // ── User guide modal ─────────────────────────────────────────────
  const guideBtn     = document.getElementById('guide-btn');
  const guideOverlay = document.getElementById('guide-modal-overlay');
  const guideClose   = document.getElementById('guide-modal-close');
  guideBtn.addEventListener('click', () => guideOverlay.classList.add('active'));
  guideClose.addEventListener('click', () => guideOverlay.classList.remove('active'));
  guideOverlay.addEventListener('click', e => { if (e.target === guideOverlay && bootState._mousedownOnOverlay === e.target) guideOverlay.classList.remove('active'); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && guideOverlay.classList.contains('active')) guideOverlay.classList.remove('active');
  });

  // ── Forum modal ──────────────────────────────────────────────────
  const forumOverlay = document.getElementById('forum-modal-overlay');
  const forumClose = document.getElementById('forum-modal-close');
  const forumFrame = document.getElementById('forum-modal-frame');
  const closeForumModal = () => {
    forumOverlay.classList.remove('active');
    _cancelForumReveal();
  };
  const openForumModal = (url = '/forum') => {
    // Reset using the iframe's actual location, not its unchanged src attribute.
    // Reveal after load, with cancellation on every close path.
    _cancelForumReveal();
    const reveal = () => { forumOverlay.classList.add('active'); bootState._forumRevealPending = null; forumFrame.removeEventListener('load', reveal); };
    bootState._forumRevealPending = reveal;
    forumFrame.addEventListener('load', reveal);
    try { forumFrame.contentWindow.location.replace(url); }
    catch (_) { forumFrame.setAttribute('src', url); }
  };
  forumClose?.addEventListener('click', closeForumModal);
  forumOverlay?.addEventListener('click', e => {
    if (e.target === forumOverlay && bootState._mousedownOnOverlay === e.currentTarget) closeForumModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && forumOverlay.classList.contains('active')) closeForumModal();
  });
  window.addEventListener('message', async e => {
    if (e.origin !== location.origin) return;
    if (e.data?.type === 'gamebooks-open-book' && e.data.bookId) {
      // Keep the forum underneath detail dialogs; temporarily raise the dialog's z-index.
      document.getElementById('public-modal-overlay').style.zIndex = '3001';
      await openCoverActivity(+e.data.bookId, '');
      return;
    }
    if (e.data?.type === 'gamebooks-open-series' && e.data.seriesId) {
      // Same forum-stays-open-underneath treatment as gamebooks-open-book above.
      document.getElementById('public-modal-overlay').style.zIndex = '3001';
      await openSeriesActivity(+e.data.seriesId, '');
      return;
    }
    if (e.data?.type !== 'gamebooks-open-app') return;
    closeForumModal();
    if (getToken() && document.getElementById('books-screen').style.display === 'none') {
      await showBooks();
    }
  });

  return openForumModal;
}
