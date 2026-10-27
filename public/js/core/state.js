export let state = {
  bookName: '',
  totalSections: 0,
  maxSectionNumber: null,
  graph: {},
  playthroughs: [],
  activePtIndex: null,
  positions: {},
  gridLayout: false,
};

// Not persisted - tracks which completed run's path is displayed
export let viewingPt      = null;
export let viewingPtIndex = -1;

// Set by loadState; used by saveState
export let currentBookId = null;

let _onViewingPtChange = null;
export function setOnViewingPtChange(fn) { _onViewingPtChange = fn || null; }

export function setViewingPt(pt, clearStorage = false) {
  viewingPt      = pt;
  viewingPtIndex = pt ? state.playthroughs.indexOf(pt) : -1;
  if (currentBookId) {
    if (viewingPtIndex >= 0) localStorage.setItem(`vw_${currentBookId}`, viewingPtIndex);
    else if (clearStorage)   localStorage.removeItem(`vw_${currentBookId}`);
  }
  if (_onViewingPtChange) _onViewingPtChange(pt);
}
export function setCurrentBookId(id)   { currentBookId = id;  }

// Current user's level - used to compute max undos / fast travels per run
export let currentUserLevel    = 0;
export let bonusUndos          = 0;
export let bonusFastTravels    = 0;
export function setCurrentUserLevel(l)    { currentUserLevel   = l || 0; }
export function setBonusUndos(n)          { bonusUndos         = n || 0; }
export function setBonusFastTravels(n)    { bonusFastTravels   = n || 0; }

