// boot.js - application entry point: screen switching, hook wiring, and init (v37)

import {
  state, viewingPt, setViewingPt, resetState,
  saveState, resetBookProgress, loadState, parseSecId, isValidSecId,
  getToken, setToken, clearToken, getUsername, setUsername, clearUsername,
  apiFetch, currentBookId, setCurrentBookId, setCurrentUserLevel,
  setBonusUndos, setBonusFastTravels,
  currentPlaythrough, currentSection,
  isDemoMode,
  setOnViewingPtChange,
  mappedCountFor, discoveredSectionsFor,
} from './state.js';
import {
  network, visNodes, initGraph, destroyNetwork,
  subtreeToDelete, deleteNodes, findPathTo, canReach, setGraphOpenWorld, applyConnectorStyle,
  enforceSnapZoomFloor,
} from './graph.js';
import { render, openEditModal, closeEditModal, openNoteModal, closeNoteModal, showConfirm, showAlert, confirmAlphanumericSwitch, maxFastTravels, setFastTravelHandler, showFastTravelDialog, setOnTrailToggle, openPortalModal, setDiscoverableLimit, setOnChoicesRecorded, startPlaythrough, setAltStartHandler, setAfterRenderFn, wouldAutoNav } from './play.js';
import { t, applyTranslations, setTranslationOverride } from './i18n.js';
import { initCharSheet, setCharSheetVisible, renderCharSheetDisplay } from './charsheet.js';
import { initInventory, setInventoryVisible, renderInventoryDisplay, preloadItems, setExtraDisplayItemsProvider } from './inventory.js';
import { initEquipment, setEquipmentVisible, getVisibleEquippedItems } from './equipment.js';
import { initNotes, hideNotesUI, loadNotesForBook, setOnXpAwarded as setNotesOnXpAwarded } from './notes.js';
import { initParty, connectPartySSE, disconnectPartySSE, loadPartyInvites, setPartyHooks } from './party.js';
import { initAuth, setOnAuthSuccess, showAuthForm, showResetPanel, hasPendingResetToken } from './auth.js';
import { initStats, closeStatsModal } from './stats.js';
import { setAddBookHooks, initAddBook, _closeAddBook, _closeAddComp, _closeAddSeries } from './add-book.js';
import {
  setEditBookHooks, initEditBook,
  openEditBookModal, closeEditBookModal, openEditCompModal, openEditSeriesModal,
  _openEditStash, _closeEditStash, _closeAddStash,
  _adminPdfHref,
  maxSectionInUse,
} from './edit-book.js';
import {
  setPrefsHooks, savePrefs, syncPrefs,
  _setLandingPanelCollapsed, _toggleAllLandingPanelsCollapsed,
  _setPlayPanelCollapsed, _toggleAllPlayPanelsCollapsed,
} from './prefs.js';
import { initBattleSim, setBattleSimVisible, renderBattleSim } from './battlesim/battlesim829.js';
import { initBattleSim8, setSim8Visible, renderSim8 } from './battlesim/battlesim8.js';
import { initSim286, setSim286Visible, renderSim286 } from './battlesim/battlesim286.js';
import { initSim198, setSim198Visible, renderSim198 } from './battlesim/battlesim198.js';
import { initSim199, setSim199Visible, renderSim199 } from './battlesim/battlesim199.js';
import { initSim200, setSim200Visible, renderSim200 } from './battlesim/battlesim200.js';
import { initSim186, setSim186Visible, renderSim186 } from './battlesim/battlesim186.js';
import { initSim201, setSim201Visible, renderSim201 } from './battlesim/battlesim201.js';
import { initSim202, setSim202Visible, renderSim202 } from './battlesim/battlesim202.js';
import { initSim203, setSim203Visible, renderSim203 } from './battlesim/battlesim203.js';
import { initSim83, setSim83Visible, renderSim83 } from './battlesim/battlesim83.js';
import { initSim86, setSim86Visible, renderSim86 } from './battlesim/battlesim86.js';
import { initSim114, setSim114Visible, renderSim114 } from './battlesim/battlesim114.js';
import { initSim115, setSim115Visible, renderSim115 } from './battlesim/battlesim115.js';
import { initSim123, setSim123Visible, renderSim123 } from './battlesim/battlesim123.js';
import { initSim130, setSim130Visible, renderSim130 } from './battlesim/battlesim130.js';
import { initSim92, setSim92Visible, renderSim92 } from './battlesim/battlesim92.js';
import { initSim108, setSim108Visible, renderSim108 } from './battlesim/battlesim108.js';
import { initSim216, setSim216Visible, renderSim216 } from './battlesim/battlesim216.js';
import { initSim193, setSim193Visible, renderSim193 } from './battlesim/battlesim193.js';
import { initSim217, setSim217Visible, renderSim217 } from './battlesim/battlesim217.js';
import { initSim227, setSim227Visible, renderSim227 } from './battlesim/battlesim227.js';
import { initSim526, setSim526Visible, renderSim526 } from './battlesim/battlesim526.js';
import { initSim324, setSim324Visible, renderSim324 } from './battlesim/battlesim324.js';
import { initSim325, setSim325Visible, renderSim325 } from './battlesim/battlesim325.js';
import { initSim122, setSim122Visible, renderSim122 } from './battlesim/battlesim122.js';
import { initSim80, setSim80Visible, renderSim80 } from './battlesim/battlesim80.js';
import { initSim82, setSim82Visible, renderSim82 } from './battlesim/battlesim82.js';
import { initSim118, setSim118Visible, renderSim118 } from './battlesim/battlesim118.js';
import { initSim218, setSim218Visible, renderSim218 } from './battlesim/battlesim218.js';
import { initSim219, setSim219Visible, renderSim219 } from './battlesim/battlesim219.js';
import { initSim220, setSim220Visible, renderSim220 } from './battlesim/battlesim220.js';
import { initSim223, setSim223Visible, renderSim223 } from './battlesim/battlesim223.js';
import { initSim221, setSim221Visible, renderSim221 } from './battlesim/battlesim221.js';
import { initSim222, setSim222Visible, renderSim222 } from './battlesim/battlesim222.js';
import { initSim224, setSim224Visible, renderSim224 } from './battlesim/battlesim224.js';
import { initSim370, setSim370Visible, renderSim370 } from './battlesim/battlesim370.js';
import { initSim375, setSim375Visible, renderSim375 } from './battlesim/battlesim375.js';
import { initSim376, setSim376Visible, renderSim376 } from './battlesim/battlesim376.js';
import { initSim377, setSim377Visible, renderSim377 } from './battlesim/battlesim377.js';
import { initSim378, setSim378Visible, renderSim378 } from './battlesim/battlesim378.js';
import { initSim78, setSim78Visible, renderSim78 } from './battlesim/battlesim78.js';
import { initSim107, setSim107Visible, renderSim107 } from './battlesim/battlesim107.js';
import { initSim135, setSim135Visible, renderSim135 } from './battlesim/battlesim135.js';
import { initSim317, setSim317Visible, renderSim317 } from './battlesim/battlesim317.js';
import { initSim318, setSim318Visible, renderSim318 } from './battlesim/battlesim318.js';
import { initSim319, setSim319Visible, renderSim319 } from './battlesim/battlesim319.js';
import { initSim320, setSim320Visible, renderSim320 } from './battlesim/battlesim320.js';
import { initSim397, setSim397Visible, renderSim397 } from './battlesim/battlesim397.js';
import { initSim321, setSim321Visible, renderSim321 } from './battlesim/battlesim321.js';
import { initSim398, setSim398Visible, renderSim398 } from './battlesim/battlesim398.js';
import { initSim399, setSim399Visible, renderSim399 } from './battlesim/battlesim399.js';
import { initSim414, setSim414Visible, renderSim414 } from './battlesim/battlesim414.js';
import { initSim415, setSim415Visible, renderSim415 } from './battlesim/battlesim415.js';
import { initSim416, setSim416Visible, renderSim416 } from './battlesim/battlesim416.js';
import { initSim225, setSim225Visible, renderSim225 } from './battlesim/battlesim225.js';
import { initSim226, setSim226Visible, renderSim226 } from './battlesim/battlesim226.js';
import { initSim430, setSim430Visible, renderSim430 } from './battlesim/battlesim430.js';
import { initSim431, setSim431Visible, renderSim431 } from './battlesim/battlesim431.js';
import { initSim432, setSim432Visible, renderSim432 } from './battlesim/battlesim432.js';
import { initSim228, setSim228Visible, renderSim228 } from './battlesim/battlesim228.js';
import { initSim229, setSim229Visible, renderSim229 } from './battlesim/battlesim229.js';
import { initSim230, setSim230Visible, renderSim230 } from './battlesim/battlesim230.js';
import { initSim323, setSim323Visible, renderSim323 } from './battlesim/battlesim323.js';
import { initSim322, setSim322Visible, renderSim322 } from './battlesim/battlesim322.js';
import { initSim204, setSim204Visible, renderSim204 } from './battlesim/battlesim204.js';
import { initSim205, setSim205Visible, renderSim205 } from './battlesim/battlesim205.js';
import { initSim206, setSim206Visible, renderSim206 } from './battlesim/battlesim206.js';
import { initSim207, setSim207Visible, renderSim207 } from './battlesim/battlesim207.js';
import { initSim208, setSim208Visible, renderSim208 } from './battlesim/battlesim208.js';
import { initSim209, setSim209Visible, renderSim209 } from './battlesim/battlesim209.js';
import { initSim210, setSim210Visible, renderSim210 } from './battlesim/battlesim210.js';
import { initSim211, setSim211Visible, renderSim211 } from './battlesim/battlesim211.js';
import { initSim212, setSim212Visible, renderSim212 } from './battlesim/battlesim212.js';
import { initSim213, setSim213Visible, renderSim213 } from './battlesim/battlesim213.js';
import { initSim214, setSim214Visible, renderSim214 } from './battlesim/battlesim214.js';
import { initSim215, setSim215Visible, renderSim215 } from './battlesim/battlesim215.js';
import { initLiveRead, setLiveReadVisible, renderLiveRead, previewSection } from './liveread.js';
import { initShop, updateCoinsDisplay, refreshCoinsDisplay, setShopHooks } from './shop.js';
import { initProfile, updateAvatarUI, renderBooksXpSummary, setProfileHooks } from './profile.js';
import { setPublicProfileHooks, closePublicModal, openPublicProfile, openPublicSeriesRun } from './public-profile.js';
import { setLiveTabHooks, _ensureLiveTabControllerStarted, _connectUserBadgeSSE, _disconnectUserBadgeSSE, _connectAppXpSSE, _disconnectAppXpSSE } from './livetab.js';
import { setAppXpHooks, refreshAppXp, handleAppXpEvent } from './app-xp.js';
import { setCoversHooks, loadCovers, openCoverActivity, openSeriesActivity, _showCachedCoversPanel, _refreshPublicCatalogIfVisible, _isLandingBooksViewVisible, _updateLandingBgDragUi, setCoversPrefsState, _toggleCoverTooltipSettings, initCoversPanel, resetFeedDisplayPrefsForLogout, _refillLazyIfShort, _stopLandingCoverRotation } from './covers.js';
import {
  setBooksHooks, initBooksPanel, renderBooksList,
  getCachedBooks, getCachedAllSeries, getCachedStashes,
  setCachedBooks, setCachedAllSeries, clearBooksCache,
  setBooksDataFresh, setBooksRevealedAt,
  setCurrentUserId,
  _refreshBooksListOnly, _refreshLibraryUi, _starsHtml, _starLabelHtml, _flashRatingGate,
} from './books.js';
import {
  setOpenWorldHooks, setupOpenWorldForBook,
  _syncSeriesRuns, _computeCrossBookReachability, _focusNodeAfterLoad,
  clearOpenWorldState, doJumpCrossBook,
  getOwSrcBookId, getOwSrcSection, getOwCrossBookRoute,
} from './open-world.js';
import { setFeedHooks, loadFeed, refreshDayCoverFlows } from './feed.js';
import {
  setNotifHooks, _scheduleLiveUiRefresh,
  _closeNotifDropdown, _openNotifDropdown, isNotifDropdownOpen,
  resetNotifBadgesForLogout,
} from './notif.js';
import {
  _resetRewardSnapshotState, _positionRewardLayer,
  _processRewardSnapshot, _scheduleRewardProfileRefresh,
} from './rewards.js';
import {
  setBgHooks, setCurrentBookCover, getCurrentBookCover,
  resetBgState, cancelBgMove, isBgInMove,
  toggleBgHidden, nudgeBgPosY,
  hideCtxMenu, _updateSidebarBookInfo, _hideBgCtxMenu,
  _positionMenu, _setupCtxSubmenuFlip, _showBgCtxMenu,
  _enterBgMoveMode, _exitBgMoveMode, _updateColorSwatches,
} from './bg.js';
import { initTips } from './tips.js';
import { initInbox } from './inbox.js';
import { initDice } from './dice.js';
import { initTooltip } from './tooltip.js';
import { exportAll, exportBook } from './export.js';
import { initFeedback } from './feedback.js';
import { setDemoHooks, getDemoBooks, setDemoBooks, getDemoVisited, startDemoMode, exitDemoMode, wasInDemoMode } from './demo.js';
import {
  setAdminUsername, resolveIsAdmin,
  adminBadge, adminBadgeForUsername, authorBadge, contributorBadge, displayFor,
  registerAuthor, registerContributor,
} from './user.js';
import { escapeHtml, fetchPublic as publicFetch } from './util.js';

