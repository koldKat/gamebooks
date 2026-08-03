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
} from './state.js?v=11';
import {
  network, visNodes, initGraph, destroyNetwork,
  subtreeToDelete, deleteNodes, findPathTo, canReach, setGraphOpenWorld, applyConnectorStyle,
} from './graph.js?v=70';
import { render, openEditModal, closeEditModal, openNoteModal, closeNoteModal, showConfirm, showAlert, confirmAlphanumericSwitch, maxFastTravels, setFastTravelHandler, showFastTravelDialog, setOnTrailToggle, openPortalModal, setDiscoverableLimit, setOnChoicesRecorded, startPlaythrough, setAltStartHandler } from './play.js?v=61';
import { t, applyTranslations, setTranslationOverride } from './i18n.js?v=28';
import { initCharSheet, setCharSheetVisible, renderCharSheetDisplay } from './charsheet.js?v=52';
import { initInventory, setInventoryVisible, renderInventoryDisplay, preloadItems, setExtraDisplayItemsProvider } from './inventory.js?v=120';
import { initEquipment, setEquipmentVisible, getVisibleEquippedItems } from './equipment.js?v=107';
import { initNotes, hideNotesUI, loadNotesForBook, setOnXpAwarded as setNotesOnXpAwarded } from './notes.js?v=41';
import { initParty, connectPartySSE, disconnectPartySSE, loadPartyInvites, setPartyHooks } from './party.js?v=95';
import { initAuth, setOnAuthSuccess, showAuthForm, showResetPanel, hasPendingResetToken } from './auth.js?v=36';
import { initStats, closeStatsModal } from './stats.js?v=55';
import { setAddBookHooks, initAddBook, _closeAddBook, _closeAddComp, _closeAddSeries } from './add-book.js?v=119';
import {
  setEditBookHooks, initEditBook,
  openEditBookModal, closeEditBookModal, openEditCompModal, openEditSeriesModal,
  _openEditStash, _closeEditStash, _closeAddStash,
  _adminPdfHref,
  maxSectionInUse,
} from './edit-book.js?v=119';
import {
  setPrefsHooks, savePrefs, syncPrefs,
  _setLandingPanelCollapsed, _toggleAllLandingPanelsCollapsed,
  _setPlayPanelCollapsed, _toggleAllPlayPanelsCollapsed,
} from './prefs.js?v=107';
import { initBattleSim, setBattleSimVisible, renderBattleSim } from './battlesim/battlesim829.js?v=119';
import { initBattleSim8, setSim8Visible, renderSim8 } from './battlesim/battlesim8.js?v=91';
import { initSim286, setSim286Visible, renderSim286 } from './battlesim/battlesim286.js?v=50';
import { initSim198, setSim198Visible, renderSim198 } from './battlesim/battlesim198.js?v=33';
import { initSim199, setSim199Visible, renderSim199 } from './battlesim/battlesim199.js?v=26';
import { initSim200, setSim200Visible, renderSim200 } from './battlesim/battlesim200.js?v=16';
import { initSim186, setSim186Visible, renderSim186 } from './battlesim/battlesim186.js?v=17';
import { initSim201, setSim201Visible, renderSim201 } from './battlesim/battlesim201.js?v=19';
import { initSim202, setSim202Visible, renderSim202 } from './battlesim/battlesim202.js?v=2';
import { initShop, updateCoinsDisplay, refreshCoinsDisplay, setShopHooks } from './shop.js?v=42';
import { initProfile, updateAvatarUI, renderBooksXpSummary, setProfileHooks } from './profile.js?v=58';
import { setPublicProfileHooks, closePublicModal, openPublicProfile, openPublicSeriesRun } from './public-profile.js?v=49';
import { setLiveTabHooks, _ensureLiveTabControllerStarted, _connectUserBadgeSSE, _disconnectUserBadgeSSE, _connectAppXpSSE, _disconnectAppXpSSE } from './livetab.js?v=47';
import { setAppXpHooks, refreshAppXp, handleAppXpEvent } from './app-xp.js?v=46';
import { setCoversHooks, loadCovers, openCoverActivity, openSeriesActivity, _showCachedCoversPanel, _refreshPublicCatalogIfVisible, _isLandingBooksViewVisible, _updateLandingBgDragUi, setCoversPrefsState, _toggleCoverTooltipSettings, initCoversPanel, resetFeedDisplayPrefsForLogout } from './covers.js?v=80';
import {
  setBooksHooks, initBooksPanel, renderBooksList,
  getCachedBooks, getCachedAllSeries, getCachedStashes,
  setCachedBooks, setCachedAllSeries, clearBooksCache,
  setBooksDataFresh, setBooksRevealedAt,
  setCurrentUserId,
  _refreshBooksListOnly, _refreshLibraryUi, _starsHtml, _starLabelHtml, _flashRatingGate,
} from './books.js?v=108';
import {
  setOpenWorldHooks, setupOpenWorldForBook,
  _syncSeriesRuns, _computeCrossBookReachability, _focusNodeAfterLoad,
  clearOpenWorldState, doJumpCrossBook,
  getOwSrcBookId, getOwSrcSection, getOwCrossBookRoute,
} from './open-world.js?v=107';
import { setFeedHooks, loadFeed, refreshDayCoverFlows } from './feed.js?v=100';
import {
  setNotifHooks, _scheduleLiveUiRefresh,
  _closeNotifDropdown, _openNotifDropdown, isNotifDropdownOpen,
  resetNotifBadgesForLogout,
} from './notif.js?v=40';
import {
  _resetRewardSnapshotState, _positionRewardLayer,
  _processRewardSnapshot, _scheduleRewardProfileRefresh,
} from './rewards.js?v=59';
import {
  setBgHooks, setCurrentBookCover, getCurrentBookCover,
  resetBgState, cancelBgMove, isBgInMove,
  toggleBgHidden, nudgeBgPosY,
  hideCtxMenu, _updateSidebarBookInfo, _hideBgCtxMenu,
  _positionMenu, _setupCtxSubmenuFlip, _showBgCtxMenu,
  _enterBgMoveMode, _exitBgMoveMode, _updateColorSwatches,
} from './bg.js?v=19';
import { initTips } from './tips.js?v=27';
import { initInbox } from './inbox.js?v=70';
import { initDice } from './dice.js?v=101';
import { initTooltip } from './tooltip.js?v=1';
import { exportAll, exportBook } from './export.js?v=66';
import { initFeedback } from './feedback.js?v=35';
import { setDemoHooks, getDemoBooks, setDemoBooks, getDemoVisited, startDemoMode, exitDemoMode, wasInDemoMode } from './demo.js?v=63';
import {
  setAdminUsername, resolveIsAdmin,
  adminBadge, authorBadge, contributorBadge, displayFor,
  registerAuthor, registerContributor,
} from './user.js?v=6';
import { escapeHtml, fetchPublic as publicFetch } from './util.js?v=35';

