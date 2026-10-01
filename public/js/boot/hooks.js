import { bootState } from './state.js';
import { state, apiFetch, currentBookId, setBonusUndos, setBonusFastTravels, mappedCountFor, discoveredSectionsFor } from '../state.js';
import { t } from '../i18n.js';
import { initNotes, setOnXpAwarded as setNotesOnXpAwarded } from '../notes.js';
import { initParty, loadPartyInvites, setPartyHooks } from '../party.js';
import { initAuth, setOnAuthSuccess } from '../auth.js';
import { setAddBookHooks, initAddBook } from '../add-book.js';
import { setEditBookHooks, initEditBook, openEditBookModal, openEditCompModal, openEditSeriesModal, _openEditStash, _adminPdfHref, maxSectionInUse } from '../edit-book.js';
import { setPrefsHooks, savePrefs, syncPrefs } from '../prefs.js';
import { initShop, refreshCoinsDisplay, setShopHooks } from '../shop.js';
import { initProfile, setProfileHooks } from '../profile.js';
import { setPublicProfileHooks, openPublicSeriesRun } from '../public-profile.js';
import { setLiveTabHooks } from '../livetab.js';
import { setAppXpHooks, refreshAppXp, handleAppXpEvent } from '../app-xp.js';
import { setCoversHooks, loadCovers, _refreshPublicCatalogIfVisible, _isLandingBooksViewVisible } from '../covers.js';
import { setBooksHooks, initBooksPanel, getCachedBooks, getCachedAllSeries, _refreshBooksListOnly, _syncPdfBadgeOnCards, _starsHtml, _starLabelHtml, _flashRatingGate } from '../books.js';
import { setOpenWorldHooks } from '../open-world.js';
import { setFeedHooks, loadFeed, refreshDayCoverFlows } from '../feed.js';
import { setNotifHooks, _scheduleLiveUiRefresh } from '../notif.js';
import { _processRewardSnapshot, _scheduleRewardProfileRefresh } from '../rewards.js';
import { setBgHooks, setCurrentBookCover } from '../bg.js';
import { initTips } from '../tips.js';
import { initInbox } from '../inbox.js';
import { initDice } from '../dice.js';
import { exportAll } from '../export.js';
import { initFeedback } from '../feedback.js';
import { setDemoHooks, getDemoBooks, setDemoBooks, startDemoMode, exitDemoMode } from '../demo.js';
import { resolveIsAdmin, adminBadge, adminBadgeForUsername, authorBadge, contributorBadge, displayFor, registerAuthor, registerContributor } from '../user.js';
import { escapeHtml, fetchPublic as publicFetch } from '../util.js';
import { _toggleShortcutsModal } from './helpers.js';
import { navigateToBook, showLogin, showBooks, showMain, _lockView, _updateUsernameTooltip } from './screens.js';

