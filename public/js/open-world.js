// ── Open-world series runs: sync, portal travel, cross-book reachability ──────
// Owns all cross-book state and the handler functions. Wires the
// setOpenWorldContext/setOnViewPublicRun/setOnCharSheetSaved callbacks for
// whichever book is currently loaded. Also owns cross-book fast travel.

import {
  state, saveState, apiFetch, isValidSecId, setViewingPt, currentPlaythrough, currentBookId,
} from './state.js?v=13';
import {
  network, visNodes, setGraphCrossBookRoute,
  canReachInGraph, allReachableInGraph, clampViewportScale, findPathTo,
} from './graph.js?v=84';
import {
  render, showAlert, startPortalRun, startPlaythrough, setOpenWorldContext, setOnViewPublicRun,
} from './play.js?v=80';
import { t } from './i18n.js?v=36';
import { setOnCharSheetSaved } from './charsheet.js?v=62';
import { instantiateLoadout } from './equipment.js?v=126';
import { getCachedBooks } from './books.js?v=129';

let _hooks = {};
export function setOpenWorldHooks(h) { _hooks = h || {}; }

// ── State ─────────────────────────────────────────────────────────────────────
let _owSrcBookId    = null; // book where the active series run currently lives
let _owSrcSection   = null; // current section in that source book
let _owSrcBookState = null; // full state object of the source book (fetched async)
let _owCrossBookRoute = null; // Map<targetSection, {srcPortalSection, portal, entrySection}>
let _cachedSeriesRuns = null; // last result of _syncSeriesRuns, reused by onRunActivated

export function getOwSrcBookId()      { return _owSrcBookId; }
export function getOwSrcSection()     { return _owSrcSection; }
export function getOwCrossBookRoute() { return _owCrossBookRoute; }

export function clearOpenWorldState() {
  _owSrcBookId      = null;
  _owSrcSection     = null;
  _owSrcBookState   = null;
  _owCrossBookRoute = null;
  _cachedSeriesRuns = null;
  setGraphCrossBookRoute(null);
}

