import { bootState } from './state.js';

export function _pushNav(hash, stateObj) {
  if (bootState._suppressHistory) return;
  const full = '#' + hash;
  // Startup occupies the launch entry; it must not add an invisible page behind home.
  const initial = !history.state?.view && !history.state?.mobilePanel;
  if (stateObj.view === 'books') {
    const panel = ['books', 'addbook'].find(name => document.body.classList.contains(`mobile-${name}-open`));
    if (panel) {
      stateObj = { ...stateObj, mobilePanel: panel };
      if (history.state?.dialogOpen) stateObj.dialogOpen = true;
    }
  }
  if (initial || history.state?.view === 'login' || location.hash === full) history.replaceState(stateObj, '', full);
  else history.pushState(stateObj, '', full);
}

export function _lockView(target, ms = 0) {
  bootState._viewLockTarget = target || null;
  bootState._viewLockUntil = ms > 0 ? Date.now() + ms : 0;
}

export function _isViewLocked(target) {
  return bootState._viewLockTarget === target && Date.now() < bootState._viewLockUntil;
}

export function _openMobilePanel(name) {
  const alreadyOpen = document.body.classList.contains('mobile-books-open') ||
                      document.body.classList.contains('mobile-addbook-open');
  document.body.classList.remove('mobile-books-open', 'mobile-addbook-open');
  document.body.classList.add(`mobile-${name}-open`);
  history[alreadyOpen ? 'replaceState' : 'pushState']({ ...history.state, mobilePanel: name }, '');
}

export function _syncMobilePanelHistory(navState) {
  document.body.classList.remove('mobile-books-open', 'mobile-addbook-open');
  if (navState?.mobilePanel === 'books' || navState?.mobilePanel === 'addbook')
    document.body.classList.add(`mobile-${navState.mobilePanel}-open`);
}
