// app.js - Entry point + tiny screen router. Admin-only for now (see
// server.js's /mobile route comment) - checked here via GET /api/profile
// rather than server-side, since a bare page load can't carry an auth
// token yet. Not a hard security boundary, just keeps this out of the way
// for everyone else while it's a preview.
//
// No book list screen here on purpose - the desktop app's own "My Books"
// panel (categorized, searchable, already full-screen on mobile via the
// feed's My Books button) is the real one; duplicating a worse flat version
// of it here just to browse books was the wrong call. This page only ever
// deep-links straight into a single book's reader (?book=123, set by that
// same desktop "Open" button) - see books.js's book-open-btn handler.

import { getToken, clearToken, apiFetch } from '../../js/state.js?v=14';
import { renderLogin } from './auth.js?v=5';
import { renderReader } from './reader.js?v=19';
import { t } from '../../js/i18n.js?v=73';

const mount = document.getElementById('screen');

function showLogin() {
  mount.innerHTML = '';
  renderLogin(mount, checkAdminThenShowReader);
}

function showReader(book) {
  mount.innerHTML = '';
  renderReader(mount, book, () => { window.location.href = '/'; });
}

function showNotAdmin() {
  mount.innerHTML = `
    <div class="m-login">
      <h1>${_escapeHtml(t('app.title'))}</h1>
      <p class="m-empty">${_escapeHtml(t('mobile.not_admin'))}</p>
    </div>`;
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

async function checkAdminThenShowReader() {
  let isAdmin = false;
  try {
    const res = await apiFetch('/api/profile');
    if (res.ok) isAdmin = !!(await res.json()).isAdmin;
  } catch (_) { /* isAdmin stays false */ }
  if (!isAdmin) { clearToken(); showNotAdmin(); return; }

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

if (getToken()) checkAdminThenShowReader();
else showLogin();