// ── Series runs sync ──────────────────────────────────────────────────────────
// Ensures this book's playthroughs[] has one slot per series run.
// Runs that pre-date the series join are moved to state.preSeriesRuns and
// shown as Run -1, -2, etc. Returns the series runs array, or null on failure.
export async function _syncSeriesRuns(seriesId) {
  if (!seriesId) return null;
  const r = await apiFetch(`/api/series/${seriesId}/runs`).catch(() => null);
  if (!r?.ok) return null;
  const seriesRuns = await r.json().catch(() => null);
  if (!Array.isArray(seriesRuns)) return null;

  let needsSave = false;

  // One-time migration: identify pre-series runs
  if (state.preSeriesRuns === undefined) {
    const minSeriesTs = seriesRuns.length > 0
      ? Math.min(...seriesRuns.map(sr => (sr.started_at || 0) * 1000).filter(x => x > 0))
      : 0;
    const toMigrate = state.playthroughs.filter(p =>
      p.startedAt && (minSeriesTs === 0 || p.startedAt < minSeriesTs) &&
      (p.path?.length > 0 || p.completed)
    );
    state.preSeriesRuns = toMigrate;
    if (toMigrate.length > 0) {
      // Same activePtIndex-adjustment care as the prune loop below - without
      // this, an in-progress run migrated out from under activePtIndex would
      // either point past the end of the shrunk array, or (worse) silently
      // land on a *different* surviving playthrough that shifted into that
      // same index, letting the player unknowingly resume the wrong run.
      const toMigrateSet = new Set(toMigrate);
      const activePt = typeof state.activePtIndex === 'number' ? state.playthroughs[state.activePtIndex] : null;
      state.playthroughs = state.playthroughs.filter(p => !toMigrateSet.has(p));
      if (activePt && toMigrateSet.has(activePt)) {
        state.activePtIndex = null;
      } else if (activePt) {
        state.activePtIndex = state.playthroughs.indexOf(activePt);
      }
    }
    needsSave = true;
  }

  const needed  = seriesRuns.length;
  const current = state.playthroughs.length;

  if (needed > current) {
    for (let i = current; i < needed; i++) {
      const sr = seriesRuns[i];
      const { inventory: invTmpl, equipment: eqTmpl, equipmentVisible: eqVisTmpl } = instantiateLoadout();
      state.playthroughs.push({
        path: [], completed: false, result: null,
        undosUsed: 0, fastTravelsUsed: 0,
        startedAt: null,
        charSheet: sr.char_data || { fields: [] },
        inventory: invTmpl,
        equipment: eqTmpl,
        equipmentVisible: eqVisTmpl,
        diceState: { count: state.dicePrefs?.count ?? 2, die: state.dicePrefs?.die ?? 6, lastResult: null },
      });
    }
  } else if (current > needed) {
    const toPrune = [];
    for (let i = needed; i < current; i++) {
      const pt = state.playthroughs[i];
      if (pt && (pt.result === 'portal' || (!pt.completed && pt.path.length === 0))) {
        toPrune.push(i);
      } else {
        await apiFetch(`/api/series/${seriesId}/runs`, { method: 'POST' }).catch(() => {});
      }
    }
    for (let i = toPrune.length - 1; i >= 0; i--) {
      const pruneIdx = toPrune[i];
      state.playthroughs.splice(pruneIdx, 1);
      if (state.activePtIndex === pruneIdx) {
        state.activePtIndex = null;
      } else if (typeof state.activePtIndex === 'number' && state.activePtIndex > pruneIdx) {
        state.activePtIndex -= 1;
      }
    }
    if (toPrune.length > 0) needsSave = true;
  }

  const pushUps = [];
  seriesRuns.forEach((sr, i) => {
    const pt = state.playthroughs[i];
    if (!pt) return;
    if (sr.char_data) pt.charSheet = sr.char_data;
    const localTerminal  = pt.completed && pt.result !== 'portal';
    const seriesTerminal = sr.completed && sr.result !== 'portal';
    // A run's completion must only ever be stamped onto the book it actually
    // happened in. Every book in the series carries a placeholder for this
    // run index, but a book the run never visited has no startedAt - copying
    // the completion onto it too made the server treat it as a brand-new
    // completion on that book's own save (duplicate XP) and re-stamped
    // series_runs.completed_at to that later moment (scrambled feed
    // ordering). startedAt alone (not path.length) is the signal - every
    // genuine path mutation sets startedAt first, so path.length can't be
    // spoofed into looking touched the way it once was (see the isolated
    // portal-entry restore below, which used to inject a path entry here
    // without ever setting startedAt).
    const touchedHere = !!pt.startedAt;
    if (seriesTerminal && touchedHere) {
      if (!pt.completed || pt.result === 'portal' || pt.result !== sr.result) {
        pt.completed = true;
        pt.result    = sr.result;
        if (state.activePtIndex === i) state.activePtIndex = null;
        needsSave = true;
      }
    } else if (localTerminal) {
      pushUps.push({ i, result: pt.result, isPublic: !!pt.isPublic });
      if (state.activePtIndex === i) { state.activePtIndex = null; needsSave = true; }
    }
    if (seriesTerminal && touchedHere && sr.is_public !== undefined && !!pt.isPublic !== sr.is_public) {
      pt.isPublic = sr.is_public;
      needsSave = true;
    }
  });

  // Restore any isolated portal-entry nodes missing from the path
  seriesRuns.forEach((sr, i) => {
    if (sr.completed || !sr.last_section || sr.last_book_id !== currentBookId) return;
    const pt = state.playthroughs[i];
    // A run's last_book_id can point at this book by default before the run has
    // ever genuinely been played anywhere (e.g. freshly created) - without the
    // startedAt check this pushed a stray path entry into an untouched placeholder,
    // which then satisfied the touchedHere check above on every later sync and let
    // this book's own save award XP for a run that never actually happened here.
    if (!pt || pt.completed || !pt.startedAt) return;
    const secId = isValidSecId(+sr.last_section) ? +sr.last_section : sr.last_section;
    if (!secId) return;
    if (!pt.path.some(s => String(s) === String(secId))) {
      if (pt.path.length === 0) pt.portalEntry = true;
      pt.path.push(secId);
      if (!state.graph[secId]) state.graph[secId] = { choices: [], discovered: true };
      needsSave = true;
    }
  });

  for (const { i, result, isPublic } of pushUps) {
    await apiFetch(`/api/series/${seriesId}/runs/${i}`, {
      method: 'PUT',
      body: JSON.stringify({ completed: true, result, is_public: isPublic }),
    }).catch(() => {});
  }
  if (needsSave) await saveState();

  if (state.activePtIndex === null || state.activePtIndex === undefined) {
    const activeHere      = seriesRuns.find(sr => sr.last_book_id === currentBookId && !sr.completed);
    const activeElsewhere = seriesRuns.find(sr => sr.last_book_id && sr.last_book_id !== currentBookId);
    const candidate = activeHere ?? activeElsewhere;
    if (candidate) state.activePtIndex = candidate.run_index;
  }

  _cachedSeriesRuns = seriesRuns;
  return seriesRuns;
}