window._isMobile = /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  || (navigator.maxTouchPoints > 1 && window.innerWidth < 1024);

// Same .feed-loading-graph/.flg-* animated graph icon used by the activity
// feed and live-reading - shared here since showMain() below needs it twice
// (once for #graph-container, once for the #sidebar overlay).
function _loadingGraphSvg() {
  return `<svg class="feed-loading-graph" viewBox="0 0 32 32">
    <line x1="16" y1="16" x2="6"  y2="7"  stroke="#4b5563" stroke-width="1.8" stroke-linecap="round"/>
    <line x1="16" y1="16" x2="26" y2="7"  stroke="#4b5563" stroke-width="1.8" stroke-linecap="round"/>
    <line x1="16" y1="16" x2="6"  y2="26" stroke="#4b5563" stroke-width="1.8" stroke-linecap="round"/>
    <line x1="16" y1="16" x2="26" y2="26" stroke="#4b5563" stroke-width="1.8" stroke-linecap="round"/>
    <circle class="flg-node flg-n1" cx="6"  cy="7"  r="4" fill="#8e44ad" stroke="#6c3483" stroke-width="1.2"/>
    <circle class="flg-node flg-n2" cx="26" cy="7"  r="4" fill="#e74c3c" stroke="#c0392b" stroke-width="1.2"/>
    <circle class="flg-node flg-n3" cx="6"  cy="26" r="4" fill="#3498db" stroke="#2980b9" stroke-width="1.2"/>
    <circle class="flg-node flg-n4" cx="26" cy="26" r="4" fill="#27ae60" stroke="#1e8449" stroke-width="1.2"/>
    <circle class="flg-center" cx="16" cy="16" r="6" fill="#f5a623" stroke="#c47d00" stroke-width="1.5"/>
  </svg>`;
}


// ── Edit book modal ───────────────────────────────────────��───────────────────

let _isAdmin               = false;
// Separate from _isAdmin on purpose - a narrow, one-off exception letting
// user id 17 (sashii, as of when this was added) see the app-wide XP/
// avg-level bars (app-xp.js) without granting him any of the other
// admin-only capabilities _isAdmin gates (edit permissions, admin ctx-menu
// overrides, etc.). Matched by id, not username - see server/db/auth.js's
// canSeeAppXp() for why (usernames are user-editable) - and must mirror that
// server-side check exactly, or the widgets fetch data he can't actually see.
const APP_XP_EXTRA_USER_ID = 17;
let _canSeeAppXp           = false;
let _hasPdfAccess          = false;
// Refresh #inv-display, merging visible inventory slots with any equipped
// items the player has marked "show on screen".
async function _refreshInvDisplay() {
  await preloadItems();
  const extra = await getVisibleEquippedItems();
  renderInventoryDisplay(extra);
}


// ── Utilities ─────────────────────────────────────────────────────────────────

// ── Browser history routing ───────────────────────────────��───────────────────

let _suppressHistory = false;

function _pushNav(hash, stateObj) {
  if (_suppressHistory) return;
  const full = '#' + hash;
  if (location.hash === full) history.replaceState(stateObj, '', full);
  else history.pushState(stateObj, '', full);
}

// Pending reveal listener from an in-flight forum-modal reset navigation
// (see openForumModal in the DOMContentLoaded handler below). Closing the
// forum via ANY path - Escape, the close button, or navigating away
// entirely (navigateToBook/showBooks, further down) - must cancel it, or a
// 'load' event that fires after the close still reopens the modal on its
// own moments later, well after the user already dismissed/left it.
let _forumRevealPending = null;
function _cancelForumReveal() {
  if (!_forumRevealPending) return;
  document.getElementById('forum-modal-frame')?.removeEventListener('load', _forumRevealPending);
  _forumRevealPending = null;
}

// Navigate to a book by ID, fetching metadata from cache or server.
async function navigateToBook(bookId) {
  // A book's detail dialog can now stay open on top of the forum (see the
  // gamebooks-open-book handler below) instead of closing it - but actually
  // navigating into the book's play view is a real navigation away from the
  // dialog/forum entirely, not just "show a modal on top." If the forum is
  // still open (z-index 3000) it would otherwise sit over the newly-shown
  // play screen (no special z-index of its own), leaving it looking stuck.
  document.getElementById('forum-modal-overlay')?.classList.remove('active');
  _cancelForumReveal();
  _ensureLiveTabControllerStarted();
  const numId = /^\d+$/.test(String(bookId)) ? +bookId : bookId;
  let book = getCachedBooks()?.find(b => b.id === numId || b.id === bookId);
  if (!book) {
    try {
      const needProfile = _currentUserId === null;
      const [booksRes, profileRes, seriesRes] = await Promise.all([
        apiFetch('/api/books'),
        needProfile ? apiFetch('/api/profile') : Promise.resolve(null),
        apiFetch('/api/series'),
      ]);
      const books = await booksRes.json();
      setCachedBooks(books);
      const seriesData = seriesRes.ok ? await seriesRes.json() : [];
      if (Array.isArray(seriesData)) setCachedAllSeries(seriesData);
      if (profileRes) {
        const profile = await profileRes.json();
        _processRewardSnapshot(profile);
        if (profile.id) { _currentUserId = profile.id; setCurrentUserId(_currentUserId); }
        _isAdmin = resolveIsAdmin(profile);
        _canSeeAppXp = _isAdmin || profile.id === APP_XP_EXTRA_USER_ID;
        _hasPdfAccess = !!profile.pdfAccess || _isAdmin;
        refreshAppXp();
        _connectAppXpSSE();
        if (profile.username) {
          setUsername(profile.username);
          registerAuthor(profile.username, !!profile.isAuthor, profile.displayName);
          registerContributor(profile.username, !!profile.isContributor);
        }
        setBonusUndos(profile.bonusUndos || 0);
        setBonusFastTravels(profile.bonusFastTravels || 0);
        setCurrentUserLevel(profile.level || 0);
        updateCoinsDisplay(profile.coinsBalance || 0);
        updateAvatarUI(profile.avatarUrl || null);
      }
      book = books.find(b => b.id === numId || b.id === bookId);
    } catch {}
  }
  if (book) {
    const id = /^\d+$/.test(String(book.id)) ? +book.id : book.id;
    const isCreator = book.created_by === null || book.created_by === _currentUserId;
    const ownCover = book.cover_path ? `/covers/${book.cover_path}` : null;
    const parentCover = (!ownCover && book.parent_book_id)
      ? (() => {
          const parent = getCachedBooks()?.find(b => b.id === book.parent_book_id && b.cover_path);
          return parent?.cover_path ? `/covers/${parent.cover_path}` : null;
        })()
      : null;
    await showMain(id,
      book.isbn   || null, book.issn   || null, book.asin || null,
      ownCover || parentCover || null,
      book.pdf_path || null,
      book.pages  || null, book.authors || null, book.description || null,
      book.discoverable_sections ?? null, !!book.is_public, isCreator,
      book.series_name || null, book.series_number || null,
      !!book.is_container, book.parent_book_id ?? null, book.book_order ?? null);
  } else {
    await showBooks();
  }
}

// ── Context menu ──────────────────────────────────────────────────────────────

let ctxNodeId             = null;
// Canvas-space (graph) coordinates of the last empty-canvas right-click, used
// by the "+ Add node" flow to place the new node exactly where the user
// clicked. Only meaningful right after a real empty-canvas right-click; not
// cleared afterward since it's only ever read immediately from the "+ Add
// node" button's own click handler, matching ctxNodeId's own lifecycle.
let ctxCanvasPos          = null;
// currentBookCover lives in bg.js
let _currentBook = {
  isbn: null, issn: null, asin: null, pdfPath: null, pages: null,
  authors: null, description: null, discoverableSections: null,
  isPublic: false, seriesName: null, seriesNumber: null,
  isContainer: false, parentBookId: null, bookOrder: null,
  seriesId: null, isOpenWorld: false,
};

// ── Background + context menus (see bg.js) ────────────────────────────────────


let _currentUserId = null;
let _viewLockTarget = null;
let _viewLockUntil = 0;

function _lockView(target, ms = 0) {
  _viewLockTarget = target || null;
  _viewLockUntil = ms > 0 ? Date.now() + ms : 0;
}

function _isViewLocked(target) {
  return _viewLockTarget === target && Date.now() < _viewLockUntil;
}


// ── Screen switching ──────────────────────────────────────────────────────────

function setDiceRollerVisible(v) {
  document.getElementById('dice-roller').classList.toggle('visible', v);
}

function setGuideVisible(v) {
  document.getElementById('play-bottom-stack').style.display = v ? 'flex' : 'none';
  if (!v) {
    document.getElementById('guide-modal-overlay').classList.remove('active');
    hideNotesUI();
  }
}

function _isMobile() { return window.innerWidth <= 768; }

function _syncFeedTogglePos() {
  const toggle = document.getElementById('feed-toggle');
  if (!toggle) return;
  const panelW   = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--landing-panel-w')) || 270;
  const leftPad  = document.body.classList.contains('covers-collapsed') ? 0 : panelW;
  const rightPad = document.body.classList.contains('right-collapsed')  ? 0 : panelW;
  toggle.style.left = (leftPad + (window.innerWidth - leftPad - rightPad) / 2) + 'px';
}

function _revealLanding() {
  ['landing-wrapper','landing-bg-a','landing-bg-b','landing-bg-dim'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.visibility = '';
  });
  _syncFeedTogglePos();
}

