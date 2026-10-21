'use strict';

// Load saved gameplay only for the requested account-library page. Metadata
// remains cheap to search and sort even when an account owns the whole catalog.
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const stateColumns = new Set(['mapped', 'discovered', 'playthroughs', 'wins', 'deaths', 'battles', 'last_run_at']);
function summarizeBook(b) {
  let mapped = 0, discovered = 0, playthroughs = 0, wins = 0, deaths = 0, battles = 0, last_run_at = null;
  try {
    const s = JSON.parse(b.state_data);
    mapped = Object.keys(s.graph || {}).filter(k => !s.graph[k]?.discovered).length;
    const seen = new Set(Object.keys(s.graph || {}).map(Number));
    for (const d of Object.values(s.graph || {}))
      for (const c of (d.choices || [])) if (c !== -1 && c !== 0) seen.add(c);
    discovered = seen.size;
    const pts = (s.playthroughs || []).filter(p => p.startedAt != null);
    playthroughs = pts.length;
    for (const pt of pts) {
      if (pt.result === 'success') wins++;
      if (pt.result === 'death') deaths++;
      if (pt.result === 'battle') battles++;
      const ts = pt.completedAt || pt.lastActionAt || pt.startedAt || null;
      if (ts && (last_run_at === null || ts > last_run_at)) last_run_at = ts;
    }
  } catch {}
  const { state_data, ...metadata } = b;
  return { ...metadata, mapped, discovered, playthroughs, wins, deaths, battles, last_run_at };
}
function getUserBooks(db, userId, options) {
  const metadata = db.prepare(`SELECT b.id,b.name,b.total_sections,b.created_by,ub.created_at,ub.updated_at
    FROM user_books ub JOIN books b ON b.id=ub.book_id WHERE ub.user_id=? ORDER BY ub.created_at ASC,b.id ASC`).all(userId);
  const bookCount = metadata.length;
  const createdCount = metadata.filter(b => b.created_by === userId).length;
  const totals = { runs: 0, wins: 0, deaths: 0, battles: 0 };
  for (const { event, n } of db.prepare(`SELECT event,COUNT(*) AS n FROM xp_events WHERE user_id=?
      AND event IN ('win_run','death_run','battle_run') GROUP BY event`).all(userId)) {
    totals.runs += n;
    totals[{ win_run: 'wins', death_run: 'deaths', battle_run: 'battles' }[event]] = n;
  }
  const pageSize = Math.max(1, Math.min(100, Number.parseInt(options?.pageSize, 10) || 50));
  const query = String(options?.query || '').normalize('NFC').toLocaleLowerCase();
  let rows = metadata.filter(b => !query || b.name.normalize('NFC').toLocaleLowerCase().includes(query));
  const sort = ['name', 'total_sections', 'created_at', 'updated_at', ...stateColumns].includes(options?.sort) ? options.sort : 'updated_at';
  const dir = options?.dir === 'asc' ? 1 : -1;
  const loadStates = list => {
    // One bounded query, rather than one query per visible row.
    if (!list.length) return [];
    const states = new Map(db.prepare(`SELECT book_id,state_data FROM user_books WHERE user_id=?
      AND book_id IN (SELECT value FROM json_each(?))`).all(userId, JSON.stringify(list.map(b => b.id))).map(b => [b.book_id,b.state_data]));
    return list.map(b => summarizeBook({ ...b, state_data: states.get(b.id) }));
  };
  if (!options) return { books: loadStates(metadata), totals };
  // Explicit gameplay-column sorts need the matching states, but ordinary opens,
  // searches and metadata sorts never parse the rest of the account's library.
  if (stateColumns.has(sort)) rows = loadStates(rows);
  rows.sort((a,b) => {
    const av=a[sort], bv=b[sort];
    if (av == null && bv != null) return 1;
    if (bv == null && av != null) return -1;
    return (typeof av === 'string' ? collator.compare(av,bv) : (av || 0)-(bv || 0))*dir || a.id-b.id;
  });
  const total = rows.length;
  const page = Math.min(Math.max(0, Number.parseInt(options.page,10) || 0), Math.max(0,Math.ceil(total/pageSize)-1));
  let books = rows.slice(page*pageSize,(page+1)*pageSize);
  if (!stateColumns.has(sort)) books = loadStates(books);
  return { books, totals, bookCount, createdCount, pagination: { page,pageSize,total } };
}
module.exports = { getUserBooks, summarizeBook };