// ── Cross-book reachability ───────────────────────────────────────────────────
export async function _computeCrossBookReachability(seriesRuns, bookId) {
  _owSrcBookId      = null;
  _owSrcSection     = null;
  _owSrcBookState   = null;
  _owCrossBookRoute = null;
  setGraphCrossBookRoute(null);

  const activeIdx = state.activePtIndex;
  if (activeIdx === null || activeIdx === undefined) return;
  const sr = seriesRuns?.[activeIdx];
  if (!sr?.last_book_id || !sr?.last_section) return;
  if (sr.last_book_id === bookId) return;

  const r = await apiFetch(`/api/books/${sr.last_book_id}/state`).catch(() => null);
  if (!r?.ok) return;
  const srcState = await r.json().catch(() => null);
  if (!srcState?.graph) return;

  const srcSection = isValidSecId(+sr.last_section) ? +sr.last_section : sr.last_section;
  _owSrcBookId    = sr.last_book_id;
  _owSrcSection   = srcSection;
  _owSrcBookState = srcState;

  const route = new Map();
  for (const [secKey, data] of Object.entries(srcState.graph)) {
    const sec = isValidSecId(+secKey) ? +secKey : secKey;
    for (const portal of (data.portals || [])) {
      if (portal.targetBookId !== bookId) continue;
      const reachable = sec === srcSection || canReachInGraph(srcState.graph, srcSection, sec);
      if (!reachable) continue;
      const entrySection = isValidSecId(+portal.targetSection) ? +portal.targetSection : portal.targetSection;
      const reachableHere = allReachableInGraph(state.graph, entrySection);
      reachableHere.add(entrySection);
      for (const target of reachableHere) {
        if (!route.has(target)) {
          route.set(target, { srcPortalSection: sec, portal, entrySection });
        }
      }
    }
  }
  _owCrossBookRoute = route.size > 0 ? route : null;
  setGraphCrossBookRoute(_owCrossBookRoute);
}