window._isMobile = /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  || (navigator.maxTouchPoints > 1 && window.innerWidth < 1024);


// ── Edit book modal ───────────────────────────────────────��───────────────────

let _isAdmin               = false;
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

// Hides the Demo button once a user has at least one win and one loss
// recorded - by that point they've clearly played the real app enough that a
// demo book isn't useful. "Loss" here is a plain death (result: 'death', the
// -1 ending), not a battle death.
async function _updateDemoBtnVisibility() {
  try {
    const res = await apiFetch('/api/profile');
    if (!res.ok) return;
    const data = await res.json();
    const btn = document.getElementById('demo-btn');
    if (btn) btn.style.display = ((data.wins || 0) >= 1 && (data.deaths || 0) >= 1) ? 'none' : '';
  } catch (_) {}
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
  ['landing-wrapper','landing-bg-a','landing-bg-b'].forEach(id => {
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

async function showBooks() {
  if (_isViewLocked('book')) return;
  // Reachable from deep inside the public book/series detail dialog (e.g.
  // "Add series to library"), which can now stay open on top of the forum
  // instead of closing it - a freshly-shown books screen should never have
  // an unrelated forum modal still sitting over it regardless of how this
  // got called, so close it unconditionally here rather than patching every
  // individual call site that might reach this with the forum still open.
  document.getElementById('forum-modal-overlay')?.classList.remove('active');
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
  document.getElementById('books-username').innerHTML = escapeHtml(getUsername() || '') + adminBadge(getUsername());
  _updateUsernameTooltip();
  document.getElementById('feedback-btn').style.display = '';
  document.getElementById('forum-btn').style.display    = '';
  document.getElementById('inbox-btn').style.display    = getToken() ? '' : 'none';
  document.getElementById('notif-btn').style.display    = getToken() ? '' : 'none';
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
  if (getToken() && !isDemoMode) _updateDemoBtnVisibility();

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
      document.getElementById('books-username').innerHTML = escapeHtml(_dn) + adminBadge(profile.username) + authorBadge(profile.username) + contributorBadge(profile.username);
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
    if (nodeId === undefined) { hideCtxMenu(); _showBgCtxMenu(params.event.clientX, params.event.clientY); return; }
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
  const closeForumModal = () => forumOverlay.classList.remove('active');
  const openForumModal = (url = '/forum') => {
    // Clicking a link inside the iframe navigates its contentWindow but never
    // touches the <iframe> element's own src attribute - so comparing against
    // getAttribute('src') always saw the original '/forum' and skipped
    // re-navigating, leaving the modal reopen wherever a PREVIOUS user last
    // clicked to (e.g. a category or thread), not the forum home. Reset via
    // contentWindow.location, which reflects where the iframe actually is.
    try { forumFrame.contentWindow.location.replace(url); }
    catch (_) { forumFrame.setAttribute('src', url); }
    forumOverlay.classList.add('active');
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
      document.getElementById('books-username').innerHTML = escapeHtml(dn || '') + adminBadge(data.username) + authorBadge(data.username) + contributorBadge(data.username);
      _updateUsernameTooltip();
    },
    getMousedownOverlay:   () => _mousedownOnOverlay,
  });
  initProfile();
  setPublicProfileHooks({
    publicFetch,
    adminBadge,
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
    lockView:            _lockView,
    navigateToBook,
    displayFor,
    adminBadge,
    authorBadge,
    contributorBadge,
    onFavoriteToggled:   () => _scheduleRewardProfileRefresh(250),
    refreshDayCovers:    refreshDayCoverFlows,
  });
  setFeedHooks({
    publicFetch,
    scheduleRewardProfileRefresh: _scheduleRewardProfileRefresh,
    displayFor,
    adminBadge,
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
  });
  setAppXpHooks({
    getIsAdmin: () => _isAdmin,
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
    clearToken(); clearUsername(); _isAdmin = false; setCoversPrefsState({}); resetFeedDisplayPrefsForLogout(); showLogin();
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

  function _pruneDiscovered(id) {
    const n = state.graph[id];
    if (n?.discovered && !n.note && !n.priority && !n.battle && !n.color) delete state.graph[id];
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
    if (network) network.focus(id, { animation: true, scale: 1.2 });
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

  // ── Public modal ──────────────────────────────────────────────────
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