function showLogin() {
  _revealLanding();
  _ensureLiveTabControllerStarted();
  _disconnectUserBadgeSSE();
  _disconnectAppXpSSE();
  _resetRewardSnapshotState();
  resetNotifBadgesForLogout();
  const _demoBtn = document.getElementById('demo-btn');
  if (_demoBtn) _demoBtn.style.display = '';
  setCharSheetVisible(false);
  setInventoryVisible(false);
  setEquipmentVisible(false);
  setBattleSimVisible(false);
  setSim8Visible(false);
  setSim286Visible(false);
  setSim198Visible(false);
  setSim199Visible(false);
  setSim200Visible(false);
  setSim186Visible(false);
  setSim201Visible(false);
  setSim202Visible(false);
  setSim203Visible(false);
  setSim83Visible(false);
  setSim86Visible(false);
  setSim114Visible(false);
  setSim115Visible(false);
  setSim123Visible(false);
  setSim130Visible(false);
  setSim92Visible(false);
  setSim108Visible(false);
  setSim216Visible(false);
  setSim193Visible(false);
  setSim217Visible(false);
  setSim227Visible(false);
  setSim526Visible(false);
  setSim322Visible(false);
  setSim323Visible(false);
  setSim324Visible(false);
  setSim325Visible(false);
  setSim122Visible(false);
  setSim80Visible(false);
  setSim82Visible(false);
  setSim118Visible(false);
  setSim218Visible(false);
  setSim219Visible(false);
  setSim220Visible(false);
  setSim223Visible(false);
  setSim221Visible(false);
  setSim222Visible(false);
  setSim224Visible(false);
  setSim370Visible(false);
  setSim375Visible(false);
  setSim376Visible(false);
  setSim377Visible(false);
  setSim378Visible(false);
  setSim78Visible(false);
  setSim107Visible(false);
  setSim135Visible(false);
  setSim317Visible(false);
  setSim318Visible(false);
  setSim319Visible(false);
  setSim320Visible(false);
  setSim397Visible(false);
  setSim321Visible(false);
  setSim398Visible(false);
  setSim399Visible(false);
  setSim414Visible(false);
  setSim415Visible(false);
  setSim416Visible(false);
  setSim225Visible(false);
  setSim226Visible(false);
  setSim430Visible(false);
  setSim431Visible(false);
  setSim432Visible(false);
  setSim228Visible(false);
  setSim229Visible(false);
  setSim230Visible(false);
  setSim204Visible(false);
  setSim205Visible(false);
  setSim206Visible(false);
  setSim207Visible(false);
  setSim208Visible(false);
  setSim209Visible(false);
  setSim210Visible(false);
  setSim211Visible(false);
  setSim212Visible(false);
  setSim213Visible(false);
  setSim214Visible(false);
  setSim215Visible(false);
  setLiveReadVisible(false);
  setDiceRollerVisible(false);
  setGuideVisible(false);
  if (_isMobile()) document.body.classList.add('mobile-auth');
  document.body.classList.add('promo-active');
  const _pvi = document.getElementById('login-promo-video-iframe');
  if (_pvi && !_pvi.src) _pvi.src = _pvi.dataset.src;
  history.replaceState({ view: 'login' }, '', location.pathname + location.search);
  document.getElementById('landing-wrapper').style.display = 'flex';
  document.getElementById('main-screen').style.display     = 'none';
  document.getElementById('login-screen').style.display    = 'flex';
  document.getElementById('books-screen').style.display    = 'none';
  document.getElementById('feed-toggle').style.display     = _isMobile() ? 'none' : '';
  document.getElementById('right-toggle').classList.add('visible');
  document.getElementById('sidebar-toggle').classList.remove('visible');
  document.getElementById('feedback-btn').style.display    = '';
  document.getElementById('inbox-btn').style.display       = 'none';
  document.getElementById('notif-btn').style.display       = 'none';
  document.getElementById('login-error').textContent    = '';
  document.getElementById('login-username').value       = '';
  document.getElementById('login-password').value       = '';
  document.getElementById('register-password-confirm').value = '';
  document.getElementById('register-password-confirm').style.display = 'none';
  document.getElementById('register-email').value       = '';
  document.getElementById('register-email').style.display = 'none';
  document.getElementById('register-email-hint').style.display = 'none';
  const _regBtn = document.getElementById('register-btn');
  _regBtn.textContent = t('auth.register');
  _regBtn.classList.remove('auth-confirm-btn', 'primary-btn');
  _regBtn.classList.add('auth-alt-btn');
  document.getElementById('login-btn').style.display = '';
  if (hasPendingResetToken()) {
    showResetPanel();
  } else {
    showAuthForm();
    document.getElementById('login-username').focus();
  }
  loadFeed();
  _showCachedCoversPanel();
  loadCovers();
  _updateLandingBgDragUi();
}

// ── Notifications (see notif.js) ──────────────────────────────────────────────


function _updateUsernameTooltip() {
  const el = document.getElementById('books-username');
  if (!el) return;
  if (el.scrollWidth > el.clientWidth) {
    el.dataset.tooltip = el.textContent.trim();
  } else {
    delete el.dataset.tooltip;
  }
}


// ─────────────────────────────────────────────────────────────────────────────

// Mobile My Books/Add Book full-screen panels - see the _mobilePanelWired
// guard inside showBooks() for why this (and its wiring) run exactly once
// rather than on every showBooks() call. Opening a panel pushes a history
// entry so the phone's real back gesture closes it first instead of
// exiting the app; switching directly from one panel to the other replaces
// that entry instead of stacking a second one, so back from Add Book
// (opened while My Books was already up) goes straight to closed, not back
// to My Books.
let _mobilePanelWired = false;
function _openMobilePanel(name) {
  const alreadyOpen = document.body.classList.contains('mobile-books-open') ||
                      document.body.classList.contains('mobile-addbook-open');
  document.body.classList.remove('mobile-books-open', 'mobile-addbook-open');
  document.body.classList.add(`mobile-${name}-open`);
  history[alreadyOpen ? 'replaceState' : 'pushState']({ mobilePanel: name }, '');
}

async function showBooks() {
  if (_isViewLocked('book')) return;
  // Reachable from deep inside the public book/series detail dialog (e.g.
  // "Add series to library"), which can now stay open on top of the forum
  // instead of closing it - a freshly-shown books screen should never have
  // an unrelated forum modal still sitting over it regardless of how this
  // got called, so close it unconditionally here rather than patching every
  // individual call site that might reach this with the forum still open.
  document.getElementById('forum-modal-overlay')?.classList.remove('active');
  _cancelForumReveal();
  _revealLanding();
  _ensureLiveTabControllerStarted();
  const _prefsReady = syncPrefs();
  if (document.activeElement instanceof HTMLElement && document.activeElement.closest('#login-screen')) {
    document.activeElement.blur();
  }
  setCharSheetVisible(false);
  setInventoryVisible(false);
  setEquipmentVisible(false);
  setBattleSimVisible(false);
  setSim8Visible(false);
  setSim286Visible(false);
  setSim198Visible(false);
  setSim199Visible(false);
  setSim200Visible(false);
  setSim186Visible(false);
  setSim201Visible(false);
  setSim202Visible(false);
  setSim203Visible(false);
  setSim83Visible(false);
  setSim86Visible(false);
  setSim114Visible(false);
  setSim115Visible(false);
  setSim123Visible(false);
  setSim130Visible(false);
  setSim92Visible(false);
  setSim108Visible(false);
  setSim216Visible(false);
  setSim193Visible(false);
  setSim217Visible(false);
  setSim227Visible(false);
  setSim526Visible(false);
  setSim322Visible(false);
  setSim323Visible(false);
  setSim324Visible(false);
  setSim325Visible(false);
  setSim122Visible(false);
  setSim80Visible(false);
  setSim82Visible(false);
  setSim118Visible(false);
  setSim218Visible(false);
  setSim219Visible(false);
  setSim220Visible(false);
  setSim223Visible(false);
  setSim221Visible(false);
  setSim222Visible(false);
  setSim224Visible(false);
  setSim370Visible(false);
  setSim375Visible(false);
  setSim376Visible(false);
  setSim377Visible(false);
  setSim378Visible(false);
  setSim78Visible(false);
  setSim107Visible(false);
  setSim135Visible(false);
  setSim317Visible(false);
  setSim318Visible(false);
  setSim319Visible(false);
  setSim320Visible(false);
  setSim397Visible(false);
  setSim321Visible(false);
  setSim398Visible(false);
  setSim399Visible(false);
  setSim414Visible(false);
  setSim415Visible(false);
  setSim416Visible(false);
  setSim225Visible(false);
  setSim226Visible(false);
  setSim430Visible(false);
  setSim431Visible(false);
  setSim432Visible(false);
  setSim228Visible(false);
  setSim229Visible(false);
  setSim230Visible(false);
  setSim204Visible(false);
  setSim205Visible(false);
  setSim206Visible(false);
  setSim207Visible(false);
  setSim208Visible(false);
  setSim209Visible(false);
  setSim210Visible(false);
  setSim211Visible(false);
  setSim212Visible(false);
  setSim213Visible(false);
  setSim214Visible(false);
  setSim215Visible(false);
  setLiveReadVisible(false);
  setDiceRollerVisible(false);
  setGuideVisible(false);
  document.body.classList.remove('mobile-auth');
  document.body.classList.remove('promo-active');
  const _pvi = document.getElementById('login-promo-video-iframe');
  if (_pvi) _pvi.src = '';
  document.getElementById('landing-wrapper').style.display = 'flex';
  document.getElementById('main-screen').style.display     = 'none';
  document.getElementById('legend').style.display          = 'none';
  document.getElementById('login-screen').style.display    = 'none';
  document.getElementById('books-screen').style.display    = 'flex';
  window._syncScrollTopBtns?.();
  setBooksRevealedAt(Date.now());
  setDiscoverableLimit(null);
  document.getElementById('feed-toggle').style.display     = _isMobile() ? 'none' : '';
  _positionRewardLayer();
  document.getElementById('right-toggle').classList.add('visible');
  document.getElementById('sidebar-toggle').classList.remove('visible');
  document.getElementById('books-username').innerHTML = escapeHtml(getUsername() || '') + adminBadge(_isAdmin);
  _updateUsernameTooltip();
  document.getElementById('feedback-btn').style.display = '';
  document.getElementById('forum-btn').style.display    = '';
  document.getElementById('inbox-btn').style.display    = getToken() ? '' : 'none';
  document.getElementById('notif-btn').style.display    = getToken() ? '' : 'none';
  // Guests and demo-mode visitors see it; every logged-in account already
  // has the demo book in their own library regardless of how new it is, so
  // there's nothing this button offers them that they don't already have.
  // Explicitly hidden in the else branch, not left alone - this used to
  // only ever set it visible, never hide it, on the theory that it starts
  // hidden in index.html and nothing else could have shown it first. That
  // was wrong: a login timing race (this running before getToken() reflects
  // the just-completed login) could show it here, and with no explicit
  // hide anywhere it then stayed visible for the rest of the session even
  // once the user was fully logged in.
  document.getElementById('demo-btn').style.display = (!getToken() || isDemoMode) ? '' : 'none';
  _pushNav('home', { view: 'books' });
  if (getToken()) { _scheduleLiveUiRefresh({ inbox: true, notif: true, forum: true, reward: true, party: true }, 40); }
  _connectUserBadgeSSE();

  destroyNetwork();
  setViewingPt(null);
  setCurrentBookId(null);
  cancelBgMove();
  const _ms = document.getElementById('main-screen');
  if (_ms) { _ms.style.backgroundImage = ''; _ms.style.backgroundColor = '#0f172a'; }

  loadFeed();
  _showCachedCoversPanel();
  loadCovers();
  _updateLandingBgDragUi();
  try { disconnectPartySSE(); } catch (_) {}
  if (getToken() && !isDemoMode) { _scheduleLiveUiRefresh({ party: true }, 60); }

  if (isDemoMode) {
    setBooksDataFresh(true);
    document.getElementById('books-username').textContent = t('auth.demo_username');
    renderBooksXpSummary(null);
    updateAvatarUI(null);
    renderBooksList(getDemoBooks().map(b => ({ ...b, visited: getDemoVisited(b.id) })), [], []);
    return;
  }

  // Render immediately to avoid blank/stale flash
  if (getCachedBooks()) {
    // Re-render with current prefs maps so the screen shows correct collapsed state immediately
    renderBooksList(getCachedBooks(), getCachedAllSeries() ?? [], getCachedStashes() ?? []);
  } else {
    // No in-memory cache - fall back to localStorage so the list isn't blank
    try {
      const cb = JSON.parse(localStorage.getItem('books_list_v1')  || 'null');
      const cs = JSON.parse(localStorage.getItem('series_list_v1') || 'null');
      const ct = JSON.parse(localStorage.getItem('stashes_list_v1') || 'null');
      if (Array.isArray(cb)) {
        setBooksDataFresh(false);
        renderBooksList(cb, Array.isArray(cs) ? cs : [], Array.isArray(ct) ? ct : []);
      }
      else if (cb) { localStorage.removeItem('books_list_v1'); localStorage.removeItem('series_list_v1'); localStorage.removeItem('stashes_list_v1'); }
    } catch (_) {}
  }

  try {
    const [booksRes, profileRes, stashesRes] = await Promise.all([
      apiFetch('/api/books'),
      apiFetch('/api/profile'),
      apiFetch('/api/stashes'),
    ]);
    const books   = await booksRes.json();
    const profile = await profileRes.json();
    const stashes = stashesRes.ok ? await stashesRes.json() : [];
    _processRewardSnapshot(profile);
    if (profile.id) { _currentUserId = profile.id; setCurrentUserId(_currentUserId); }
    _isAdmin = resolveIsAdmin(profile);
    _canSeeAppXp = _isAdmin || profile.id === APP_XP_EXTRA_USER_ID;
    _hasPdfAccess = !!profile.pdfAccess || _isAdmin;
    refreshAppXp();
    _connectAppXpSSE();
    updateAvatarUI(profile.avatarUrl || null);
    setCurrentUserLevel(profile.level || 0);
    setBonusUndos(profile.bonusUndos || 0);
    setBonusFastTravels(profile.bonusFastTravels || 0);
    updateCoinsDisplay(profile.coinsBalance || 0);
    if (profile.username) {
      setUsername(profile.username);
      registerAuthor(profile.username, !!profile.isAuthor, profile.displayName);
      registerContributor(profile.username, !!profile.isContributor);
      const _dn = profile.displayName || profile.username;
      document.getElementById('books-username').innerHTML = escapeHtml(_dn) + adminBadge(_isAdmin) + authorBadge(profile.username) + contributorBadge(profile.username);
      _updateUsernameTooltip();
    }
    const seriesRes = await apiFetch('/api/series');
    const allSeries = seriesRes.ok ? await seriesRes.json() : [];
    await _prefsReady;
    renderBooksList(books, allSeries, Array.isArray(stashes) ? stashes : []);
    setBooksDataFresh(true);
  } catch (_) {}
}