// ── Portal travel handler ─────────────────────────────────────────────────────
export async function _handlePortalTravel(portal) {
  const { targetBookId, targetSection } = portal;
  if (!targetBookId || !targetSection) return;

  const pt = currentPlaythrough();
  const activeRunIndex = state.activePtIndex;
  if (activeRunIndex === null || activeRunIndex === undefined) return;

  const charSheet = pt ? JSON.parse(JSON.stringify(pt.charSheet || { fields: [] })) : null;
  const seriesId = _hooks.getCurrentBookSeriesId?.();
  if (pt && seriesId) {
    await apiFetch(`/api/series/${seriesId}/runs/${activeRunIndex}`, {
      method: 'PUT',
      body: JSON.stringify({ char_data: charSheet }),
    }).catch(() => {});
  }

  if (pt) {
    pt.completed    = true;
    pt.result       = 'portal';
    pt.portalTarget = { bookId: targetBookId, section: targetSection };
    await saveState();
  }

  const targetBook = (getCachedBooks() || []).find(b => b.id === targetBookId);
  if (!targetBook) { showAlert(t('openworld.target_not_in_library', { id: targetBookId })); return; }

  await _hooks.showMain?.(
    targetBook.id,
    targetBook.isbn || null, targetBook.issn || null, targetBook.asin || null,
    targetBook.cover_path ? `/covers/${targetBook.cover_path}` : null,
    targetBook.pdf_path || null, targetBook.pages ? Number(targetBook.pages) : null,
    targetBook.authors || null, targetBook.description || null,
    targetBook.discoverable_sections ?? null, !!targetBook.is_public,
    targetBook.created_by === null || targetBook.created_by === _hooks.getCurrentUserId?.(),
    targetBook.series_name || null, targetBook.series_number || null,
    !!targetBook.is_container, targetBook.parent_book_id ?? null, targetBook.book_order ?? null,
  );

  // Clear cross-book context BEFORE startPortalRun so the render doesn't draw
  // stale dashed borders on cross-book reachable nodes.
  _owSrcBookId      = null;
  _owSrcSection     = null;
  _owSrcBookState   = null;
  _owCrossBookRoute = null;
  setGraphCrossBookRoute(null);
  // _syncSeriesRuns ran inside showMain BEFORE startPortalRun's saveState updates
  // the server. Sync the cache so the active run reflects the target book.
  if (_cachedSeriesRuns?.[activeRunIndex]) {
    _cachedSeriesRuns[activeRunIndex].last_book_id = targetBookId;
    _cachedSeriesRuns[activeRunIndex].last_section = String(targetSection);
  }
  startPortalRun(targetSection, activeRunIndex, charSheet);
  _focusNodeAfterLoad(targetSection);
}

// ── New series run handler ────────────────────────────────────────────────────
export async function _handleNewSeriesRun() {
  const seriesId = _hooks.getCurrentBookSeriesId?.();
  if (!seriesId) { startPlaythrough(); return; }
  const r = await apiFetch(`/api/series/${seriesId}/runs`, { method: 'POST' }).catch(() => null);
  if (!r?.ok) { startPlaythrough(); return; }
  const { run_index } = await r.json().catch(() => ({}));
  if (run_index === undefined) { startPlaythrough(); return; }
  setViewingPt(null, true);

  while (state.playthroughs.length <= run_index) {
    const { inventory: invTmpl, equipment: eqTmpl, equipmentVisible: eqVisTmpl } = instantiateLoadout();
    state.playthroughs.push({
      path: [], completed: false, result: null,
      undosUsed: 0, fastTravelsUsed: 0, startedAt: Date.now(),
      charSheet: state.charSheetTemplate ? JSON.parse(JSON.stringify(state.charSheetTemplate)) : { fields: [] },
      inventory: invTmpl,
      equipment: eqTmpl,
      equipmentVisible: eqVisTmpl,
      diceState: { count: state.dicePrefs?.count ?? 2, die: state.dicePrefs?.die ?? 6, lastResult: null },
    });
  }
  const startSec = isValidSecId(state.startSection) ? state.startSection : 1;
  const pt = state.playthroughs[run_index];
  // pt can already exist as an untouched _syncSeriesRuns padding placeholder
  // (startedAt: null) if the local array was already long enough - the while
  // loop above only sets startedAt for slots it freshly creates. Without this,
  // pushing the start section here left a genuinely-started run's placeholder
  // looking exactly like an unplayed one (path content, but startedAt: null),
  // which broke every "is this book actually hosting this run" check that
  // relies on startedAt.
  if (!pt.startedAt) pt.startedAt = Date.now();
  if (!state.graph[startSec]) state.graph[startSec] = { choices: [], discovered: true };
  if (pt.path.length === 0) pt.path.push(startSec);
  state.activePtIndex = run_index;
  await saveState();
  if (_cachedSeriesRuns) {
    while (_cachedSeriesRuns.length <= run_index) {
      _cachedSeriesRuns.push({ run_index: _cachedSeriesRuns.length });
    }
    _cachedSeriesRuns[run_index].last_book_id = currentBookId;
    _cachedSeriesRuns[run_index].last_section = String(startSec);
    _cachedSeriesRuns[run_index].completed = 0;
  }
  render();
  if (network && Object.keys(state.positions).length > 0) {
    network.focus(startSec, { scale: Math.max(network.getScale(), 1.2), animation: { duration: 400, easingFunction: 'easeInOutQuad' } });
  }
}