export function initFeatureHooks() {
  // ── Shop ─────────────────────────────────────────────────────────
  setShopHooks({
    onRewardSnapshot:      _processRewardSnapshot,
    onSetBonusUndos:       setBonusUndos,
    onSetBonusFastTravels: setBonusFastTravels,
    getMousedownOverlay:   () => bootState._mousedownOnOverlay,
  });
  initShop();

  // ── Notebook modal + notes display overlay ───────────────────────
  setNotesOnXpAwarded(refreshCoinsDisplay);
  initNotes();

  // ── Play Together (party) ─────────────────────────────────────────
  setPartyHooks({
    getCurrentUserId: () => bootState._currentUserId,
    scheduleRewardProfileRefresh: _scheduleRewardProfileRefresh,
    refreshBooksListOnly: _refreshBooksListOnly,
  });
  initParty();

  // ── Auth (login/register/forgot/reset) ────────────────────────────
  setOnAuthSuccess(showBooks);

  window.addEventListener('auth-expired', showLogin);
  window.addEventListener('maintenance-mode', () => location.reload(), { once: true });

  // ── Tips bar ──────────────────────────────────────────────────────
  initTips();

  // ── Demo ─────────────────────────────────────────────────────────
  setDemoHooks({ showBooks, showLogin });
  document.getElementById('demo-btn').addEventListener('click', startDemoMode);
  document.getElementById('demo-exit-btn').addEventListener('click', exitDemoMode);

  document.getElementById('app-banner-f1-btn').addEventListener('click', () => _toggleShortcutsModal());

  // ── Login screen ─────────────────────────────────────────────────
  initAuth();
  // Guests browse the public feed/covers only - My Books stays hidden
  // (see the guest-browsing rules in mobile.css), Add Book stays visible
  // as the catalog promo. Dismissing the login overlay reveals the feed
  // underneath; guest-browsing marks the state so the popstate router
  // below doesn't yank them back to login.
  document.getElementById('mobile-guest-btn').addEventListener('click', () => {
    document.body.classList.remove('mobile-auth');
    document.body.classList.add('guest-browsing');
  });
  // The only way back to the login screen once the overlay is dismissed -
  // there is deliberately no history entry to go back to (the overlay was
  // reached via replaceState, not pushState).
  document.getElementById('mobile-login-btn').addEventListener('click', () => showLogin());

  // ── Profile modal ─────────────────────────────────────────────────
  setProfileHooks({
    onRewardSnapshot:      _processRewardSnapshot,
    onSaveSuccess:         data => {
      registerAuthor(data.username, !!data.isAuthor, data.displayName);
      registerContributor(data.username, !!data.isContributor);
      const dn = data.displayName || data.username;
      document.getElementById('books-username').innerHTML = escapeHtml(dn || '') + adminBadge(bootState._isAdmin) + authorBadge(data.username) + contributorBadge(data.username);
      _updateUsernameTooltip();
    },
    getMousedownOverlay:   () => bootState._mousedownOnOverlay,
  });
  initProfile();
  setPublicProfileHooks({
    publicFetch,
    adminBadge: adminBadgeForUsername,
    authorBadge,
    contributorBadge,
    displayFor,
    onRegisterAuthor:      registerAuthor,
    onRegisterContributor: registerContributor,
  });
  setCoversHooks({
    savePrefs,
    getCachedBooks,
    getCachedAllSeries,
    starsHtml:           _starsHtml,
    starLabelHtml:       _starLabelHtml,
    flashRatingGate:     _flashRatingGate,
    showBooks,
    getIsAdmin:          () => bootState._isAdmin,
    refreshBooksListOnly: _refreshBooksListOnly,
    openEditBookModal,
    openEditCompModal,
    lockView:            _lockView,
    navigateToBook,
    displayFor,
    adminBadge: adminBadgeForUsername,
    authorBadge,
    contributorBadge,
    onFavoriteToggled:   () => _scheduleRewardProfileRefresh(250),
    refreshDayCovers:    refreshDayCoverFlows,
  });
  setFeedHooks({
    publicFetch,
    scheduleRewardProfileRefresh: _scheduleRewardProfileRefresh,
    displayFor,
    adminBadge: adminBadgeForUsername,
    authorBadge,
    contributorBadge,
    registerAuthor:    registerAuthor,
    registerContributor: registerContributor,
    starsHtml:         _starsHtml,
  });
  setNotifHooks({
    refreshCoinsDisplay,
    loadPartyInvites,
    syncPrefs,
  });
  setBgHooks({
    clearCtxNodeId: () => { bootState.ctxNodeId = null; },
  });
  // The only trigger for idle_heartbeat XP (and the bonus-coin roll it can
  // fire) - called solely from livetab.js's dedicated 60s leader-tab timer,
  // deliberately not tied to feed reloads. The response reports what the
  // heartbeat actually did; on any award (XP, playtime coins, or a rolled
  // bonus coin) schedule a reward-profile refresh so the coins display, coin
  // button and XP bar catch up without waiting for a feed reload - overnight
  // the feed version fingerprint can stay unchanged for hours while heartbeats
  // keep accruing, and this is the only per-minute UI touchpoint left.
  const _sendHeartbeat = () => {
    apiFetch('/api/heartbeat', { method: 'POST' })
      .then(async res => {
        if (!res?.ok) return;
        const data = await res.json().catch(() => null);
        if (data?.awarded || data?.coinRolled) _scheduleRewardProfileRefresh(150);
      })
      .catch(() => {});
  };

  setLiveTabHooks({
    loadFeed:                    loadFeed,
    loadCovers:                  (opts) => loadCovers(opts),
    isLandingVisible:            _isLandingBooksViewVisible,
    refreshPublicCatalogIfVisible: _refreshPublicCatalogIfVisible,
    refreshBooksListOnly:        _refreshBooksListOnly,
    scheduleLiveUiRefresh:       _scheduleLiveUiRefresh,
    processRewardSnapshot:       _processRewardSnapshot,
    refreshAppXp:                refreshAppXp,
    getIsAdmin:                  () => bootState._isAdmin,
    onAppXpEvent:                handleAppXpEvent,
    sendHeartbeat:                _sendHeartbeat,
    scheduleRewardProfileRefresh: _scheduleRewardProfileRefresh,
  });
  setAppXpHooks({
    getIsAdmin: () => bootState._isAdmin,
    getCanSeeAppXp: () => bootState._canSeeAppXp,
  });
  document.getElementById('download-backup-btn').addEventListener('click', exportAll);

  setBooksHooks({
    savePrefs,
    showMain,
    showBooks,
    loadFeed,
    openEditBookModal,
    openEditCompModal,
    openEditSeriesModal,
    openEditStash:                (id)   => _openEditStash(id),
    scheduleRewardProfileRefresh: _scheduleRewardProfileRefresh,
    getIsAdmin:                   () => bootState._isAdmin,
    getDemoBooks,
    setDemoBooks,
    maxSectionInUse,
    mappedCountFor,
    discoveredSectionsFor,
  });
  setOpenWorldHooks({
    showMain,
    getCurrentUserId:         () => bootState._currentUserId,
    getCurrentBookSeriesId:   () => bootState._currentBook.seriesId,
    openPublicSeriesRun,
  });
  setPrefsHooks({ refreshDayCovers: refreshDayCoverFlows });
  setEditBookHooks({
    resolveIsAdmin:      () => resolveIsAdmin(),
    setCurrentBookCover,
    scheduleRewardProfileRefresh: _scheduleRewardProfileRefresh,
    // Fired by the edit modals after a successful PDF upload/remove - patches
    // just that book's card(s) in place (badge + data attributes) instead of
    // re-rendering the whole list, and keeps the play area in sync when the
    // affected book is the open one (showMain is otherwise the only place the
    // sidebar PDF button gets wired, so it stayed stale until re-open).
    onPdfChanged:        (bookId, pdfPath, pdfSize) => {
      _syncPdfBadgeOnCards(bookId, pdfPath, pdfSize);
      if (String(bookId) !== String(currentBookId)) return;
      bootState._currentBook.pdfPath = pdfPath;
      const pdfDlBtn = document.getElementById('pdf-download-btn');
      if (!pdfDlBtn) return;
      const showPdfBtn = bootState._hasPdfAccess && !!pdfPath && !bootState._currentBook.parentBookId;
      pdfDlBtn.style.display = showPdfBtn ? '' : 'none';
      if (showPdfBtn) pdfDlBtn.href = _adminPdfHref(pdfPath);
    },
  });
  initEditBook(() => bootState._mousedownOnOverlay);
  setAddBookHooks({ resolveIsAdmin: () => resolveIsAdmin(), scheduleRewardProfileRefresh: _scheduleRewardProfileRefresh });
  initAddBook(() => bootState._mousedownOnOverlay);
  initBooksPanel();
  initInbox(() => bootState._mousedownOnOverlay);
  initDice();
  initFeedback();

}