async function showMain(bookId, isbn = null, issn = null, asin = null, cover = null, pdfPath = null, pages = null, authors = null, description = null, discoverableSections = null, isPublic = false, isCreator = true, seriesName = null, seriesNumber = null, isContainer = false, parentBookId = null, bookOrder = null) {
  if (_isMobile()) { showBooks(); return; }
  _lockView('book', 1500);
  document.body.classList.remove('promo-active');
  const _pvi2 = document.getElementById('login-promo-video-iframe');
  if (_pvi2) _pvi2.src = '';
  document.getElementById('landing-wrapper').style.display = 'none';
  // landing-bg-a/-b/-dim are siblings of landing-wrapper (not descendants -
  // see landing.css), so hiding landing-wrapper alone leaves them visible
  // and still full-viewport position:fixed behind the app, and their 60s
  // rotation timer kept repainting them for the rest of the session even
  // with a book/graph open. Mirror _revealLanding()'s visibility toggle in
  // reverse here, and stop the timer - both get restored by _revealLanding()
  // + _startLandingCoverRotation() (via loadCovers()/_showCachedCoversPanel())
  // the next time showBooks() runs.
  _stopLandingCoverRotation();
  ['landing-bg-a', 'landing-bg-b', 'landing-bg-dim'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.visibility = 'hidden';
  });
  window._syncScrollTopBtns?.();
  document.getElementById('main-screen').style.display     = 'flex';
  document.getElementById('legend').style.display          = 'flex';
  document.getElementById('feed-toggle').style.display     = 'none';
  _positionRewardLayer();
  document.getElementById('covers-panel').classList.remove('active');
  document.getElementById('covers-toggle').classList.remove('visible');
  document.getElementById('right-toggle').classList.remove('visible');
  document.getElementById('sidebar-toggle').classList.add('visible');

  _pushNav('book/' + bookId, { view: 'book', bookId });

  _currentBook.isbn                 = isbn;
  _currentBook.issn                 = issn;
  _currentBook.asin                 = asin;
  setCurrentBookCover(cover);
  const _bk = getCachedBooks()?.find(b => b.id === bookId);
  resetBgState(!!(_bk?.bgHidden), _bk?.bgPosY ?? 50);
  _currentBook.pdfPath              = pdfPath;
  _currentBook.pages                = pages;
  _currentBook.authors              = authors;
  _currentBook.description          = description;
  _currentBook.discoverableSections = discoverableSections;
  setDiscoverableLimit(discoverableSections);
  _currentBook.isPublic             = !!isPublic;
  _currentBook.seriesName           = seriesName || null;
  _currentBook.seriesNumber         = seriesNumber || null;
  _currentBook.isContainer          = !!isContainer;
  _currentBook.parentBookId         = parentBookId || null;
  _currentBook.bookOrder            = bookOrder ?? null;
  { const bk = (getCachedBooks() || []).find(b => b.id === bookId);
    _currentBook.seriesId   = bk?.series_id ?? null;
    const sr = _currentBook.seriesId && Array.isArray(getCachedAllSeries())
      ? getCachedAllSeries().find(s => s.id === _currentBook.seriesId) : null;
    _currentBook.isOpenWorld = !!(sr?.is_open_world);
    setupOpenWorldForBook(bookId, _currentBook.seriesId, _currentBook.isOpenWorld);
  }
  const editBookBtn = document.getElementById('edit-book-btn');
  editBookBtn.style.display = (isCreator || _isAdmin) ? '' : 'none';
  editBookBtn.classList.toggle('admin-override', !isCreator && _isAdmin);
  if (!isCreator && _isAdmin) editBookBtn.dataset.tooltip = 'Admin edit';
  else delete editBookBtn.dataset.tooltip;
  const pdfDlBtn = document.getElementById('pdf-download-btn');
  if (pdfDlBtn) {
    const showPdfBtn = _hasPdfAccess && !!pdfPath && !parentBookId;
    pdfDlBtn.style.display = showPdfBtn ? '' : 'none';
    if (showPdfBtn) pdfDlBtn.href = _adminPdfHref(pdfPath);
  }
  setViewingPt(null);
  // On a slow connection GET /api/books/:id/state can take a moment, during
  // which #graph-container/#sidebar would otherwise just sit empty/stale.
  // #graph-container: initGraph() overwrites this the instant it constructs
  // the new vis.Network right after, so it never needs explicit clearing.
  // #sidebar: its stats/playthrough-panel elements already exist in the
  // static HTML shell and render() only updates them in place, so this
  // overlay is removed explicitly once render() + _updateSidebarBookInfo()
  // actually populate it, below.
  const _graphContainerEl = document.getElementById('graph-container');
  if (_graphContainerEl) {
    _graphContainerEl.innerHTML = `<div class="graph-loading">${_loadingGraphSvg()}<span>${t('graph.loading')}</span></div>`;
  }
  const _sidebarEl = document.getElementById('sidebar');
  if (_sidebarEl) {
    _sidebarEl.insertAdjacentHTML('beforeend', `<div class="sidebar-loading">${_loadingGraphSvg()}<span>${t('graph.loading')}</span></div>`);
  }
  await loadState(bookId);
  if (_currentBook.isOpenWorld && _currentBook.seriesId) {
    const seriesRuns = await _syncSeriesRuns(_currentBook.seriesId);
    await _computeCrossBookReachability(seriesRuns, bookId);
  } else {
    clearOpenWorldState();
  }

  destroyNetwork();
  setGraphOpenWorld(_currentBook.isOpenWorld, _currentBook.isOpenWorld ? (getCachedBooks() || []).filter(b => b.series_id === _currentBook.seriesId).map(b => ({ id: b.id, name: b.name })) : []); // must be after destroyNetwork
  initGraph();
  network.on('oncontext', params => {
    params.event.preventDefault();
    const nodeId = network.getNodeAt(params.pointer.DOM);
    if (nodeId === undefined) {
      hideCtxMenu();
      ctxCanvasPos = network.DOMtoCanvas(params.pointer.DOM);
      _showBgCtxMenu(params.event.clientX, params.event.clientY);
      return;
    }
    _hideBgCtxMenu();
    ctxNodeId = nodeId;
    const pt     = currentPlaythrough();
    const ftLeft = pt ? (maxFastTravels() - (pt.fastTravelsUsed || 0)) : 0;
    const hasRuns = state.playthroughs.length > 0;
    const hasActiveRun = !!pt && !pt.completed;
    const curSec = currentSection();
    const isPlaceholder = !curSec;
    const crossBookReachable = _currentBook.isOpenWorld && isPlaceholder && !!getOwCrossBookRoute()?.has(nodeId);
    const showJump = pt && !pt.completed && ftLeft > 0 && !!state.graph[nodeId] &&
      (canReach(curSec, nodeId) || crossBookReachable);
    const isStartNode = nodeId === (isValidSecId(state.startSection) ? state.startSection : 1);
    document.getElementById('ctx-start-node-btn').style.display = ((_isAdmin || !hasRuns) && isStartNode) ? '' : 'none';
    document.getElementById('ctx-edit-btn').style.display       = hasActiveRun ? '' : 'none';
    document.getElementById('ctx-note-btn').style.display       = hasRuns ? '' : 'none';
    document.getElementById('ctx-battle-btn').style.display     = hasRuns ? '' : 'none';
    document.getElementById('ctx-delete-btn').style.display     = (hasActiveRun && !isStartNode) ? '' : 'none';
    document.getElementById('ctx-jump-wrap').style.display      = showJump ? '' : 'none';
    document.querySelectorAll('.ctx-submenu-wrap:not(#ctx-jump-wrap)').forEach(w => w.style.display = hasRuns ? '' : 'none');
    const ctxPortalBtn = document.getElementById('ctx-portal-btn');
    if (ctxPortalBtn) ctxPortalBtn.style.display = _currentBook.isOpenWorld ? '' : 'none';
    _updateColorSwatches(nodeId);
    _positionMenu(document.getElementById('node-ctx-menu'), params.event.clientX, params.event.clientY);
  });

  // A plain left-click on a node opens a read-only Live Reading preview of
  // its text - previewSection (liveread.js) does its own isSectionMapped
  // gate internally and silently no-ops for a node that's never actually
  // been visited (grey/"Discovered" only, not purple/"Mapped"), so nothing
  // extra to check here. params.nodes is empty for a click on empty
  // canvas/an edge - only ever act on an actual node.
  network.on('click', params => {
    if (params.nodes.length !== 1) return;
    previewSection(params.nodes[0]);
  });

  // Restore viewing run across F5
  const _savedVw = parseInt(localStorage.getItem(`vw_${bookId}`) ?? '', 10);
  if (!isNaN(_savedVw) && _savedVw >= 0 && state.playthroughs[_savedVw]?.completed) {
    setViewingPt(state.playthroughs[_savedVw]);
  } else if (!currentPlaythrough() && state.playthroughs.length > 0) {
    // No active run and nothing restored from localStorage (e.g. never explicitly
    // "viewed" a run in this browser before). Without a displayPt, charsheet/inventory/
    // equipment hide entirely rather than showing read-only - default to the most
    // recently completed run so a fully-finished book doesn't look like it has none
    // of its recorded charsheet/inventory data.
    const completedRuns = state.playthroughs.filter(p => p.completed);
    if (completedRuns.length) {
      const latest = completedRuns.reduce((a, b) =>
        (b.completedAt || b.startedAt || 0) > (a.completedAt || a.startedAt || 0) ? b : a);
      setViewingPt(latest);
    }
  }
  render();
  _updateSidebarBookInfo();
  document.querySelector('#sidebar .sidebar-loading')?.remove();
  const _openSec = currentSection();
  _focusNodeAfterLoad(_openSec);
  setCharSheetVisible(true);
  setInventoryVisible(true);
  _refreshInvDisplay();
  setEquipmentVisible(true);
  setBattleSimVisible(bookId === 829);
  setSim8Visible(bookId === 8);
  setSim286Visible(bookId === 286);
  setSim198Visible(bookId === 198);
  setSim199Visible(bookId === 199);
  setSim200Visible(bookId === 200);
  setSim186Visible(bookId === 186);
  setSim201Visible(bookId === 201);
  setSim202Visible(bookId === 202);
  setSim203Visible(bookId === 203);
  setSim83Visible(bookId === 83);
  setSim86Visible(bookId === 86);
  setSim114Visible(bookId === 114);
  setSim115Visible(bookId === 115);
  setSim123Visible(bookId === 123);
  setSim130Visible(bookId === 130);
  setSim92Visible(bookId === 92);
  setSim108Visible(bookId === 108);
  setSim216Visible(bookId === 216);
  setSim193Visible(bookId === 193);
  setSim217Visible(bookId === 217);
  setSim227Visible(bookId === 227);
  setSim526Visible(bookId === 526);
  setSim324Visible(bookId === 324);
  setSim325Visible(bookId === 325);
  setSim122Visible(bookId === 122);
  setSim80Visible(bookId === 80);
  setSim82Visible(bookId === 82);
  setSim118Visible(bookId === 118);
  setSim218Visible(bookId === 218);
  setSim219Visible(bookId === 219);
  setSim220Visible(bookId === 220);
  setSim223Visible(bookId === 223);
  setSim221Visible(bookId === 221);
  setSim222Visible(bookId === 222);
  setSim224Visible(bookId === 224);
  setSim370Visible(bookId === 370);
  setSim375Visible(bookId === 375);
  setSim376Visible(bookId === 376);
  setSim377Visible(bookId === 377);
  setSim378Visible(bookId === 378);
  setSim78Visible(bookId === 78);
  setSim107Visible(bookId === 107);
  setSim135Visible(bookId === 135);
  setSim317Visible(bookId === 317);
  setSim318Visible(bookId === 318);
  setSim319Visible(bookId === 319);
  setSim320Visible(bookId === 320);
  setSim397Visible(bookId === 397);
  setSim321Visible(bookId === 321);
  setSim398Visible(bookId === 398);
  setSim399Visible(bookId === 399);
  setSim414Visible(bookId === 414);
  setSim415Visible(bookId === 415);
  setSim416Visible(bookId === 416);
  setSim225Visible(bookId === 225);
  setSim226Visible(bookId === 226);
  setSim430Visible(bookId === 430);
  setSim431Visible(bookId === 431);
  setSim432Visible(bookId === 432);
  setSim228Visible(bookId === 228);
  setSim229Visible(bookId === 229);
  setSim230Visible(bookId === 230);
  setSim323Visible(bookId === 323);
  setSim322Visible(bookId === 322);
  setSim204Visible(bookId === 204);
  setSim205Visible(bookId === 205);
  setSim206Visible(bookId === 206);
  setSim207Visible(bookId === 207);
  setSim208Visible(bookId === 208);
  setSim209Visible(bookId === 209);
  setSim210Visible(bookId === 210);
  setSim211Visible(bookId === 211);
  setSim212Visible(bookId === 212);
  setSim213Visible(bookId === 213);
  setSim214Visible(bookId === 214);
  setSim215Visible(bookId === 215);
  // Gated server-side already (db._canLiveRead) - hasLiveReading only ever
  // comes back true for that one account regardless of who's asking, so no
  // extra username check is needed here (unlike the earlier single-book POC).
  setLiveReadVisible(!!_bk?.hasLiveReading);
  setDiceRollerVisible(true);
  setGuideVisible(true);
  if (state.notesPinned) {
    await loadNotesForBook(bookId);
  }
  if (!isDemoMode) connectPartySSE(bookId);
}