export function resetState() {
  state = {
    bookName:              state.bookName,
    totalSections:         state.totalSections,
    maxSectionNumber:      state.maxSectionNumber ?? null,
    uncountedSections:     state.uncountedSections,
    graph:                 {},
    playthroughs:          [],
    activePtIndex:         null,
    positions:             {},
    viewport:              undefined,
    charSheetTemplate:     null,
    inventoryTemplate:     null,
    dicePrefs:             null,
    alphanumericSections:  false,
  };
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export function getToken()        { return localStorage.getItem('gamebook_auth_token'); }
export function setToken(token)   { localStorage.setItem('gamebook_auth_token', token); }
export function clearToken()      { localStorage.removeItem('gamebook_auth_token'); }
export function getUsername()     { return localStorage.getItem('gamebook_username'); }
export function setUsername(name) { localStorage.setItem('gamebook_username', name); }
export function clearUsername()   { localStorage.removeItem('gamebook_username'); }

export async function apiFetch(urlPath, options = {}) {
  const token   = getToken();
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const method = String(options.method || 'GET').toUpperCase();
  const res = await fetch(urlPath, {
    ...options,
    headers,
    ...(method === 'GET' || method === 'HEAD' ? { cache: 'no-store' } : {}),
  });
  if (res.status === 503) {
    window.dispatchEvent(new Event('maintenance-mode'));
    throw new Error('Maintenance');
  }
  if (res.status === 401) {
    // Only token-bearing 401s expire sessions; guest 401s mean login is required.
    if (token) {
      clearToken();
      clearUsername();
      window.dispatchEvent(new Event('auth-expired'));
    }
    throw new Error('Unauthorized');
  }
  return res;
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

export function isTerminal(sec) { return sec === -1 || sec === 0; }

// Normalize positive integers/sentinels to numbers and alphanumeric IDs to trimmed strings.
export function parseSecId(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (s === '-1') return -1;
  if (s === '0')  return 0;
  const n = Number(s);
  if (!isNaN(n) && Number.isInteger(n) && n > 0) return n;
  return s;
}

// True for a valid non-terminal section ID (positive int or non-empty string).
export function isValidSecId(id) {
  if (id === null || id === undefined) return false;
  if (typeof id === 'number') return id > 0 && Number.isInteger(id);
  return typeof id === 'string' && id.length > 0;
}

export function currentPlaythrough() {
  if (state.activePtIndex === null) return null;
  const pt = state.playthroughs[state.activePtIndex];
  return (pt && !pt.completed) ? pt : null;
}

export function currentSection() {
  const pt = currentPlaythrough();
  return (pt && pt.path.length) ? pt.path[pt.path.length - 1] : null;
}

// Parameterized progress helpers also support books outside the active state singleton.
export function allDiscoveredSections() {
  return discoveredSectionsFor(state.graph, state.playthroughs, state.startSection);
}

export function discoveredSectionsFor(graph, playthroughs, startSection, excluded = []) {
  const startSec = isValidSecId(startSection) ? parseSecId(startSection) : 1;
  const set = new Set([startSec]);
  Object.entries(graph || {}).forEach(([sec, data]) => {
    const s = parseSecId(sec);
    if (s !== null && !isTerminal(s)) set.add(s);
    // Normalize IDs before terminal checks and deduplication; numeric strings must match numbers.
    (data.choices || []).forEach(c => {
      const cid = parseSecId(c);
      if (cid !== null && !isTerminal(cid)) set.add(cid);
    });
  });
  (playthroughs || []).forEach(pt => (pt.path || []).forEach(s => {
    const sid = parseSecId(s);
    if (sid !== null && !isTerminal(sid)) set.add(sid);
  }));
  for (const sec of excluded) set.delete(parseSecId(sec));
  return set;
}

export function mappedCount() {
  return mappedCountFor(state.graph, state.uncountedSections);
}

export function mappedCountFor(graph, excluded = []) {
  const ignored = new Set(excluded.map(parseSecId));
  return Object.keys(graph || {})
    .map(parseSecId)
    // Portal-only sections are mapped even without ordinary choices.
    .filter(s => !ignored.has(s) && isValidSecId(s) && (!graph[s]?.discovered || graph[s].choices.length > 0 || graph[s].portals?.length > 0))
    .length;
}

// Only mapped sections may be previewed; knowing a destination must not reveal unread text.
// Share this predicate across desktop and mobile.
export function isSectionMapped(secId) {
  const node = state.graph[secId];
  return !!node && (!node.discovered || (node.choices || []).length > 0 || (node.portals || []).length > 0);
}

// Serialize saves so an older response cannot overwrite newer state.
let _saveInFlight = null;
const _pendingSaves = new Map();
const _failedSaves = new Map();
const _saveOwners = new Map();
let _stateEditVersion = 0;

export function saveState() {
  if (!currentBookId) return Promise.resolve();
  _stateEditVersion++;
  _pendingSaves.set(currentBookId, JSON.stringify(state));
  _saveOwners.set(currentBookId, getToken());
  _failedSaves.delete(currentBookId);
  return _drainStateSaves();
}

export function retryStateSaves() {
  for (const [bookId, body] of _failedSaves) {
    if (_saveOwners.get(bookId) === getToken() && !_pendingSaves.has(bookId)) _pendingSaves.set(bookId, body);
  }
  return _drainStateSaves();
}

function _drainStateSaves() {
  if (_saveInFlight) return _saveInFlight;
  _saveInFlight = (async () => {
    while (_pendingSaves.size) {
      const bookId = _pendingSaves.keys().next().value;
      for (let attempt = 0; attempt < 3; attempt++) {
        if (_saveOwners.get(bookId) !== getToken()) {
          _failedSaves.set(bookId, _pendingSaves.get(bookId));
          _pendingSaves.delete(bookId);
          break;
        }
        // Retry the latest edit, never an earlier snapshot of this book.
        const body = _pendingSaves.get(bookId);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        let permanent = false;
        try {
          const res = await apiFetch(`/api/books/${bookId}/state`, {
            method: 'PUT', body, signal: controller.signal,
          });
          permanent = res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429;
          if (!res.ok) throw new Error('Book state was not saved');
          if (_pendingSaves.get(bookId) === body) {
            _pendingSaves.delete(bookId);
            window.dispatchEvent(new CustomEvent('book-state-saved', { detail: { bookId } }));
          }
          _failedSaves.delete(bookId);
          break;
        } catch (_) {
          window.dispatchEvent(new CustomEvent('book-state-save-failed', { detail: { bookId } }));
          if (permanent || attempt === 2 || !getToken()) {
            _failedSaves.set(bookId, _pendingSaves.get(bookId));
            _pendingSaves.delete(bookId);
            break;
          }
        } finally { clearTimeout(timeout); }
      }
    }
  })().finally(() => {
    _saveInFlight = null;
    if (_pendingSaves.size) _drainStateSaves();
  });
  return _saveInFlight;
}

// Navigation waits for every queued save before replacing the current book.
export async function flushStateSaves() {
  while (_saveInFlight) await _saveInFlight;
  if (_failedSaves.has(currentBookId)) throw new Error('Book state has not been saved');
}

export function hasUnsavedStateSaves() {
  return [..._pendingSaves.keys(), ..._failedSaves.keys()].some(bookId => _saveOwners.get(bookId) === getToken());
}

// Canvas drags carry coordinates only; never send an old snapshot of shared runs.
export function savePositions(positions) {
  if (!currentBookId) return Promise.resolve();
  return apiFetch(`/api/books/${currentBookId}/state`, {
    method: 'PATCH', body: JSON.stringify({ positions }),
  }).catch(() => {});
}
// Return true only after reset succeeds; callers must check before changing the graph/UI.
export function resetBookProgress() {
  if (!currentBookId) return Promise.resolve(false);
  return apiFetch(`/api/books/${currentBookId}/reset`, { method: 'POST' })
    .then(async res => {
      if (!res.ok) return false;
      state = await res.json();
      window.dispatchEvent(new CustomEvent('book-state-saved', { detail: { bookId: currentBookId } }));
      return true;
    })
    .catch(() => false);
}

export async function loadState(bookId, { strict = true, isCurrent = () => true, preservePositions = false, protectLocalChanges = false } = {}) {
  try {
    if (protectLocalChanges) await flushStateSaves();
    const editVersion = _stateEditVersion;
    const res = await apiFetch(`/api/books/${bookId}/state`);
    if (!res.ok) throw new Error('Book state unavailable');
    const loaded = await res.json();
    if (!loaded || typeof loaded !== 'object' || Array.isArray(loaded)) throw new Error('Invalid book state');
    if (!isCurrent()) return;
    if (protectLocalChanges && (editVersion !== _stateEditVersion || _failedSaves.has(bookId))) {
      throw new Error('Local edits changed during party refresh');
    }
    if (preservePositions && currentBookId === bookId) {
      loaded.positions = { ...(loaded.positions || {}), ...(state.positions || {}) };
    }
    setCurrentBookId(bookId);
    state = loaded;
  } catch (error) {
    if (strict) throw error;
    return false;
  }

  // Ensure fields added after initial release
  if (!state.graph)                      state.graph         = {};
  if (!Array.isArray(state.playthroughs)) state.playthroughs = [];
  if (!state.positions)                  state.positions     = {};
  if (state.activePtIndex === undefined) state.activePtIndex = null;
  if (state.bookName      === undefined) state.bookName      = '';
  // Ensure fields added after initial release
  if (!('charSheetTemplate' in state)) state.charSheetTemplate = null;
  if (!('inventoryTemplate' in state)) state.inventoryTemplate = null;
  if (!('dicePrefs' in state))         state.dicePrefs         = null;
  if (!('notesPinned' in state)) state.notesPinned = false;
  // Ensure each playthrough has a charSheet
  state.playthroughs.forEach(pt => {
    if (!pt.charSheet) pt.charSheet = { fields: [] };
  });
  // Ensure each playthrough has a completedAt timestamp
  state.playthroughs.forEach(pt => {
    if (pt.completed && !pt.completedAt) pt.completedAt = Date.now();
  });

  // Remove self-referential choices
  Object.entries(state.graph).forEach(([sec, data]) => {
    const id = parseSecId(sec);
    data.choices = data.choices.filter(c => c !== id);
  });

  // Move legacy terminal path entries into result.
  state.playthroughs.forEach(pt => {
    const last = pt.path[pt.path.length - 1];
    if (isTerminal(last)) {
      pt.path.pop();
      if (!pt.completed) {
        pt.completed = true;
        pt.result    = last === 0 ? 'success' : 'death';
      }
      // Repair only terminal-ending migrations; untouched open-world placeholder paths must stay empty.
      if (!pt.path.length) pt.path = [1];
    }
  });

  // Remove terminal sections from graph keys (old data may have stored them)
  delete state.graph[-1];
  delete state.graph[0];

  // Remove tag data from older saves
  if (state.tagDefs) delete state.tagDefs;
  Object.values(state.graph).forEach(data => { if (data.tags) delete data.tags; });
}
