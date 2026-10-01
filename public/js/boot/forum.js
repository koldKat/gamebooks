import { bootState } from './state.js';
import { getToken } from '../state.js';
import { render } from '../play.js';
import { closePublicModal } from '../public-profile.js';
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
    // Clicking a link inside the iframe navigates its contentWindow but never
    // touches the <iframe> element's own src attribute - so comparing against
    // getAttribute('src') always saw the original '/forum' and skipped
    // re-navigating, leaving the modal reopen wherever a PREVIOUS user last
    // clicked to (e.g. a category or thread), not the forum home. Reset via
    // contentWindow.location, which reflects where the iframe actually is.
    //
    // Reveal only once that reset navigation has actually finished loading -
    // adding 'active' immediately left whatever the iframe was still
    // rendering (the previous thread/category) visible for a brief moment
    // until the new page replaced it, flickering before snapping to the
    // forum home. See _cancelForumReveal (module scope, top of file) for
    // why this must be cancelable from every close path, not just this one.
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
      // Keep the forum open underneath instead of closing it - closing would
      // mean reopening resets the iframe to /forum home (openForumModal's
      // default), losing whatever thread the link was clicked from. #pub-
      // overlay normally sits at z-index 300, well below the forum's 3000,
      // so it'd render invisibly behind it - bump it above the forum just
      // for this case; closePublicModal() resets it back to the CSS default.
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
