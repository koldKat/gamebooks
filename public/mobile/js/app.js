// Mobile reader entry and screen routing.
// Deep-link into a book; reuse the main app's library instead of duplicating it.

import { getToken, apiFetch, setCurrentUserLevel, setBonusUndos, setBonusFastTravels } from '../../js/core/state.js';
import { renderLogin } from './auth.js';
import { renderReader } from './reader.js';
import { t } from '../../js/i18n.js';

// Measure --vh from innerHeight for embedded browsers with unreliable viewport units.
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
  window.appStartup?.ready();
}

async function showReader(book) {
  mount.innerHTML = '';
  await renderReader(mount, book, () => { window.location.href = '/'; });
  window.appStartup?.ready();
}

function showNoBook() {
  mount.innerHTML = `
    <div class="m-login">
      <h1>${_escapeHtml(t('app.title'))}</h1>
      <p class="m-empty">${_escapeHtml(t('mobile.open_from_my_books'))}</p>
    </div>`;
  window.appStartup?.ready();
}

// This reader requires imported text; it has no manual section-entry mode.
function showNoReading(book) {
  mount.innerHTML = `
    <div class="m-login">
      <h1>${_escapeHtml(t('app.title'))}</h1>
      <p class="m-empty">${_escapeHtml(t('mobile.no_reading', { title: book.name }))}</p>
    </div>`;
  window.appStartup?.ready();
}

function _escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Show loading feedback before profile and library requests start.
function _showLoadingScreen() {
  mount.innerHTML = `<div class="m-loading m-loading-full">
    <svg class="mlg-graph" viewBox="0 0 32 32">
      <line x1="16" y1="16" x2="6"  y2="7"  stroke="#4b5563" stroke-width="1.8" stroke-linecap="round"/>
      <line x1="16" y1="16" x2="26" y2="7"  stroke="#4b5563" stroke-width="1.8" stroke-linecap="round"/>
      <line x1="16" y1="16" x2="6"  y2="26" stroke="#4b5563" stroke-width="1.8" stroke-linecap="round"/>
      <line x1="16" y1="16" x2="26" y2="26" stroke="#4b5563" stroke-width="1.8" stroke-linecap="round"/>
      <circle class="mlg-node mlg-n1" cx="6"  cy="7"  r="4" fill="#8e44ad" stroke="#6c3483" stroke-width="1.2"/>
      <circle class="mlg-node mlg-n2" cx="26" cy="7"  r="4" fill="#e74c3c" stroke="#c0392b" stroke-width="1.2"/>
      <circle class="mlg-node mlg-n3" cx="6"  cy="26" r="4" fill="#3498db" stroke="#2980b9" stroke-width="1.2"/>
      <circle class="mlg-node mlg-n4" cx="26" cy="26" r="4" fill="#27ae60" stroke="#1e8449" stroke-width="1.2"/>
      <circle class="mlg-center" cx="16" cy="16" r="6" fill="#f5a623" stroke="#c47d00" stroke-width="1.5"/>
    </svg>
    <span>${_escapeHtml(t('mobile.loading'))}</span>
  </div>`;
}

async function loadThenShowReader() {
  // Restart heartbeat on login as well as initial load; its timer guard makes this idempotent.
  _startHeartbeat();
  _showLoadingScreen();
  try {
    const res = await apiFetch('/api/profile');
    if (res.ok) {
      const profile = await res.json();
      // Initialize level and purchased bonuses so mobile undo/travel limits match desktop.
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
  try {
    await showReader(book);
  } catch (error) {
    console.error('Mobile reader startup failed', error);
    window.appStartup?.fail();
    mount.innerHTML = `<div class="m-login"><p class="m-error">${_escapeHtml(t('auth.network_error'))}</p>
      <button id="m-load-back" type="button">${_escapeHtml(t('mobile.back_home'))}</button></div>`;
    document.getElementById('m-load-back').addEventListener('click', () => { window.location.href = '/'; });
  }
}

// Heartbeat runs on every authenticated screen; the server deduplicates awards per minute.
let _heartbeatTimer = null;
function _startHeartbeat() {
  if (_heartbeatTimer) return;
  _heartbeatTimer = setInterval(() => { apiFetch('/api/heartbeat', { method: 'POST' }).catch(() => {}); }, 60_000);
}
function _stopHeartbeat() {
  if (_heartbeatTimer) { clearInterval(_heartbeatTimer); _heartbeatTimer = null; }
}

// Return to login on auth expiry instead of leaving stale reading content.
window.addEventListener('auth-expired', () => { _stopHeartbeat(); showLogin(); });

if (getToken()) loadThenShowReader();
else showLogin();