function _toggleShortcutsModal(open) {
  const overlay = document.getElementById('shortcuts-modal-overlay');
  if (!overlay) return;
  const shouldOpen = open ?? !overlay.classList.contains('active');
  overlay.classList.toggle('active', shouldOpen);
}


// ── Boot ──────────────────────────────────────────────────────────────────────

// Track whether the most recent mousedown landed on an overlay backdrop.
// Used to prevent drag-selection from accidentally closing modals.
let _mousedownOnOverlay = null;
document.addEventListener('mousedown', e => {
  _mousedownOnOverlay = (e.target.classList.contains('modal-overlay') || e.target.classList.contains('pub-overlay') || e.target.classList.contains('inv-overlay')) ? e.target : null;
});

document.addEventListener('DOMContentLoaded', async () => {

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
  // Wired exactly once (_mobilePanelWired guard) rather than every
  // showBooks() call like the covers-toggle/right-toggle/etc. listeners
  // just above - those re-attach harmlessly on every call since toggling a
  // boolean class an extra time or two roughly cancels out, but this
  // block's history.pushState() does not: N stacked duplicate listeners
  // from N earlier showBooks() calls would push N history entries on a
  // single tap, needing N back-presses to close a panel opened with one tap.
  if (!_mobilePanelWired) {
    _mobilePanelWired = true;
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
  document.getElementById('shortcuts-modal-overlay')?.addEventListener('mousedown', e => { _mousedownOnOverlay = e.target === e.currentTarget ? e.target : null; });
  document.getElementById('shortcuts-modal-overlay')?.addEventListener('click', e => {
    if (e.target === e.currentTarget && _mousedownOnOverlay === e.target) _toggleShortcutsModal(false);
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
    if (!(e.ctrlKey && !e.shiftKey && !e.altKey && (e.code === 'KeyX' || String(e.key || '').toLowerCase() === 'x'))) return;
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

  applyTranslations();

  initCharSheet();
  initInventory();
  initEquipment();
  initBattleSim();
  initBattleSim8();
  initSim286();
  initSim198();
  initSim199();
  initSim200();
  initSim186();
  initSim201();
  initSim202();
  initSim203();
  initSim83();
  initSim86();
  initSim114();
  initSim115();
  initSim123();
  initSim130();
  initSim92();
  initSim108();
  initSim216();
  initSim193();
  initSim217();
  initSim227();
  initSim526();
  initSim324();
  initSim325();
  initSim122();
  initSim80();
  initSim82();
  initSim118();
  initSim218();
  initSim219();
  initSim220();
  initSim223();
  initSim221();
  initSim222();
  initSim224();
  initSim370();
  initSim375();
  initSim376();
  initSim377();
  initSim378();
  initSim78();
  initSim107();
  initSim135();
  initSim317();
  initSim318();
  initSim319();
  initSim320();
  initSim397();
  initSim321();
  initSim398();
  initSim399();
  initSim414();
  initSim415();
  initSim416();
  initSim225();
  initSim226();
  initSim430();
  initSim431();
  initSim432();
  initSim228();
  initSim229();
  initSim230();
  initSim323();
  initSim322();
  initSim204();
  initSim205();
  initSim206();
  initSim207();
  initSim208();
  initSim209();
  initSim210();
  initSim211();
  initSim212();
  initSim213();
  initSim214();
  initSim215();
  initLiveRead();
  // renderLiveRead() also needs to run after every render() (fast-travel
  // jumps and the sidebar's own choice buttons move pt.path without going
  // through setViewingPt, unlike renderLiveRead()'s other trigger below).
  setAfterRenderFn(renderLiveRead);
  setExtraDisplayItemsProvider(async () => await getVisibleEquippedItems());
  setOnViewingPtChange(() => {
    _refreshInvDisplay();
    renderCharSheetDisplay();
    renderBattleSim();
    renderSim8();
    renderSim286();
    renderSim198();
    renderSim199();
    renderSim200();
    renderSim186();
    renderSim201();
    renderSim202();
    renderSim203();
    renderSim83();
    renderSim86();
    renderSim114();
    renderSim115();
    renderSim123();
    renderSim130();
    renderSim92();
    renderSim108();
    renderSim216();
    renderSim193();
    renderSim217();
    renderSim227();
    renderSim526();
    renderSim324();
    renderSim325();
    renderSim122();
    renderSim80();
    renderSim82();
    renderSim118();
    renderSim218();
    renderSim219();
    renderSim220();
    renderSim221();
    renderSim222();
    renderSim224();
    renderSim223();
    renderSim370();
    renderSim375();
    renderSim376();
    renderSim377();
    renderSim378();
    renderSim78();
    renderSim107();
    renderSim135();
    renderSim317();
    renderSim318();
    renderSim319();
    renderSim320();
    renderSim397();
    renderSim321();
    renderSim398();
    renderSim399();
    renderSim414();
    renderSim415();
    renderSim416();
    renderSim225();
    renderSim226();
    renderSim430();
    renderSim431();
    renderSim432();
    renderSim228();
    renderSim229();
    renderSim230();
    renderSim323();
    renderSim322();
    renderSim204();
    renderSim205();
    renderSim206();
    renderSim207();
    renderSim208();
    renderSim209();
    renderSim210();
    renderSim211();
    renderSim212();
    renderSim213();
    renderSim214();
    renderSim215();
    renderLiveRead();
  });
  initTooltip();

  // ── Legend collapse ──────────────────────────────────────────────
  {
    const legend = document.getElementById('legend');
    const header = document.getElementById('legend-header');
    if (localStorage.getItem('legendCollapsed') === '1') legend.classList.add('legend-collapsed');
    header.addEventListener('click', () => {
      _setPlayPanelCollapsed('legendCollapsed', !legend.classList.contains('legend-collapsed'));
    });
  }
  {
    const panel = document.getElementById('play-xp-summary');
    const header = document.getElementById('play-xp-header');
    if (localStorage.getItem('playXpCollapsed') === '1') panel?.classList.add('play-xp-collapsed');
    header?.addEventListener('click', () => {
      _setPlayPanelCollapsed('playXpCollapsed', !panel?.classList.contains('play-xp-collapsed'));
    });
  }

  // ── Trail collapse prefs hook ────────────────────────────────────
  setOnTrailToggle(v => savePrefs({ trailCollapsed: v ? '1' : '0' }));

  // ── Choices-input onboarding pulse counter ────────────────────────
  setOnChoicesRecorded(n => savePrefs({ choicesRecordedCount: n }));

  // ── User guide modal ─────────────────────────────────────────────
  const guideBtn     = document.getElementById('guide-btn');
  const guideOverlay = document.getElementById('guide-modal-overlay');
  const guideClose   = document.getElementById('guide-modal-close');
  guideBtn.addEventListener('click', () => guideOverlay.classList.add('active'));
  guideClose.addEventListener('click', () => guideOverlay.classList.remove('active'));
  guideOverlay.addEventListener('click', e => { if (e.target === guideOverlay && _mousedownOnOverlay === e.target) guideOverlay.classList.remove('active'); });
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
    const reveal = () => { forumOverlay.classList.add('active'); _forumRevealPending = null; forumFrame.removeEventListener('load', reveal); };
    _forumRevealPending = reveal;
    forumFrame.addEventListener('load', reveal);
    try { forumFrame.contentWindow.location.replace(url); }
    catch (_) { forumFrame.setAttribute('src', url); }
  };
  forumClose?.addEventListener('click', closeForumModal);
  forumOverlay?.addEventListener('click', e => {
    if (e.target === forumOverlay && _mousedownOnOverlay === e.currentTarget) closeForumModal();
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

  // ── Shop ─────────────────────────────────────────────────────────
  setShopHooks({
    onRewardSnapshot:      _processRewardSnapshot,
    onSetBonusUndos:       setBonusUndos,
    onSetBonusFastTravels: setBonusFastTravels,
    getMousedownOverlay:   () => _mousedownOnOverlay,
  });
  initShop();

  // ── Notebook modal + notes display overlay ───────────────────────
  setNotesOnXpAwarded(refreshCoinsDisplay);
  initNotes();

  // ── Play Together (party) ─────────────────────────────────────────
  setPartyHooks({
    getCurrentUserId: () => _currentUserId,
    scheduleRewardProfileRefresh: _scheduleRewardProfileRefresh,
    refreshBooksListOnly: _refreshBooksListOnly,
  });
  initParty();

  // ── Auth (login/register/forgot/reset) ────────────────────────────
  setOnAuthSuccess(showBooks);

  window.addEventListener('auth-expired', showLogin);
  window.addEventListener('maintenance-mode', () => location.reload(), { once: true });
  window.addEventListener('resize', _syncFeedTogglePos);

  // ── Tips bar ──────────────────────────────────────────────────────
  initTips();

  // ── Demo ─────────────────────────────────────────────────────────
  setDemoHooks({ showBooks, showLogin });
  document.getElementById('demo-btn').addEventListener('click', startDemoMode);
  document.getElementById('demo-exit-btn').addEventListener('click', exitDemoMode);

  document.getElementById('app-banner-f1-btn').addEventListener('click', () => _toggleShortcutsModal());

  // ── Login screen ─────────────────────────────────────────────────
  initAuth();
  document.getElementById('mobile-guest-btn').addEventListener('click', () => {
    document.body.classList.remove('mobile-auth');
  });

  // ── Profile modal ─────────────────────────────────────────────────
  setProfileHooks({
    onRewardSnapshot:      _processRewardSnapshot,
    onSaveSuccess:         data => {
      registerAuthor(data.username, !!data.isAuthor, data.displayName);
      registerContributor(data.username, !!data.isContributor);
      const dn = data.displayName || data.username;
      document.getElementById('books-username').innerHTML = escapeHtml(dn || '') + adminBadge(_isAdmin) + authorBadge(data.username) + contributorBadge(data.username);
      _updateUsernameTooltip();
    },
    getMousedownOverlay:   () => _mousedownOnOverlay,
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
    getIsAdmin:          () => _isAdmin,
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
    clearCtxNodeId: () => { ctxNodeId = null; },
  });
  // The only trigger for idle_heartbeat XP (and the bonus-coin roll it can
  // fire) - called solely from livetab.js's dedicated 60s leader-tab timer,
  // deliberately not tied to feed reloads. Fire-and-forget: nothing in the
  // UI needs to react to the response itself (a pending bonus coin surfaces
  // separately via the existing /api/profile refresh already scheduled
  // after loadFeed).
  const _sendHeartbeat = () => { apiFetch('/api/heartbeat', { method: 'POST' }).catch(() => {}); };

  setLiveTabHooks({
    loadFeed:                    loadFeed,
    loadCovers:                  (opts) => loadCovers(opts),
    isLandingVisible:            _isLandingBooksViewVisible,
    refreshPublicCatalogIfVisible: _refreshPublicCatalogIfVisible,
    refreshBooksListOnly:        _refreshBooksListOnly,
    scheduleLiveUiRefresh:       _scheduleLiveUiRefresh,
    processRewardSnapshot:       _processRewardSnapshot,
    refreshAppXp:                refreshAppXp,
    getIsAdmin:                  () => _isAdmin,
    onAppXpEvent:                handleAppXpEvent,
    sendHeartbeat:                _sendHeartbeat,
  });
  setAppXpHooks({
    getIsAdmin: () => _isAdmin,
    getCanSeeAppXp: () => _canSeeAppXp,
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
    getIsAdmin:                   () => _isAdmin,
    getDemoBooks,
    setDemoBooks,
    maxSectionInUse,
    mappedCountFor,
    discoveredSectionsFor,
  });
  setOpenWorldHooks({
    showMain,
    getCurrentUserId:         () => _currentUserId,
    getCurrentBookSeriesId:   () => _currentBook.seriesId,
    openPublicSeriesRun,
  });
  setPrefsHooks({ syncFeedTogglePos: _syncFeedTogglePos, refreshDayCovers: refreshDayCoverFlows });
  setEditBookHooks({
    resolveIsAdmin:      () => resolveIsAdmin(),
    setCurrentBookCover,
    scheduleRewardProfileRefresh: _scheduleRewardProfileRefresh,
  });
  initEditBook(() => _mousedownOnOverlay);
  setAddBookHooks({ resolveIsAdmin: () => resolveIsAdmin(), scheduleRewardProfileRefresh: _scheduleRewardProfileRefresh });
  initAddBook(() => _mousedownOnOverlay);
  initBooksPanel();
  initInbox(() => _mousedownOnOverlay);
  initDice();
  initFeedback();

  // ── Books screen ──────────────────────────────────────────────────
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await apiFetch('/api/logout', { method: 'POST' }).catch(() => {});
    clearBooksCache();
    localStorage.removeItem('books_list_v1'); localStorage.removeItem('series_list_v1'); localStorage.removeItem('stashes_list_v1');
    clearToken(); clearUsername(); _isAdmin = false; _canSeeAppXp = false; setCoversPrefsState({}); resetFeedDisplayPrefsForLogout(); showLogin();
  });



  // ── Main screen ───────────────────────────────────────────────────
  document.getElementById('back-to-books-btn').addEventListener('click', showBooks);

  document.getElementById('edit-book-btn').addEventListener('click', () => {
    const min      = Math.max(5, maxSectionInUse());
    // Gate on the same two counts shown in the HUD ("Mapped" / "Discovered") rather than
    // a graph-only vs. path-only comparison - a section can be fully recorded (mapped)
    // without ever appearing in a playthrough's path (e.g. filled in manually), which
    // made the old discSet/visSet comparison diverge from what the player actually sees
    // and go by when deciding they've hit a wall.
    const mapped    = mappedCountFor(state.graph);
    const discCount = discoveredSectionsFor(state.graph, state.playthroughs, state.startSection).size;
    const hitWall   = mapped > 0 && mapped === discCount && mapped < state.totalSections;
    openEditBookModal({
      bookId:                      currentBookId,
      initialName:                 state.bookName,
      initialSections:             state.totalSections,
      initialIsbn:                 _currentBook.isbn        || '',
      initialIssn:                 _currentBook.issn        || '',
      initialAsin:                 _currentBook.asin        || '',
      initialCoverUrl:             getCurrentBookCover()  || null,
      initialPdfPath:              _currentBook.pdfPath     || null,
      initialPages:                _currentBook.pages       ? String(_currentBook.pages) : '',
      initialAuthors:              _currentBook.authors     || '',
      initialDescription:          _currentBook.description || '',
      initialDiscoverableSections: _currentBook.discoverableSections,
      showDiscoverableSections:    hitWall,
      discoverableHint:            discCount,
      minSections:                 min,
      initialIsPublic:             _currentBook.isPublic,
      initialSeriesName:           _currentBook.seriesName  || '',
      initialSeriesNumber:         _currentBook.seriesNumber || '',
      initialIsContainer:          _currentBook.isContainer,
      initialParentBookId:         _currentBook.parentBookId,
      initialBookOrder:            _currentBook.bookOrder,
      onSave: (name, sections, isbn, issn, asin, pages, authors, description, discoverableSections, isPublic, seriesName, seriesNumber, isContainer, parentId, bookOrder) => {
        _currentBook.isbn                 = isbn        || null;
        _currentBook.issn                 = issn        || null;
        _currentBook.asin                 = asin        || null;
        _currentBook.pages                = pages       || null;
        _currentBook.authors              = authors     || null;
        _currentBook.description          = description || null;
        _currentBook.discoverableSections = discoverableSections ?? null;
        setDiscoverableLimit(discoverableSections ?? null);
        _currentBook.seriesName           = seriesName  || null;
        _currentBook.seriesNumber         = seriesNumber || null;
        _currentBook.isContainer          = !!isContainer;
        _currentBook.parentBookId         = parentId    || null;
        _currentBook.bookOrder            = bookOrder   ?? null;
        state.bookName      = name;
        state.totalSections = isContainer ? state.totalSections : sections;
        _updateSidebarBookInfo();
        apiFetch(`/api/books/${currentBookId}`, {
          method: 'PATCH',
          body:   JSON.stringify({ name, total_sections: isContainer ? 0 : sections, isbn: isbn || null, issn: issn || null, asin: asin || null, pages: pages || null, authors: authors || null, description: description || null, discoverable_sections: discoverableSections ?? null, is_public: isPublic, series_name: seriesName || null, series_number: seriesNumber || null, is_container: isContainer ? 1 : 0, parent_book_id: parentId || null, book_order: bookOrder ?? null }),
        }).then(() => _refreshLibraryUi({ feed: true })).catch(() => {});
        saveState();
        render();
      },
    });
  });

  document.getElementById('edit-book-modal-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget && _mousedownOnOverlay === e.currentTarget) closeEditBookModal();
  });

  document.getElementById('ctx-edit-btn').addEventListener('click', () => {
    const id = ctxNodeId; hideCtxMenu();
    if (id !== null) openEditModal(id);
  });

  document.getElementById('ctx-note-btn').addEventListener('click', () => {
    const id = ctxNodeId; hideCtxMenu();
    if (id !== null) openNoteModal(id);
  });

  document.getElementById('note-modal-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget && _mousedownOnOverlay === e.currentTarget) closeNoteModal();
  });

  // Same "worth keeping" check as play.js's _cleanupOrphanedTargets and
  // graph.js's own orphan-pruning pass - was missing `portals`/`showNote`
  // here, so toggling priority/battle/color off a node that only had a
  // portal (no other choices) silently deleted the portal along with it.
  function _pruneDiscovered(id) {
    const n = state.graph[id];
    if (!n?.discovered) return;
    const hasMetadata = n.note || n.priority || n.battle || n.color || n.portals || n.showNote || n.manual;
    if (!hasMetadata && (!n.choices || n.choices.length === 0)) delete state.graph[id];
  }

  function setPriority(value) {
    const id = ctxNodeId; hideCtxMenu();
    if (id === null) return;
    if (!state.graph[id]) state.graph[id] = { choices: [], discovered: true };
    if (value === 'normal') delete state.graph[id].priority;
    else                    state.graph[id].priority = value;
    _pruneDiscovered(id);
    saveState();
    render();
  }

  document.getElementById('ctx-priority-high-btn').addEventListener('click',   () => setPriority('high'));
  document.getElementById('ctx-priority-normal-btn').addEventListener('click', () => setPriority('normal'));
  document.getElementById('ctx-priority-low-btn').addEventListener('click',    () => setPriority('low'));

  document.getElementById('ctx-battle-btn').addEventListener('click', () => {
    const id = ctxNodeId; hideCtxMenu();
    if (id === null) return;
    if (!state.graph[id]) state.graph[id] = { choices: [], discovered: true };
    if (state.graph[id].battle) delete state.graph[id].battle;
    else                        state.graph[id].battle = true;
    _pruneDiscovered(id);
    saveState();
    render();
  });

  const ctxPortalBtn = document.getElementById('ctx-portal-btn');
  if (ctxPortalBtn) ctxPortalBtn.addEventListener('click', () => {
    const id = ctxNodeId; hideCtxMenu();
    if (id !== null) openPortalModal(id, null);
  });


  document.getElementById('ctx-color-grid').addEventListener('click', e => {
    const swatch = e.target.closest('.ctx-color-swatch');
    if (!swatch) return;
    const id = ctxNodeId; hideCtxMenu();
    if (id === null) return;
    if (!state.graph[id]) state.graph[id] = { choices: [], discovered: true };
    const color = swatch.dataset.color;
    if (state.graph[id].color === color) {
      delete state.graph[id].color;
    } else {
      state.graph[id].color = color;
    }
    _pruneDiscovered(id);
    saveState();
    render();
  });

  // Opening the native color picker is itself a real click on this input,
  // which bubbles to the document-level "click anywhere closes the context
  // menu" listener below - that cleared ctxNodeId (via hideCtxMenu) before
  // the picker's own async 'change' ever fired, so picking a color always
  // silently no-op'd once the menu (and the id it remembered) was already
  // gone. Stopping that initial click from bubbling keeps the menu, and
  // ctxNodeId, alive for as long as the native picker itself is open.
  document.getElementById('ctx-color-custom').addEventListener('click', e => {
    e.stopPropagation();
  });
  document.getElementById('ctx-color-custom').addEventListener('change', e => {
    const id = ctxNodeId; hideCtxMenu();
    if (id === null) return;
    if (!state.graph[id]) state.graph[id] = { choices: [], discovered: true };
    state.graph[id].color = e.target.value;
    _pruneDiscovered(id);
    saveState();
    render();
  });

  document.getElementById('ctx-color-clear-btn').addEventListener('click', () => {
    const id = ctxNodeId; hideCtxMenu();
    if (id === null) return;
    if (state.graph[id]) { delete state.graph[id].color; _pruneDiscovered(id); }
    saveState();
    render();
  });

  function doJump(mode, explicitId) {
    const id = explicitId ?? ctxNodeId;
    hideCtxMenu();
    if (id === null || id === undefined) return;
    const pt = currentPlaythrough();
    if (!pt) return;
    const from = currentSection();

    // Cross-book fast travel (open world) - only when no sections in this book yet
    const isPlaceholderRun = !from; // path is empty, run lives in another book
    if (_currentBook.isOpenWorld && isPlaceholderRun && getOwCrossBookRoute()?.has(id)) {
      doJumpCrossBook(id, mode);
      return;
    }

    if (!canReach(from, id)) { showAlert(t('ctx.fasttravel.no_path')); return; }
    const path = findPathTo(from, id, mode);
    if (!path || path.length < 2) { showAlert(t('ctx.fasttravel.no_path')); return; }
    for (let i = 1; i < path.length; i++) pt.path.push(path[i]);
    pt.fastTravelsUsed = (pt.fastTravelsUsed || 0) + 1;
    pt.lastActionAt = Date.now();
    saveState();
    render();
    if (network && !wouldAutoNav(id, pt)) network.focus(id, { animation: true, scale: 1.2 });
  }

  setFastTravelHandler(() => showFastTravelDialog((secId, mode) => doJump(mode, secId)));

  setAltStartHandler(() => {
    document.getElementById('alt-start-error').textContent = '';
    document.getElementById('alt-start-input').value = String(isValidSecId(state.startSection) ? state.startSection : 1);
    document.getElementById('alt-start-input').inputMode = state.alphanumericSections ? 'text' : 'numeric';
    document.getElementById('alt-start-row').classList.toggle('no-stepper', !!state.alphanumericSections);
    document.getElementById('alt-start-modal-overlay').classList.add('active');
    setTimeout(() => { document.getElementById('alt-start-input').select(); }, 50);
  });

  document.getElementById('ctx-jump-high-btn').addEventListener('click',     () => doJump('high'));
  document.getElementById('ctx-jump-shortest-btn').addEventListener('click', () => doJump('shortest'));
  document.getElementById('ctx-jump-normal-btn').addEventListener('click',   () => doJump('normal'));
  document.getElementById('ctx-jump-low-btn').addEventListener('click',      () => doJump('low'));

  // "+ Add node": places a freestanding node at wherever the empty-canvas
  // right-click that opened bg-ctx-menu landed (ctxCanvasPos), for sections
  // that exist in the book but aren't reachable through any recorded choice
  // (e.g. bonus episodes) - lets you park a note/color on them without first
  // inventing a fake incoming choice just to get them onto the map.
  let _addNodeClickPos = null;

  function openAddNodeModal() {
    _addNodeClickPos = ctxCanvasPos;
    _hideBgCtxMenu();
    document.getElementById('add-node-input').classList.remove('invalid');
    document.getElementById('add-node-input').value = '';
    document.getElementById('add-node-modal-overlay').classList.add('active');
    setTimeout(() => { document.getElementById('add-node-input').focus(); }, 50);
  }
  document.getElementById('bg-ctx-addnode-btn').addEventListener('click', openAddNodeModal);

  function closeAddNodeModal() {
    document.getElementById('add-node-modal-overlay').classList.remove('active');
  }
  document.getElementById('add-node-cancel').addEventListener('click', closeAddNodeModal);
  document.getElementById('add-node-modal-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget && _mousedownOnOverlay === e.currentTarget) closeAddNodeModal();
  });

  // Same brief red-border flash as #find-node-input's own .not-found class
  // (graph toolbar's "jump to section" field) - no text message, just a
  // 0.8s border flash, per how that field already handles an invalid entry.
  function _flashAddNodeInvalid() {
    const inp = document.getElementById('add-node-input');
    inp.classList.add('invalid');
    setTimeout(() => inp.classList.remove('invalid'), 800);
  }

  // Creates a brand new node and drops it exactly at the click position -
  // the caller (add-node-save handler below) has already rejected any id
  // that's already on the map, so this never touches an existing node's
  // position or data. Deliberately NOT setting discovered: true - per
  // mappedCountFor (state.js) and nodeColor (graph.js), a node only counts
  // (and colors) as merely "discovered" when discovered is explicitly true
  // AND it has no choices/portals; omitting the flag entirely is what makes
  // mappedCountFor's own `!graph[s]?.discovered` clause treat it as fully
  // mapped immediately, matching "mapped and discovered" - the whole point
  // of a manually-placed node, since it'll never get its own choices to
  // record. `manual: true` marks it as worth keeping to graph.js's
  // deleteNodes()/this file's own _pruneDiscovered()/play.js's note-save
  // cleanup and _cleanupOrphanedTargets, all of which otherwise silently
  // delete a bare node with no choices/note/priority/color/battle/portals
  // the next time some unrelated node gets cleaned up - without this flag a
  // freshly-added, still-empty bonus node would be exactly that
  // "worth deleting" shape.
  function _applyAddNode(id, pos) {
    state.graph[id] = { choices: [], manual: true };
    state.positions[id] = pos;
    saveState();
    render();
    closeAddNodeModal();
  }

  document.getElementById('add-node-save').addEventListener('click', () => {
    const raw = document.getElementById('add-node-input').value.trim();
    if (!raw) { _flashAddNodeInvalid(); return; }
    const id = parseSecId(raw);
    if (!isValidSecId(id) || (typeof id === 'number' && id < 1)) { _flashAddNodeInvalid(); return; }
    // Range check only applies to plain numeric ids - an alphanumeric label
    // like "115-L" isn't part of the book's sequential numbered range at all.
    if (typeof id === 'number' && state.totalSections > 0 && id > state.totalSections) { _flashAddNodeInvalid(); return; }
    if (state.graph[id]) { _flashAddNodeInvalid(); return; }
    const pos = _addNodeClickPos || { x: 0, y: 0 };
    if (typeof id === 'string' && !state.alphanumericSections) {
      confirmAlphanumericSwitch(id, () => _applyAddNode(id, pos));
      return;
    }
    _applyAddNode(id, pos);
  });

  document.getElementById('add-node-input').addEventListener('keydown', e => {
    if (e.key === 'Enter')  document.getElementById('add-node-save').click();
    if (e.key === 'Escape') closeAddNodeModal();
  });
  document.getElementById('add-node-input').addEventListener('input', e => {
    e.target.classList.remove('invalid');
  });

  function openStartNodeModal() {
    hideCtxMenu();
    document.getElementById('start-node-error').textContent = '';
    document.getElementById('start-node-input').value = String(ctxNodeId ?? state.startSection ?? 1);
    document.getElementById('start-node-modal-overlay').classList.add('active');
    setTimeout(() => { document.getElementById('start-node-input').select(); }, 50);
  }

  document.getElementById('ctx-start-node-btn').addEventListener('click', openStartNodeModal);

  document.getElementById('start-node-cancel').addEventListener('click', () => {
    document.getElementById('start-node-modal-overlay').classList.remove('active');
  });
  document.getElementById('start-node-modal-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget && _mousedownOnOverlay === e.currentTarget) e.currentTarget.classList.remove('active');
  });

  function _applyStartNodeRename(newId, oldId) {
    if (newId !== oldId) {
      // Rename the node in the graph
      if (state.graph[oldId] !== undefined) {
        state.graph[newId] = state.graph[oldId];
        delete state.graph[oldId];
      }
      // Update any choices pointing to oldId
      for (const data of Object.values(state.graph)) {
        data.choices = (data.choices || []).map(c => c === oldId ? newId : c);
      }
      // Update saved positions
      if (state.positions?.[oldId] !== undefined) {
        state.positions[newId] = state.positions[oldId];
        delete state.positions[oldId];
      }
      // Update playthrough paths so the old id doesn't linger as an
      // orphaned extra "start" node in allDiscoveredSections()
      state.playthroughs.forEach(pt => {
        pt.path = (pt.path || []).map(s => s === oldId ? newId : s);
      });
    }
    state.startSection = newId;
    saveState();
    render();
    document.getElementById('start-node-modal-overlay').classList.remove('active');
  }

  document.getElementById('start-node-save').addEventListener('click', () => {
    const raw   = document.getElementById('start-node-input').value.trim();
    const newId = parseSecId(raw || '1');
    const errEl = document.getElementById('start-node-error');
    if (!isValidSecId(newId) || (typeof newId === 'number' && newId < 1)) { errEl.textContent = t('play.must_be_1_or_greater'); return; }
    const oldId = ctxNodeId ?? state.startSection ?? 1;
    if (typeof newId === 'string' && !state.alphanumericSections) {
      confirmAlphanumericSwitch(newId, () => _applyStartNodeRename(newId, oldId));
      return;
    }
    _applyStartNodeRename(newId, oldId);
  });

  document.getElementById('start-node-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('start-node-save').click();
    if (e.key === 'Escape') document.getElementById('start-node-cancel').click();
  });

  function _adjustStartNode(delta) {
    const inp = document.getElementById('start-node-input');
    const cur = parseSecId(inp.value.trim());
    const next = (typeof cur === 'number' && cur > 0) ? Math.max(1, cur + delta) : 1;
    inp.value = String(next);
    document.getElementById('start-node-error').textContent = '';
  }
  document.getElementById('start-node-dec').addEventListener('click', () => _adjustStartNode(-1));
  document.getElementById('start-node-inc').addEventListener('click', () => _adjustStartNode(1));

  document.getElementById('alt-start-cancel').addEventListener('click', () => {
    document.getElementById('alt-start-modal-overlay').classList.remove('active');
  });
  document.getElementById('alt-start-modal-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget && _mousedownOnOverlay === e.currentTarget) e.currentTarget.classList.remove('active');
  });
  function _startAltRun(secId) {
    document.getElementById('alt-start-modal-overlay').classList.remove('active');
    startPlaythrough(secId);
  }
  document.getElementById('alt-start-save').addEventListener('click', () => {
    const raw   = document.getElementById('alt-start-input').value.trim();
    const secId = parseSecId(raw || '1');
    const errEl = document.getElementById('alt-start-error');
    if (!isValidSecId(secId) || (typeof secId === 'number' && secId < 1)) { errEl.textContent = t('play.must_be_1_or_greater'); return; }
    if (typeof secId === 'string' && !state.alphanumericSections) {
      confirmAlphanumericSwitch(secId, () => _startAltRun(secId));
      return;
    }
    _startAltRun(secId);
  });
  document.getElementById('alt-start-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('alt-start-save').click();
    if (e.key === 'Escape') document.getElementById('alt-start-cancel').click();
  });
  function _adjustAltStart(delta) {
    const inp = document.getElementById('alt-start-input');
    const cur = parseSecId(inp.value.trim());
    const next = (typeof cur === 'number' && cur > 0) ? Math.max(1, cur + delta) : 1;
    inp.value = String(next);
    document.getElementById('alt-start-error').textContent = '';
  }
  document.getElementById('alt-start-dec').addEventListener('click', () => _adjustAltStart(-1));
  document.getElementById('alt-start-inc').addEventListener('click', () => _adjustAltStart(1));

  document.getElementById('ctx-delete-btn').addEventListener('click', () => {
    const id = ctxNodeId; hideCtxMenu();
    if (id === null) return;
    if (id === (isValidSecId(state.startSection) ? state.startSection : 1)) return;
    const toDelete = subtreeToDelete(id);
    const extra    = toDelete.size > 1 ? t('confirm.delete_node_extra', { n: toDelete.size - 1 }) : '';
    showConfirm(t('confirm.delete_node', { id, extra }), () => {
      // Capture before deleteNodes mutates state - it may reopen (uncomplete) any
      // playthrough whose path passed through a deleted node, including the one
      // being viewed. Only stop viewing if THIS run's own path was affected -
      // not just because it happens to already be incomplete for other reasons.
      const viewingPtAffected = !!viewingPt && viewingPt.path.some(s => toDelete.has(s));
      deleteNodes(toDelete);
      if (viewingPtAffected) setViewingPt(null);
      render();
    });
  });

  document.addEventListener('click', () => { hideCtxMenu(); _hideBgCtxMenu(); });

  document.getElementById('bg-ctx-toggle-btn').addEventListener('click', e => {
    e.stopPropagation();
    toggleBgHidden();
  });

  document.getElementById('bg-ctx-move-btn').addEventListener('click', e => {
    e.stopPropagation();
    _hideBgCtxMenu();
    _enterBgMoveMode();
  });

  document.querySelectorAll('.ctx-connector-item').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const style = btn.dataset.connector;
      state.connectorStyle = style;
      saveState();
      applyConnectorStyle(style);
      _hideBgCtxMenu();
    });
  });

  document.getElementById('bg-ctx-grid-btn').addEventListener('click', e => {
    e.stopPropagation();
    state.showGrid = !state.showGrid;
    if (state.showGrid) state.fogOfGrid = false; // mutually exclusive with fog of grid
    saveState();
    network.redraw();
    _hideBgCtxMenu();
  });

  document.getElementById('bg-ctx-snap-btn').addEventListener('click', e => {
    e.stopPropagation();
    state.snapToGrid = !state.snapToGrid;
    // Covers turning it on while already zoomed out past the point where a
    // grid cell is bigger than typical touch imprecision - the 'zoom'
    // listener alone would never catch this since no further zooming may
    // happen before the next drag.
    if (state.snapToGrid) enforceSnapZoomFloor();
    saveState();
    _hideBgCtxMenu();
  });

  document.getElementById('bg-ctx-fog-btn').addEventListener('click', e => {
    e.stopPropagation();
    state.fogOfGrid = !state.fogOfGrid;
    if (state.fogOfGrid) state.showGrid = false; // mutually exclusive with show grid
    saveState();
    network.redraw();
    _hideBgCtxMenu();
  });

  document.getElementById('graph-container').addEventListener('mousemove', e => {
    if (!isBgInMove()) return;
    nudgeBgPosY(e.movementY);
  });

  document.getElementById('graph-container').addEventListener('click', e => {
    if (!isBgInMove()) return;
    e.stopPropagation();
    _exitBgMoveMode();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && isBgInMove()) _exitBgMoveMode();
  });

  window.addEventListener('resize', _positionRewardLayer);

  document.getElementById('edit-modal-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget && _mousedownOnOverlay === e.currentTarget) closeEditModal();
  });

  document.getElementById('center-current-btn').disabled = true;
  document.getElementById('center-current-btn').addEventListener('click', async () => {
    const sec = currentSection();
    // Only center locally if the active run is actually living in this book.
    // In OW, getOwSrcBookId() points to where the run lives; if it's a different book, skip local centering.
    const runIsLocal = !_currentBook.isOpenWorld || !getOwSrcBookId() || getOwSrcBookId() === currentBookId;
    if (runIsLocal && sec && network && visNodes?.get(sec)) {
      network.selectNodes([sec]);
      network.focus(sec, { scale: Math.max(network.getScale(), 1.2), animation: { duration: 400, easingFunction: 'easeInOutQuad' } });
      return;
    }
    // Cross-book: active run is in another book - navigate there
    if (_currentBook.isOpenWorld && getOwSrcBookId() && getOwSrcSection()) {
      const srcBook = (getCachedBooks() || []).find(b => b.id === getOwSrcBookId());
      if (!srcBook) return;
      // Snapshot before showMain - it resets getOwSrcSection() when the source book becomes current
      const targetSection  = getOwSrcSection();
      const targetRunIndex = state.activePtIndex; // same run index in the target book
      await showMain(
        srcBook.id,
        srcBook.isbn || null, srcBook.issn || null, srcBook.asin || null,
        srcBook.cover_path ? `/covers/${srcBook.cover_path}` : null,
        srcBook.pdf_path || null, srcBook.pages ? Number(srcBook.pages) : null,
        srcBook.authors || null, srcBook.description || null,
        srcBook.discoverable_sections ?? null, !!srcBook.is_public,
        srcBook.created_by === null || srcBook.created_by === _currentUserId,
        srcBook.series_name || null, srcBook.series_number || null,
        !!srcBook.is_container, srcBook.parent_book_id ?? null, srcBook.book_order ?? null,
      );
      // showMain/_syncSeriesRuns may have activated the wrong run (e.g. a cross-book run instead of
      // the one that lives here). Force the correct run index and re-render.
      if (targetRunIndex !== null && targetRunIndex !== undefined &&
          state.activePtIndex !== targetRunIndex && state.playthroughs[targetRunIndex]) {
        state.activePtIndex = targetRunIndex;
        saveState();
        render();
      }
      _focusNodeAfterLoad(targetSection);
    }
  });

  document.getElementById('find-node-btn').addEventListener('click', doFindNode);
  document.getElementById('find-node-input').addEventListener('keydown', e => { if (e.key === 'Enter') doFindNode(); });
  function doFindNode() {
    const input = document.getElementById('find-node-input');
    const id = parseSecId(input.value.trim());
    if (id === null || !visNodes || !visNodes.get(id)) {
      input.classList.add('not-found');
      setTimeout(() => input.classList.remove('not-found'), 800);
      return;
    }
    network.selectNodes([id]);
    network.focus(id, { scale: Math.max(network.getScale(), 1.2), animation: { duration: 400, easingFunction: 'easeInOutQuad' } });
  }

  document.getElementById('export-book-btn').addEventListener('click', exportBook);
  document.getElementById('reset-btn').addEventListener('click', () => {
      const isOw = _currentBook.isOpenWorld && _currentBook.seriesId;
      showConfirm(
        isOw ? t('confirm.reset_series') : t('confirm.reset_book'),
        async () => {
          if (isOw) {
            const r = await apiFetch(`/api/series/${_currentBook.seriesId}/reset`, { method: 'POST' }).catch(() => null);
            if (!r?.ok) { showAlert('Could not reset. Please try again.'); return; }
            clearOpenWorldState();
            resetState(); setViewingPt(null);
            // State was already reset on the server for all books; reload current book's state
            await loadState(currentBookId);
          } else {
            const ok = await resetBookProgress();
            if (!ok) { showAlert('Could not reset. Please try again.'); return; }
            setViewingPt(null);
          }
          destroyNetwork(); initGraph();
          network.on('oncontext', params => {
            params.event.preventDefault();
            const nodeId = network.getNodeAt(params.pointer.DOM);
            if (nodeId === undefined) { hideCtxMenu(); return; }
            ctxNodeId = nodeId;
            const pt     = currentPlaythrough();
            const ftLeft = pt ? (maxFastTravels() - (pt.fastTravelsUsed || 0)) : 0;
            const hasRuns2 = state.playthroughs.length > 0;
            const hasActiveRun2 = !!pt && !pt.completed;
            const showJump = pt && !pt.completed && ftLeft > 0 && !!state.graph[nodeId] && canReach(currentSection(), nodeId);
            const isStartNode2 = nodeId === (isValidSecId(state.startSection) ? state.startSection : 1);
            document.getElementById('ctx-start-node-btn').style.display = ((_isAdmin || !hasRuns2) && isStartNode2) ? '' : 'none';
            document.getElementById('ctx-edit-btn').style.display       = hasActiveRun2 ? '' : 'none';
            document.getElementById('ctx-note-btn').style.display       = hasRuns2 ? '' : 'none';
            document.getElementById('ctx-battle-btn').style.display     = hasRuns2 ? '' : 'none';
            document.getElementById('ctx-delete-btn').style.display     = (hasActiveRun2 && !isStartNode2) ? '' : 'none';
            document.getElementById('ctx-jump-wrap').style.display      = showJump ? '' : 'none';
            document.querySelectorAll('.ctx-submenu-wrap:not(#ctx-jump-wrap)').forEach(w => w.style.display = hasRuns2 ? '' : 'none');
            _updateColorSwatches(nodeId);
            _positionMenu(document.getElementById('node-ctx-menu'), params.event.clientX, params.event.clientY);
          });
          render();
          // render() itself hides the charsheet/inventory/equipment buttons
          // via their own renderXDisplay() (no active run left after a reset
          // to show data for) - showMain's normal book-load sequence forces
          // them visible again right after its own render() call for exactly
          // this reason (a book view should keep showing these buttons even
          // with no active run, same as a fresh load with zero playthroughs
          // does). Reset never replayed that force-show step, so the buttons
          // stayed hidden until the next full page load ran showMain() again.
          setCharSheetVisible(true);
          setInventoryVisible(true);
          setEquipmentVisible(true);
        },
        { confirmLabel: t('btn.reset'), danger: true },
      );
    });



  document.addEventListener('click', e => {
    if (isNotifDropdownOpen() && !e.target.closest('#notif-dropdown') && !e.target.closest('#notif-btn'))
      _closeNotifDropdown();
  });

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

  // ── Public modal ──────────────────────────────────────────────────
  // Opened from dozens of call sites across covers.js/feed.js/public-
  // profile.js itself, too many to thread a "push a history entry" call
  // through individually - watched here instead, via the one thing they
  // all share: #public-modal-overlay gaining/losing its .active class.
  // Only pushes/pops a step when a mobile panel (My Books/Add Book) is
  // already open underneath - opening the same dialog from the plain feed
  // (no panel open) is a normal top-level view, not a nested one, and
  // already had no back-button problem of its own before this. Without
  // this, back while the dialog was open over Add Book popped Add Book's
  // own history entry instead (the dialog itself was never on the stack),
  // which *looked* like the dialog surviving the panel closing under it -
  // and since the dialog had nowhere further to go on a second back press,
  // that press just kept consuming real browser history until it left the
  // app entirely.
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
      // Closed via the X/backdrop/Escape, not via back - consume the
      // pushed entry so a later back press doesn't land on a stale
      // "dialog was open" state with nothing left to close.
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
    if (e.target === document.getElementById('public-modal-overlay') && _mousedownOnOverlay === e.currentTarget) closePublicModal();
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

  // ── Browser back/forward ──────────────────────────────────────────
  window.addEventListener('popstate', async e => {
    _suppressHistory = true;
    try {
      const s = e.state;
      if (s?.view === 'book') await navigateToBook(s.bookId);
      else if (getToken())    await showBooks();
      else                    showLogin();
    } finally {
      _suppressHistory = false;
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

  // ── Tutorial video modal ──────────────────────────────────────────────────
  (function() {
    const trigger  = document.getElementById('login-video-trigger');
    const modal    = document.getElementById('video-modal');
    const backdrop = document.getElementById('video-modal-backdrop');
    const closeBtn = document.getElementById('video-modal-close');
    const frame    = document.getElementById('video-modal-frame');
    if (!trigger || !modal) return;

    function openVideoModal() {
      const iframe = document.createElement('iframe');
      iframe.src = 'https://www.youtube.com/embed/RGCu5Gdx5oU?autoplay=1&mute=1&controls=1&rel=0&modestbranding=1';
      iframe.setAttribute('allow', 'autoplay; encrypted-media; fullscreen');
      iframe.setAttribute('allowfullscreen', '');
      iframe.style.cssText = 'width:100%;height:100%;border:0;display:block;';
      frame.innerHTML = '';
      frame.appendChild(iframe);
      modal.style.display = 'flex';
      document.body.style.overflow = 'hidden';
      closeBtn.focus();
    }

    function closeVideoModal() {
      modal.style.display = 'none';
      frame.innerHTML = '';
      document.body.style.overflow = '';
    }

    trigger.addEventListener('click', openVideoModal);
    backdrop.addEventListener('click', closeVideoModal);
    closeBtn.addEventListener('click', closeVideoModal);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && modal.style.display === 'flex') closeVideoModal();
    });
  })();
});
