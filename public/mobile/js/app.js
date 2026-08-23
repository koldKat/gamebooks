// app.js - Entry point + tiny screen router. Open to every logged-in user -
// no longer admin-gated (was a preview restriction, lifted once the reader
// was solid; see server.js's /mobile route comment for the route itself,
// which was always served unconditionally).
//
// No book list screen here on purpose - the desktop app's own "My Books"
// panel (categorized, searchable, already full-screen on mobile via the
// feed's My Books button) is the real one; duplicating a worse flat version
// of it here just to browse books was the wrong call. This page only ever
// deep-links straight into a single book's reader (?book=123, set by that
// same desktop "Open" button) - see books.js's book-open-btn handler.

import { getToken, apiFetch, setCurrentUserLevel, setBonusUndos, setBonusFastTravels } from '../../js/state.js';
import { renderLogin } from './auth.js';
import { renderReader } from './reader.js';
import { t } from '../../js/i18n.js';

// #screen's CSS uses calc(var(--vh, 1vh) * 100) instead of 100dvh - `dvh`
// support (and correct behavior) isn't universal, especially inside an
// in-app/embedded browser (Viber, Messenger, etc.) that reports its own
// chrome differently than a real mobile browser. On one of those, #screen
// measured taller than the actual visible area even with a 100dvh rule
// present, so the button rows at the bottom were only reachable by
// scrolling the whole page - exactly the "why can I scroll to see them,
// that's unacceptable" bug report. window.innerHeight is what every
// browser/webview agrees on as the real, currently-visible height (shrinks
// when a toolbar is showing, grows when it hides), so recomputing --vh from
// it on load/resize is the standard fix for this class of viewport-unit
// bug, independent of whether dvh itself is trustworthy here.
function _setVhVar() {
  document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
}
_setVhVar();
window.addEventListener('resize', _setVhVar);
window.addEventListener('orientationchange', _setVhVar);

const mount = document.getElementById('screen');

function showLogin() {
  mount.innerHTML = '';
  renderLogin(mount, loadThenShowReader);
}

function showReader(book) {
  mount.innerHTML = '';
  renderReader(mount, book, () => { window.location.href = '/'; });
}

function showNoBook() {
  mount.innerHTML = `
    <div class="m-login">
      <h1>${_escapeHtml(t('app.title'))}</h1>
      <p class="m-empty">${_escapeHtml(t('mobile.open_from_my_books'))}</p>
    </div>`;
}

// Mobile is reading-only on purpose (see reader.js's header comment) - a
// book with no imported text at all has nothing for this reader to do.
function showNoReading(book) {
  mount.innerHTML = `
    <div class="m-login">
      <h1>${_escapeHtml(t('app.title'))}</h1>
      <p class="m-empty">${_escapeHtml(t('mobile.no_reading', { title: book.name }))}</p>
    </div>`;
}

function _escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Shown immediately, before either of loadThenShowReader's own network
// round trips (GET /api/profile, then GET /api/books) even start - without
// this, the spinner only ever appeared once renderReader() itself ran, i.e.
// after both of those requests had already finished, leaving the actual
// slow part of the load (which can be most of it, on a slow connection) as
// a blank screen with no feedback at all.
function _showLoadingScreen() {
  mount.innerHTML = `<div class="m-loading m-loading-full"><div class="m-spinner"></div><span>${_escapeHtml(t('mobile.loading'))}</span></div>`;
}

async function loadThenShowReader() {
  _showLoadingScreen();
  try {
    const res = await apiFetch('/api/profile');
    if (res.ok) {
      const profile = await res.json();
      // Same fields boot.js's own profile fetch feeds into state.js - without
      // these, currentUserLevel/bonusUndos/bonusFastTravels stay at their
      // module defaults (0) forever on mobile, so Undo/Fast Travel always
      // show the bare level<=30 base (3) regardless of the real account.
      setCurrentUserLevel(profile.level || 0);
      setBonusUndos(profile.bonusUndos || 0);
      setBonusFastTravels(profile.bonusFastTravels || 0);
    }
  } catch (_) { /* profile fetch failed - level/bonus stay at module defaults */ }

  const wantedId = new URLSearchParams(location.search).get('book');
  if (!wantedId) { showNoBook(); return; }

  let books = [];
  try {
    const res = await apiFetch('/api/books');
    if (res.ok) books = await res.json();
  } catch (_) { /* books stays empty, falls to showNoBook below */ }
  const book = books.find(b => String(b.id) === wantedId);
  if (!book) { showNoBook(); return; }
  if (!book.hasLiveReading) { showNoReading(book); return; }
  showReader(book);
}

if (getToken()) loadThenShowReader();
else showLogin();
