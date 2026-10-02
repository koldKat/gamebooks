import { bootState } from './state.js';
import { state, loadState, getToken, currentBookId } from '../state.js';
import { render } from '../play.js';
import { openPublicProfile } from '../account/public-profile.js';
import { openCoverActivity, openSeriesActivity } from '../covers.js';
import { startDemoMode, wasInDemoMode } from '../demo.js';
import { navigateToBook, showLogin, showBooks } from './screens.js';

export async function initRouting() {
  // ── Browser back/forward ──────────────────────────────────────────
  window.addEventListener('popstate', async e => {
    bootState._suppressHistory = true;
    try {
      const s = e.state;
      if (s?.view === 'book') await navigateToBook(s.bookId);
      else if (getToken())    await showBooks();
      // A guest who dismissed the login overlay to browse the feed has no
      // in-app view to return to - landing them on showLogin() here turns
      // every back navigation (e.g. closing a book dialog) into a jarring
      // jump back to the login screen.
      else if (!document.body.classList.contains('guest-browsing')) showLogin();
    } finally {
      bootState._suppressHistory = false;
    }
  });

  // bfcache restoration: browser may skip popstate and replay a frozen snapshot;
  // if we're on the graph screen, force a fresh state reload so sections/graph are current.
  window.addEventListener('pageshow', async e => {
    if (!e.persisted) return;
    const bid = currentBookId;
    if (bid && getToken()) {
      await loadState(bid);
      render();
    }
  });

  // ── Initial route ───────────────────────────────────────���─────────
  const _bookPageMatch      = location.pathname.match(/^\/book\/(\d+)$/);
  const _anthologyPageMatch = location.pathname.match(/^\/anthology\/(\d+)$/);
  const _seriesPageMatch    = location.pathname.match(/^\/series\/(\d+)$/);
  const _userPageMatch      = location.pathname.match(/^\/user\/([^/]+)$/);
  if ((location.pathname === '/demo' || wasInDemoMode()) && !getToken()) {
    if (location.pathname === '/demo') history.replaceState({}, '', '/');
    await startDemoMode();
  } else if (getToken()) {
    const m = location.hash.match(/^#book\/(.+)$/);
    if (m) {
      document.getElementById('landing-wrapper').style.display = 'none';
      window._syncScrollTopBtns?.();
      await navigateToBook(/^\d+$/.test(m[1]) ? +m[1] : m[1]);
    } else {
      await showBooks(); // handles #home, #books, or no hash
    }
  } else {
    showLogin();
  }
  if (_bookPageMatch) {
    openCoverActivity(+_bookPageMatch[1], '');
  }
  if (_anthologyPageMatch) {
    openCoverActivity(+_anthologyPageMatch[1], '');
  }
  if (_seriesPageMatch) {
    openSeriesActivity(+_seriesPageMatch[1], '');
  }
  if (_userPageMatch) {
    openPublicProfile(decodeURIComponent(_userPageMatch[1]));
  }

}
