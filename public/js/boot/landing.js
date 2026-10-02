import { bootState } from './state.js';
import { state, setViewingPt, getToken, getUsername, setUsername, apiFetch, setCurrentBookId, setCurrentUserLevel, setBonusUndos, setBonusFastTravels, isDemoMode } from '../state.js';
import { destroyNetwork } from '../graph.js';
import { render, setDiscoverableLimit } from '../play.js';
import { t } from '../i18n.js';
import { setCharSheetVisible } from '../charsheet.js';
import { setInventoryVisible } from '../inventory.js';
import { setEquipmentVisible } from '../equipment.js';
import { disconnectPartySSE } from '../party.js';
import { showAuthForm, showResetPanel, hasPendingResetToken } from '../auth.js';
import { syncPrefs } from '../prefs.js';
import { hideActiveBattleSim } from '../battle-sim-loader.js';
import { setLiveReadVisible } from '../liveread.js';
import { updateCoinsDisplay } from '../shop.js';
import { updateAvatarUI, renderBooksXpSummary } from '../profile.js';
import { _ensureLiveTabControllerStarted, _connectUserBadgeSSE, _disconnectUserBadgeSSE, _connectAppXpSSE, _disconnectAppXpSSE, _syncFeedVersionBaseline } from '../livetab.js';
import { refreshAppXp } from '../app-xp.js';
import { loadCovers, _showCachedCoversPanel, _updateLandingBgDragUi } from '../covers.js';
import { renderBooksList, getCachedBooks, getCachedAllSeries, getCachedStashes, setBooksDataFresh, setBooksRevealedAt, setCurrentUserId } from '../books.js';
import { loadFeed } from '../feed.js';
import { _scheduleLiveUiRefresh, resetNotifBadgesForLogout } from '../community/notif.js';
import { _resetRewardSnapshotState, _positionRewardLayer, _processRewardSnapshot } from '../rewards.js';
import { cancelBgMove } from '../bg.js';
import { getDemoBooks, getDemoVisited } from '../demo.js';
import { resolveIsAdmin, adminBadge, authorBadge, contributorBadge, registerAuthor, registerContributor } from '../user.js';
import { escapeHtml } from '../util.js';
import { _cancelForumReveal, setDiceRollerVisible, setGuideVisible, _isMobile, _revealLanding } from './helpers.js';
import { _pushNav, _isViewLocked } from './navigation.js';
import { APP_XP_EXTRA_USER_ID } from './state.js';

export function showLogin() {
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

export function _updateUsernameTooltip() {
  const el = document.getElementById('books-username');
  if (!el) return;
  if (el.scrollWidth > el.clientWidth) {
    el.dataset.tooltip = el.textContent.trim();
  } else {
    delete el.dataset.tooltip;
  }
}

export async function showBooks() {
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
  document.getElementById('books-username').innerHTML = escapeHtml(getUsername() || '') + adminBadge(bootState._isAdmin);
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
  _syncFeedVersionBaseline();
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
    const [booksRes, profileRes, stashesRes, seriesRes] = await Promise.all([
      apiFetch('/api/books'),
      apiFetch('/api/profile'),
      apiFetch('/api/stashes'),
      apiFetch('/api/series'),
    ]);
    const books   = await booksRes.json();
    const profile = await profileRes.json();
    const stashes = stashesRes.ok ? await stashesRes.json() : [];
    const allSeries = seriesRes.ok ? await seriesRes.json() : [];
    _processRewardSnapshot(profile);
    if (profile.id) { bootState._currentUserId = profile.id; setCurrentUserId(bootState._currentUserId); }
    bootState._isAdmin = resolveIsAdmin(profile);
    bootState._canSeeAppXp = bootState._isAdmin || profile.id === APP_XP_EXTRA_USER_ID;
    bootState._hasPdfAccess = !!profile.pdfAccess || bootState._isAdmin;
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
      document.getElementById('books-username').innerHTML = escapeHtml(_dn) + adminBadge(bootState._isAdmin) + authorBadge(profile.username) + contributorBadge(profile.username);
      _updateUsernameTooltip();
    }
    await _prefsReady;
    renderBooksList(books, allSeries, Array.isArray(stashes) ? stashes : []);
    setBooksDataFresh(true);
  } catch (_) {}
}
