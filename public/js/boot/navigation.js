import { bootState } from './state.js';

export function _pushNav(hash, stateObj) {
  if (bootState._suppressHistory) return;
  const full = '#' + hash;
  if (location.hash === full) history.replaceState(stateObj, '', full);
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
  history[alreadyOpen ? 'replaceState' : 'pushState']({ mobilePanel: name }, '');
}