// ── Focus node after cross-book navigation ────────────────────────────────────
export function _focusNodeAfterLoad(sec) {
  if (!network || !sec) return;
  const doFocus = () => {
    if (visNodes?.get(sec)) {
      network.selectNodes([sec]);
      network.focus(sec, { scale: clampViewportScale(state.viewport?.scale ?? 1.0), animation: { duration: 400, easingFunction: 'easeInOutQuad' } });
    }
  };
  if (Object.keys(state.positions).length === 0) {
    const once = () => { network.off('stabilizationIterationsDone', once); doFocus(); };
    network.on('stabilizationIterationsDone', once);
  } else {
    setTimeout(doFocus, 50);
  }
}

// ── Cross-book fast travel ────────────────────────────────────────────────────
// BFS shortest path on an arbitrary graph object
function _findPathInGraph(graph, from, to, mode) {
  if (from == null || to == null || from === to) return null;
  const seen  = new Set([from]);
  const queue = [[from, [from]]];
  while (queue.length) {
    const [node, path] = queue.shift();
    for (const next of (graph[node]?.choices ?? [])) {
      if (next === -1 || next === 0 || seen.has(next)) continue;
      const newPath = [...path, next];
      if (next === to) return newPath;
      if (graph[next]) { seen.add(next); queue.push([next, newPath]); }
    }
  }
  return null;
}

export async function doJumpCrossBook(targetSection, mode) {
  const route = _owCrossBookRoute?.get(targetSection);
  if (!route || !_owSrcBookId) { showAlert(t('ctx.fasttravel.no_path')); return; }

  // Always re-fetch source book state to avoid overwriting concurrent changes.
  const freshR = await apiFetch(`/api/books/${_owSrcBookId}/state`).catch(() => null);
  if (!freshR?.ok) { showAlert(t('ctx.fasttravel.no_path')); return; }
  _owSrcBookState = await freshR.json().catch(() => null);
  if (!_owSrcBookState?.graph || !_owSrcBookState?.playthroughs) { showAlert(t('ctx.fasttravel.no_path')); return; }

  const { srcPortalSection, portal, entrySection } = route;
  const activeIdx = state.activePtIndex;
  const srcPt = _owSrcBookState.playthroughs?.[activeIdx];
  if (!srcPt?.path) { showAlert(t('ctx.fasttravel.no_path')); return; }

  // Step 1: Build path in source book to the portal section
  const srcFrom = _owSrcSection;
  if (srcFrom !== srcPortalSection) {
    const srcPath = _findPathInGraph(_owSrcBookState.graph, srcFrom, srcPortalSection, mode);
    if (!srcPath || srcPath.length < 2) { showAlert(t('ctx.fasttravel.no_path')); return; }
    for (let i = 1; i < srcPath.length; i++) srcPt.path.push(srcPath[i]);
  }

  // Step 2: Mark source run as portal-paused
  srcPt.completed = true;
  srcPt.result    = 'portal';
  srcPt.portalTarget = { bookId: currentBookId, section: entrySection };

  // Step 3: Save source book's state
  await apiFetch(`/api/books/${_owSrcBookId}/state`, {
    method: 'PUT',
    body: JSON.stringify(_owSrcBookState),
  }).catch(() => {});

  // Step 4: Activate current book's run at the portal entry section
  const pt = state.playthroughs[activeIdx];
  if (!pt) return;
  pt.completed = false;
  pt.result    = null;
  delete pt.portalTarget;
  if (!pt.startedAt) pt.startedAt = Date.now();
  state.activePtIndex = activeIdx;
  if (!state.graph[entrySection]) state.graph[entrySection] = { choices: [], discovered: true };
  if (pt.path.length === 0 || pt.path[pt.path.length - 1] !== entrySection) pt.path.push(entrySection);

  // Step 5: Fast travel within current book to target
  if (entrySection !== targetSection) {
    const localPath = findPathTo(entrySection, targetSection, mode);
    if (localPath && localPath.length >= 2) {
      for (let i = 1; i < localPath.length; i++) pt.path.push(localPath[i]);
    }
  }

  // Step 6: Charge the fast travel and save
  pt.fastTravelsUsed = (pt.fastTravelsUsed || 0) + 1;
  pt.lastActionAt = Date.now();
  await saveState();
  // Sync local cache: server moved this run to the current book.
  const lastSec = pt.path[pt.path.length - 1];
  if (_cachedSeriesRuns?.[activeIdx]) {
    _cachedSeriesRuns[activeIdx].last_book_id = currentBookId;
    _cachedSeriesRuns[activeIdx].last_section = String(lastSec);
  }
  _owSrcBookId      = null;
  _owSrcSection     = null;
  _owSrcBookState   = null;
  _owCrossBookRoute = null;
  setGraphCrossBookRoute(null);
  render();
  if (network) network.focus(targetSection, { animation: true, scale: 1.2 });
}

