// demo.js - Demo mode: load guest session, manage demo books, and exit

import { setDemoMode, setDemoState, getDemoState, clearDemoStore, parseSecId, getToken, setCurrentUserLevel } from './state.js?v=12';
import { destroyNetwork } from './graph.js?v=83';
import { showAlert } from './play.js?v=79';
import { fetchPublic } from './util.js?v=44';
import { t } from './i18n.js?v=36';

let _hooks = {};
export function setDemoHooks(h) { _hooks = h || {}; }

let _demoBooks       = [];
let _demoBooksNextId = 1;

export function getDemoBooks()      { return _demoBooks; }
export function setDemoBooks(b)     { _demoBooks = b; }
export function getDemoVisited(bookId) {
  const s = getDemoState(bookId);
  if (!s) return 0;
  const seen = new Set();
  (s.playthroughs || []).forEach(pt => pt.path.forEach(n => seen.add(n)));
  Object.keys(s.graph || {}).forEach(n => seen.add(parseSecId(n)));
  return seen.size;
}

function _setDemoBanner(visible) {
  document.getElementById('demo-banner').classList.toggle('active', visible);
  document.body.classList.toggle('demo-active', visible);
}

// Flags that demo mode is active so a page reload (no URL change once you've
// navigated into a book) can resume the demo instead of falling through to the
// login screen - isDemoMode itself is plain in-memory state and doesn't survive
// a reload. Session-scoped since demo progress is never persisted either way
// (startDemoMode always refetches a fresh canned state from the server).
const _DEMO_FLAG_KEY = 'demoActive';
export function wasInDemoMode() { return sessionStorage.getItem(_DEMO_FLAG_KEY) === '1'; }

export async function startDemoMode() {
  try {
    const res = await fetchPublic('/api/demo');
    if (!res.ok) throw new Error();
    const demoState = await res.json();
    setDemoMode(true);
    setCurrentUserLevel(1);
    _demoBooks       = [{ id: 'demo_1', name: 'Demo Book', total_sections: 50, isbn: null, cover_path: null }];
    _demoBooksNextId = 2;
    setDemoState('demo_1', demoState);
    _setDemoBanner(true);
    sessionStorage.setItem(_DEMO_FLAG_KEY, '1');
    await _hooks.showBooks?.();
  } catch (_) {
    showAlert(t('demo.load_failed'));
  }
}

export function exitDemoMode() {
  setDemoMode(false);
  clearDemoStore();
  _demoBooks       = [];
  _demoBooksNextId = 1;
  destroyNetwork();
  _setDemoBanner(false);
  sessionStorage.removeItem(_DEMO_FLAG_KEY);
  if (getToken()) _hooks.showBooks?.();
  else            _hooks.showLogin?.();
}
