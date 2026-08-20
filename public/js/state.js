export let state = {
  bookName: '',
  totalSections: 0,
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
    clearToken();
    clearUsername();
    window.dispatchEvent(new Event('auth-expired'));
    throw new Error('Unauthorized');
  }
  return res;
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

export function isTerminal(sec) { return sec === -1 || sec === 0; }

// Convert raw input / graph key to a canonical section ID.
// Pure positive integers  → Number.  Alphanumeric strings → trimmed String.
// "-1" / "0" (and their number forms) → Number sentinel.
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

// Generic forms of allDiscoveredSections()/mappedCount() below, parameterized so they
// can also be run against a book's state fetched independently of the live `state`
// singleton (e.g. editing a book from the books list without opening it) - see
// discoveredSectionsFor/mappedCountFor.
export function allDiscoveredSections() {
  return discoveredSectionsFor(state.graph, state.playthroughs, state.startSection);
}

export function discoveredSectionsFor(graph, playthroughs, startSection) {
  const startSec = isValidSecId(startSection) ? parseSecId(startSection) : 1;
  const set = new Set([startSec]);
  Object.entries(graph || {}).forEach(([sec, data]) => {
    const s = parseSecId(sec);
    if (s !== null && !isTerminal(s)) set.add(s);
    // parseSecId() first, then isTerminal() on the parsed value - a choices
    // array entry isn't guaranteed to already be a number the way a graph
    // key already is above. Checking isTerminal() on the raw value would
    // miss a string-typed "-1"/"0" sentinel (isTerminal does a strict ===
    // against the number forms), and skipping parseSecId entirely would let
    // a numeric-looking string section (e.g. "88") into this Set alongside
    // its already-number-typed twin from elsewhere, as two separate entries
    // for what's really one section - every consumer of this Set (mobile's
    // graph-view.js among them) has to treat them as one and the same.
    (data.choices || []).forEach(c => {
      const cid = parseSecId(c);
      if (cid !== null && !isTerminal(cid)) set.add(cid);
    });
  });
  (playthroughs || []).forEach(pt => (pt.path || []).forEach(s => {
    const sid = parseSecId(s);
    if (sid !== null && !isTerminal(sid)) set.add(sid);
  }));
  return set;
}

export function mappedCount() {
  return mappedCountFor(state.graph);
}

export function mappedCountFor(graph) {
  return Object.keys(graph || {})
    .map(parseSecId)
    // A section whose only way forward is a portal has nothing to record as a
    // choice (portals live in node.portals[], separate from node.choices[]) -
    // without the portals check it would sit as "discovered only" forever,
    // even though it's been fully visited and explored.
    .filter(s => isValidSecId(s) && (!graph[s]?.discovered || graph[s].choices.length > 0 || graph[s].portals?.length > 0))
    .length;
}

// ── Demo mode ─────────────────────────────────────────────────────────────────

export let isDemoMode = false;
export function setDemoMode(val) { isDemoMode = val; }

let _demoStateStore = {};
export function setDemoState(id, data) { _demoStateStore[id] = data; }
export function getDemoState(id)       { return _demoStateStore[id] || null; }
export function clearDemoStore()       { _demoStateStore = {}; }

// ── Persistence ───────────────────────────────────────────────────────────────

// Fire-and-forget: returns a Promise but callers need not await it.
// Saves are serialized: if one is already in flight, this call is queued and
// re-issued (with whatever `state` looks like by then) once it finishes.
// Without this, two overlapping saves can complete out of order and the
// slower one (holding an older snapshot) would overwrite the newer one on
// the server, silently reverting edits like renames/notes/quantities.
let _saveInFlight = null;
let _saveQueued   = false;

export function saveState() {
  if (isDemoMode) {
    if (currentBookId) _demoStateStore[currentBookId] = JSON.parse(JSON.stringify(state));
    return Promise.resolve();
  }
  if (!currentBookId) return Promise.resolve();
  if (_saveInFlight) {
    _saveQueued = true;
    return _saveInFlight;
  }
  const bookId = currentBookId;
  _saveInFlight = apiFetch(`/api/books/${bookId}/state`, {
    method: 'PUT',
    body:   JSON.stringify(state),
  })
    .then(() => {
      window.dispatchEvent(new CustomEvent('book-state-saved', { detail: { bookId } }));
    })
    .catch(() => {})
    .finally(() => {
      _saveInFlight = null;
      if (_saveQueued) {
        _saveQueued = false;
        saveState();
      }
    });
  return _saveInFlight;
}

// Resolves true only once the server has actually confirmed the reset (or, in demo
// mode, once the local demo store has been overwritten) - callers must check this
// before touching the graph/UI, rather than assuming the reset succeeded.
export function resetBookProgress() {
  if (isDemoMode) {
    if (!currentBookId) return Promise.resolve(false);
    state = _emptyState();
    _demoStateStore[currentBookId] = JSON.parse(JSON.stringify(state));
    window.dispatchEvent(new CustomEvent('book-state-saved', { detail: { bookId: currentBookId } }));
    return Promise.resolve(true);
  }
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

export async function loadState(bookId) {
  setCurrentBookId(bookId);
  if (isDemoMode) {
    const saved = _demoStateStore[bookId];
    state = saved ? JSON.parse(JSON.stringify(saved)) : _emptyState();
    return;
  }
  try {
    const res = await apiFetch(`/api/books/${bookId}/state`);
    if (!res.ok) { state = _emptyState(); return; }
    state = await res.json();
  } catch (_) {
    state = _emptyState();
    return;
  }

  // Ensure fields added after initial release
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

  // Migrate: -1/0 used to be pushed onto paths - move them to result instead
  state.playthroughs.forEach(pt => {
    const last = pt.path[pt.path.length - 1];
    if (isTerminal(last)) {
      pt.path.pop();
      if (!pt.completed) {
        pt.completed = true;
        pt.result    = last === 0 ? 'success' : 'death';
      }
      // Only for a run actually going through this migration (had a terminal
      // sentinel as its only path entry) - was unconditional on ANY empty path,
      // which ran on every single load of every book and stamped path: [1] onto
      // every never-played open-world series-run placeholder (startedAt: null)
      // the instant that book was merely opened, regardless of whether anyone
      // touched it. That single line was the real root cause behind every
      // "phantom placeholder looks touched" bug found this session - not the
      // other, narrower ones already patched.
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

function _emptyState() {
  return {
    bookName:             '',
    totalSections:        0,
    graph:                {},
    playthroughs:         [],
    activePtIndex:        null,
    positions:            {},
    gridLayout:           false,
    viewport:             undefined,
    charSheetTemplate:    null,
    inventoryTemplate:    null,
    dicePrefs:            null,
    alphanumericSections: false,
  };
}
