'use strict';

// Stream dashboard gameplay totals and collect extras from the same parsed state.
function addGameplayStats(totals, state) {
  // Match SQLite CAST(... AS INTEGER) for saved numeric counters.
  const integer = value => {
    if (typeof value === 'boolean') return Number(value);
    if (typeof value === 'number') return Math.trunc(value);
    return typeof value === 'string' ? (parseInt(value, 10) || 0) : 0;
  };
  for (const pt of Object.values(state?.playthroughs || {})) {
    totals.undosTotal += integer(pt?.undosUsed);
    totals.fastTravelsTotal += integer(pt?.fastTravelsUsed);
  }
  for (const node of Object.values(state?.graph || {})) {
    const portals = node?.portals;
    if (portals != null) totals.owPortals += typeof portals === 'object' ? Object.keys(portals).length : 1;
  }
}

function collectDashboardStats(db, simHistoryKeys, extras) {
  const totals = { totalSections: 0, mappedSections: 0, discoveredSections: 0,
    playthroughs: 0, activePlaythroughs: 0, finishedPlaythroughs: 0,
    wins: 0, deaths: 0, battleCount: 0, publicRuns: 0,
    battlesFought: 0, battlesWon: 0, battlesLost: 0 };
  const eligible = new Map();
  const books = db.prepare('SELECT id, parent_book_id, total_sections, is_container FROM books').all();
  const containers = new Set(books.filter(b => b.parent_book_id == null && b.is_container).map(b => b.id));
  for (const book of books) {
    if ((book.parent_book_id == null && !book.is_container) || containers.has(book.parent_book_id)) {
      totals.totalSections += book.total_sections || 0;
      eligible.set(book.id, { mapped: 0, discovered: 0 });
    }
  }
  // Batch the read, then release each raw JSON string after parsing. Parsed state
  // never accumulates across players or survives this request.
  for (const row of db.prepare('SELECT book_id, state_data FROM user_books').all()) {
    const best = eligible.get(row.book_id);
    if (!best && !extras) continue;
    try {
      const state = JSON.parse(row.state_data);
      row.state_data = null;
      if (extras) addGameplayStats(extras, state);
      if (!best) continue;
      const graph = state.graph || {};
      const keys = Object.keys(graph);
      const mapped = keys.filter(k => !graph[k]?.discovered).length;
      if (mapped > best.mapped) {
        best.mapped = mapped;
        const seen = new Set(keys.map(Number));
        for (const node of Object.values(graph))
          for (const choice of (node.choices || []))
            if (choice !== -1 && choice !== 0) seen.add(choice);
        best.discovered = seen.size;
      }
      // Preserve the established definition of a started run, including retired simulators.
      const pts = (state.playthroughs || []).filter(pt => pt.startedAt != null);
      totals.playthroughs += pts.length;
      totals.activePlaythroughs += pts.filter(pt => !pt.result).length;
      totals.finishedPlaythroughs += pts.filter(pt => !!pt.result).length;
      totals.wins += pts.filter(pt => pt.result === 'success').length;
      totals.deaths += pts.filter(pt => pt.result === 'death').length;
      totals.battleCount += pts.filter(pt => pt.result === 'battle').length;
      totals.publicRuns += pts.filter(pt => pt.isPublic).length;
      for (const pt of pts) {
        for (const key of Object.keys(pt)) {
          if (!simHistoryKeys.has(key)) continue;
          const history = pt[key]?.history;
          if (!history?.length) continue;
          totals.battlesFought += history.length;
          for (const entry of history) {
            if (entry?.outcome === 'win') totals.battlesWon++;
            else if (entry?.outcome === 'loss') totals.battlesLost++;
          }
        }
      }
    } catch {}
  }
  for (const best of eligible.values()) {
    totals.mappedSections += best.mapped;
    totals.discoveredSections += best.discovered;
  }
  return totals;
}

module.exports = { addGameplayStats, collectDashboardStats };
