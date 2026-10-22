import { bootState } from './state.js';
import { state, setViewingPt, getToken, setUsername, apiFetch, setCurrentBookId, setCurrentUserLevel, setBonusUndos, setBonusFastTravels } from '../core/state.js';
import { destroyNetwork } from '../graph.js';
import { render, setDiscoverableLimit } from '../play.js';
import { t } from '../i18n.js';
import { setCharSheetVisible } from '../play/charsheet.js';
import { setInventoryVisible } from '../inventory.js';
import { setEquipmentVisible } from '../equipment.js';
import { disconnectPartySSE } from '../play/party.js';
import { showAuthForm, showResetPanel, hasPendingResetToken } from '../account/auth.js';
import { syncPrefs, restoreCachedPrefs } from '../ui-helpers/prefs.js';
import { hideActiveBattleSim } from '../battlesim/loader.js';
import { setLiveReadVisible } from '../reading/liveread.js';
import { updateCoinsDisplay } from '../progression/shop.js';
import { updateAvatarUI, renderBooksXpSummary, closeProfileModal } from '../account/profile.js';
import { _ensureLiveTabControllerStarted, _connectUserBadgeSSE, _disconnectUserBadgeSSE, _connectAppXpSSE, _disconnectAppXpSSE, _syncFeedVersionBaseline } from '../core/livetab.js';
import { refreshAppXp } from '../progression/app-xp.js';
import { loadCovers, _showCachedCoversPanel, _updateLandingBgDragUi } from '../covers.js';
import { renderBooksList, getCachedBooks, getCachedAllSeries, getCachedStashes, setBooksDataFresh, setBooksRevealedAt, setCurrentUserId, setActiveSeriesRuns } from '../books.js';
import { loadFeed, refreshFeedFilters } from '../feed.js';
import { _scheduleLiveUiRefresh, resetNotifBadgesForLogout } from '../community/notif.js';
import { _resetRewardSnapshotState, _positionRewardLayer, _processRewardSnapshot, _restoreRewardSnapshot } from '../progression/rewards.js';
import { cancelBgMove } from '../play/bg.js';
import { resolveIsAdmin, registerAuthor, registerContributor, registerModerator, registerSquire, resolveIsModerator } from '../account/user.js';
import { _cancelForumReveal, setDiceRollerVisible, setGuideVisible, _isMobile, _revealLanding } from './helpers.js';
import { _pushNav, _isViewLocked } from './navigation.js';
import { APP_XP_EXTRA_USER_ID } from './state.js';

export function showLogin() {
  closeProfileModal();
  _revealLanding();
  _ensureLiveTabControllerStarted();
  _disconnectUserBadgeSSE();
  _disconnectAppXpSSE();
  _resetRewardSnapshotState();
  resetNotifBadgesForLogout();
  setCharSheetVisible(false);
  setInventoryVisible(false);
  setEquipmentVisible(false);
  hideActiveBattleSim();
  setLiveReadVisible(false);
  setDiceRollerVisible(false);
  setGuideVisible(false);
  if (_isMobile()) document.body.classList.add('mobile-auth');
  document.body.classList.remove('guest-browsing');
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
  _syncFeedVersionBaseline();
  _showCachedCoversPanel();
  loadCovers();
  _updateLandingBgDragUi();
}

export async function loadSessionProfile(sessionToken = getToken()) {
  try {
    const response = await apiFetch('/api/profile');
    if (!response.ok) return null;
    const profile = await response.json();
    if (getToken() !== sessionToken) return null;
    _processRewardSnapshot(profile);
    if (profile.id) { bootState._currentUserId = profile.id; setCurrentUserId(bootState._currentUserId); }
    bootState._isAdmin = resolveIsAdmin(profile);
    bootState._canSeeAppXp = bootState._isAdmin || profile.id === APP_XP_EXTRA_USER_ID;
    bootState._hasPdfAccess = !!profile.pdfAccess || bootState._isAdmin;
    refreshAppXp({ immediate: true });
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
      registerModerator(profile.username, !!profile.isModerator);
      registerSquire(profile.username, !!profile.isSquire);
    }
    refreshFeedFilters();
    return profile;
  } catch (_) { return null; }
}

export async function showBooks() {
  if (_isViewLocked('book')) return;
  const sessionToken = getToken();
  _restoreRewardSnapshot();
  const profileReady = loadSessionProfile(sessionToken);
  // Close the forum on library navigation, regardless of the initiating dialog.
  document.getElementById('forum-modal-overlay')?.classList.remove('active');
  _cancelForumReveal();
  _revealLanding();
  _ensureLiveTabControllerStarted();
  if (!getCachedBooks()) restoreCachedPrefs();
  const _prefsReady = syncPrefs({ renderBooks: false });
  if (document.activeElement instanceof HTMLElement && document.activeElement.closest('#login-screen')) {
    document.activeElement.blur();
  }
  setCharSheetVisible(false);
  setInventoryVisible(false);
  setEquipmentVisible(false);
  hideActiveBattleSim();
  setLiveReadVisible(false);
  setDiceRollerVisible(false);
  setGuideVisible(false);
  document.body.classList.remove('mobile-auth');
  document.body.classList.remove('guest-browsing');
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
  _syncFeedVersionBaseline();
  _showCachedCoversPanel();
  loadCovers();
  _updateLandingBgDragUi();
  try { disconnectPartySSE(); } catch (_) {}
  if (getToken()) { _scheduleLiveUiRefresh({ party: true }, 60); }

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

  // Cached content is usable immediately; initial routing still waits for refresh.
  if (getCachedBooks()) window.appStartup?.ready();

  try {
    const [booksRes, , stashesRes, seriesRes, activeRunsRes] = await Promise.all([
      apiFetch('/api/books'),
      profileReady,
      apiFetch('/api/stashes'),
      apiFetch('/api/series'),
      apiFetch('/api/series/active-runs').catch(() => null),
    ]);
    if (getToken() !== sessionToken) return;
    const books   = await booksRes.json();
    const stashes = stashesRes.ok ? await stashesRes.json() : [];
    const allSeries = seriesRes.ok ? await seriesRes.json() : [];
    const activeRuns = activeRunsRes?.ok ? await activeRunsRes.json().catch(() => null) : null;
    if (getToken() !== sessionToken) return;
    if (Array.isArray(activeRuns)) setActiveSeriesRuns(activeRuns);
    await _prefsReady;
    if (getToken() !== sessionToken) return;
    renderBooksList(books, allSeries, Array.isArray(stashes) ? stashes : []);
    setBooksDataFresh(true);
  } catch (_) {}
}