// ── Wire setOpenWorldContext/setOnViewPublicRun/setOnCharSheetSaved ───────────
// Called from showMain once bookId, seriesId, and isOpenWorld are known.
export function setupOpenWorldForBook(bookId, seriesId, isOpenWorld) {
  setOpenWorldContext({
    isOpenWorld,
    seriesId,
    seriesBooks: isOpenWorld && seriesId
      ? (getCachedBooks() || []).filter(b => b.series_id === seriesId && b.id !== bookId)
          .map(b => ({ id: b.id, name: b.name }))
      : [],
    onPortalTravel:   isOpenWorld ? _handlePortalTravel : null,
    onNewSeriesRun:   isOpenWorld ? _handleNewSeriesRun : null,
    crossBookEnabled: isOpenWorld ? () => !!(_owSrcBookId && _owSrcSection) : null,
    onRunActivated:   isOpenWorld ? async (index) => {
      if (_cachedSeriesRuns) await _computeCrossBookReachability(_cachedSeriesRuns, bookId);
      if (_owSrcBookId) {
        const srcBook = (getCachedBooks() || []).find(b => b.id === _owSrcBookId);
        if (srcBook) {
          const targetSection  = _owSrcSection;
          const targetRunIndex = index;
          await _hooks.showMain?.(
            srcBook.id,
            srcBook.isbn || null, srcBook.issn || null, srcBook.asin || null,
            srcBook.cover_path ? `/covers/${srcBook.cover_path}` : null,
            srcBook.pdf_path || null, srcBook.pages ? Number(srcBook.pages) : null,
            srcBook.authors || null, srcBook.description || null,
            srcBook.discoverable_sections ?? null, !!srcBook.is_public,
            srcBook.created_by === null || srcBook.created_by === _hooks.getCurrentUserId?.(),
            srcBook.series_name || null, srcBook.series_number || null,
            !!srcBook.is_container, srcBook.parent_book_id ?? null, srcBook.book_order ?? null,
          );
          if (targetRunIndex !== null && targetRunIndex !== undefined &&
              state.activePtIndex !== targetRunIndex && state.playthroughs[targetRunIndex]) {
            state.activePtIndex = targetRunIndex;
            saveState();
            render();
          }
          _focusNodeAfterLoad(targetSection);
          return;
        }
      }
      render();
    } : null,
    onRunDeleted: isOpenWorld ? (index) => {
      if (_cachedSeriesRuns) _cachedSeriesRuns.splice(index, 1);
    } : null,
    getRunLocation: isOpenWorld ? (index) => {
      const sr = _cachedSeriesRuns?.[index];
      if (!sr?.last_book_id) return null;
      const book = (getCachedBooks() || []).find(b => b.id === sr.last_book_id);
      return { bookId: sr.last_book_id, bookName: book?.name || `Book #${sr.last_book_id}`, section: sr.last_section };
    } : null,
  });

  setOnViewPublicRun(isOpenWorld && seriesId
    ? (runIndex) => _hooks.openPublicSeriesRun?.(seriesId, _hooks.getCurrentUserId?.(), runIndex, null)
    : null);

  setOnCharSheetSaved(isOpenWorld && seriesId ? (charSheet) => {
    const idx = state.activePtIndex;
    if (idx === null || idx === undefined) return;
    apiFetch(`/api/series/${seriesId}/runs/${idx}`, {
      method: 'PUT',
      body: JSON.stringify({ char_data: charSheet }),
    }).catch(() => {});
  } : null);
}
