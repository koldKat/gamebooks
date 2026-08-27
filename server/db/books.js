'use strict';

// Books/user_books/stashes/series/series_runs CRUD, book_enemies, ratings, and
// the demo-book helper. Ratings (canUserRateBook/getBookRating/etc.) lived
// physically elsewhere in the original server/db.js (interleaved with feed-related
// code) but are pulled in here since getBooks()/getPublicSeriesInfo() in this same
// file already depend on them, and ratings are fundamentally a book/series property.

const { db, _foldForSearch, _naturalCompare, _naturalCompareByName, _getPdfSize } = require('./connection');
const {
  awardXp, awardCoins, _discoveredSet, _visitedSet, _mappedSet, _permanentVisitedCount, _checkGroupMilestone,
} = require('./xp');

// "Live reading" (server/routes/books.js's handleGetBookSection) used to be
// gated to two accounts by username while it was a POC. Open to everyone
// now that it's proven out - still not announced anywhere (no changelog/
// forum post) until deliberately publicized, but functionally live for
// every user. Kept as its own function (rather than deleting the gate
// entirely) so a future re-gate, if ever needed, has one place to change.
function _canLiveRead(_userId) {
  return true;
}

// Canonical, admin-imported section text for the live-reading feature -
// distinct from state.graph (per-user). Returns null if this book has no
// imported data for that section, or the section id isn't real at all.
function getBookSection(bookId, sectionId) {
  const row = db.prepare('SELECT html, choices FROM book_sections WHERE book_id = ? AND section_id = ?').get(bookId, String(sectionId));
  if (!row) return null;
  let choices = [];
  try { choices = JSON.parse(row.choices); } catch {}
  return { html: row.html, choices };
}

function getBooks(userId) {
  const canLiveRead = _canLiveRead(userId);
  const rows = db.prepare(`
    SELECT b.id, b.name, b.total_sections, b.discoverable_sections,
           b.isbn, b.issn, b.asin, b.cover_path, b.pdf_path, b.created_at, b.created_by, b.is_public,
           b.pages, b.authors, b.description, b.is_demo,
           b.series_id, b.series_number, b.is_container, b.parent_book_id, b.book_order, b.has_battle_sim, b.has_live_reading,
           s.name AS series_name,
           ub.state_data, ub.created_at AS ub_created_at, ub.updated_at AS ub_updated_at, ub.rating AS user_rating,
           ub.party_id, ub.bg_hidden, ub.bg_pos_y
    FROM user_books ub
    JOIN books b ON b.id = ub.book_id
    LEFT JOIN series s ON s.id = b.series_id
    WHERE ub.user_id = ?
    ORDER BY ub.created_at ASC
  `).all(userId);
  const extraAnthologyIds = {};
  const extraAnthologyOrders = {};
  for (const row of db.prepare('SELECT book_id, anthology_id, book_order FROM book_anthology_memberships').all()) {
    (extraAnthologyIds[row.book_id] ??= []).push(row.anthology_id);
    (extraAnthologyOrders[row.book_id] ??= {})[row.anthology_id] = row.book_order;
  }
  return rows.map(({ state_data, ub_created_at, ub_updated_at, user_rating, bg_hidden, bg_pos_y, has_live_reading, ...b }) => {
    let visited = 0;
    let last_run_at = null;
    try {
      const s = JSON.parse(state_data || '{}');
      const pts = s.playthroughs || [];
      // _visitedSet/_mappedSet (xp.js) normalize each section id via
      // _normSec before adding to their Set - building this by hand with a
      // plain `seen.add(sec)` (as this used to) doesn't, so a path/graph
      // mixing string and number ids for the same section counted it twice,
      // inflating `visited` past `total_sections` and forcing the books-list
      // progress bar/pill to show 100% for a book far from actually done.
      const seen = new Set([..._visitedSet(pts), ..._mappedSet(s.graph || {})]);
      for (const pt of pts) {
        const ts = pt.completedAt || pt.lastActionAt || pt.startedAt || null;
        if (ts && (last_run_at === null || ts > last_run_at)) last_run_at = ts;
      }
      // Fallback for old playthroughs that predate completedAt/startedAt fields
      if (pts.length > 0 && last_run_at === null && ub_updated_at) {
        last_run_at = ub_updated_at * 1000; // SQLite epoch seconds → ms
      }
      visited = seen.size;
      // Same deleted-run undercount as _visitedSet (see _permanentVisitedCount) - a
      // section visited in a run that's since been deleted vanishes from `seen` even
      // though it really was visited, so the books-list progress bar/pill would show
      // less than 100% (and stay grey) for a book the player has actually finished.
      const effective = b.discoverable_sections ?? b.total_sections;
      if (effective && visited < effective) {
        const permanent = _permanentVisitedCount(userId, b.id);
        if (permanent > visited) visited = permanent;
      }
    } catch {}
    const { avgRating, voteCount } = _getAggregateRating(b.id);
    return {
      ...b,
      pdf_size: _getPdfSize(b.pdf_path),
      visited,
      last_run_at,
      userRating: user_rating ?? null,
      avgRating,
      voteCount,
      bgHidden: !!bg_hidden,
      bgPosY: bg_pos_y ?? 50,
      extra_anthology_ids: extraAnthologyIds[b.id] || [],
      extra_anthology_orders: extraAnthologyOrders[b.id] || {},
      // Gated client-side visibility: !!b.has_live_reading alone would leak the
      // button to every reader of a book with imported live-reading data - only
      // ever true for the one hardcoded POC user, everyone else always sees false
      // regardless of the book's own flag.
      hasLiveReading: canLiveRead && !!has_live_reading,
    };
  });
}

function getStashes(userId) {
  const stashes = db.prepare(`
    SELECT id, name, created_at
    FROM user_stashes
    WHERE user_id = ?
    ORDER BY created_at ASC, id ASC
  `).all(userId).map(s => ({ id: s.id, name: s.name, createdAt: (s.created_at || 0) * 1000, bookIds: [], seriesIds: [], excludedBookIds: [] }));
  if (!stashes.length) return [];
  const byId = new Map(stashes.map(s => [s.id, s]));
  db.prepare('SELECT stash_id, book_id FROM stash_books WHERE user_id = ? ORDER BY stash_id, book_id').all(userId)
    .forEach(row => { byId.get(row.stash_id)?.bookIds.push(row.book_id); });
  db.prepare('SELECT stash_id, series_id FROM stash_series WHERE user_id = ? ORDER BY stash_id, series_id').all(userId)
    .forEach(row => { byId.get(row.stash_id)?.seriesIds.push(row.series_id); });
  db.prepare('SELECT stash_id, book_id FROM stash_excluded_books WHERE user_id = ? ORDER BY stash_id, book_id').all(userId)
    .forEach(row => { byId.get(row.stash_id)?.excludedBookIds.push(row.book_id); });
  return stashes;
}

function createStash(userId, name, bookIds = [], seriesIds = [], excludedBookIds = []) {
  const trimmed = String(name || '').trim();
  const uniqBookIds = [...new Set((Array.isArray(bookIds) ? bookIds : []).map(Number).filter(Number.isInteger))];
  const uniqSeriesIds = [...new Set((Array.isArray(seriesIds) ? seriesIds : []).map(Number).filter(Number.isInteger))];
  const uniqExcludedBookIds = [...new Set((Array.isArray(excludedBookIds) ? excludedBookIds : []).map(Number).filter(Number.isInteger))];
  if (!trimmed) return { ok: false, error: 'name required' };

  const ownedBookIds = new Set(db.prepare('SELECT book_id FROM user_books WHERE user_id = ?').all(userId).map(r => r.book_id));
  const ownedSeriesIds = new Set(db.prepare('SELECT series_id FROM user_series WHERE user_id = ?').all(userId).map(r => r.series_id));
  if (uniqBookIds.some(id => !ownedBookIds.has(id))) return { ok: false, error: 'book not in library' };
  if (uniqSeriesIds.some(id => !ownedSeriesIds.has(id))) return { ok: false, error: 'series not in library' };
  if (uniqExcludedBookIds.some(id => !ownedBookIds.has(id))) return { ok: false, error: 'excluded book not in library' };

  const stashedBookIds = new Set(db.prepare('SELECT book_id FROM stash_books WHERE user_id = ?').all(userId).map(r => r.book_id));
  const stashedSeriesIds = new Set(db.prepare('SELECT series_id FROM stash_series WHERE user_id = ?').all(userId).map(r => r.series_id));
  if (uniqBookIds.some(id => stashedBookIds.has(id))) return { ok: false, error: 'book already in a stash' };
  if (uniqSeriesIds.some(id => stashedSeriesIds.has(id))) return { ok: false, error: 'series already in a stash' };

  const run = db.transaction(() => {
    const stashId = db.prepare('INSERT INTO user_stashes (user_id, name) VALUES (?, ?)').run(userId, trimmed).lastInsertRowid;
    const insBook = db.prepare('INSERT INTO stash_books (stash_id, user_id, book_id) VALUES (?, ?, ?)');
    const insSeries = db.prepare('INSERT INTO stash_series (stash_id, user_id, series_id) VALUES (?, ?, ?)');
    const insExcluded = db.prepare('INSERT INTO stash_excluded_books (stash_id, user_id, book_id) VALUES (?, ?, ?)');
    for (const bookId of uniqBookIds) insBook.run(stashId, userId, bookId);
    for (const seriesId of uniqSeriesIds) insSeries.run(stashId, userId, seriesId);
    for (const bookId of uniqExcludedBookIds) insExcluded.run(stashId, userId, bookId);
    return stashId;
  });

  return { ok: true, id: run() };
}

function updateStash(userId, stashId, name, bookIds = [], seriesIds = [], excludedBookIds = []) {
  const row = db.prepare('SELECT id FROM user_stashes WHERE id = ? AND user_id = ?').get(stashId, userId);
  if (!row) return { ok: false, error: 'not found' };
  const trimmed = String(name || '').trim();
  const uniqBookIds = [...new Set((Array.isArray(bookIds) ? bookIds : []).map(Number).filter(Number.isInteger))];
  const uniqSeriesIds = [...new Set((Array.isArray(seriesIds) ? seriesIds : []).map(Number).filter(Number.isInteger))];
  const uniqExcludedBookIds = [...new Set((Array.isArray(excludedBookIds) ? excludedBookIds : []).map(Number).filter(Number.isInteger))];
  if (!trimmed) return { ok: false, error: 'name required' };

  const ownedBookIds = new Set(db.prepare('SELECT book_id FROM user_books WHERE user_id = ?').all(userId).map(r => r.book_id));
  const ownedSeriesIds = new Set(db.prepare('SELECT series_id FROM user_series WHERE user_id = ?').all(userId).map(r => r.series_id));
  if (uniqBookIds.some(id => !ownedBookIds.has(id))) return { ok: false, error: 'book not in library' };
  if (uniqSeriesIds.some(id => !ownedSeriesIds.has(id))) return { ok: false, error: 'series not in library' };
  if (uniqExcludedBookIds.some(id => !ownedBookIds.has(id))) return { ok: false, error: 'excluded book not in library' };

  const otherStashedBookIds = new Set(db.prepare('SELECT book_id FROM stash_books WHERE user_id = ? AND stash_id != ?').all(userId, stashId).map(r => r.book_id));
  const otherStashedSeriesIds = new Set(db.prepare('SELECT series_id FROM stash_series WHERE user_id = ? AND stash_id != ?').all(userId, stashId).map(r => r.series_id));
  if (uniqBookIds.some(id => otherStashedBookIds.has(id))) return { ok: false, error: 'book already in another stash' };
  if (uniqSeriesIds.some(id => otherStashedSeriesIds.has(id))) return { ok: false, error: 'series already in another stash' };

  db.transaction(() => {
    db.prepare('UPDATE user_stashes SET name = ? WHERE id = ? AND user_id = ?').run(trimmed, stashId, userId);
    db.prepare('DELETE FROM stash_books WHERE stash_id = ? AND user_id = ?').run(stashId, userId);
    db.prepare('DELETE FROM stash_series WHERE stash_id = ? AND user_id = ?').run(stashId, userId);
    db.prepare('DELETE FROM stash_excluded_books WHERE stash_id = ? AND user_id = ?').run(stashId, userId);
    const insBook = db.prepare('INSERT INTO stash_books (stash_id, user_id, book_id) VALUES (?, ?, ?)');
    const insSeries = db.prepare('INSERT INTO stash_series (stash_id, user_id, series_id) VALUES (?, ?, ?)');
    const insExcluded = db.prepare('INSERT INTO stash_excluded_books (stash_id, user_id, book_id) VALUES (?, ?, ?)');
    for (const bookId of uniqBookIds) insBook.run(stashId, userId, bookId);
    for (const seriesId of uniqSeriesIds) insSeries.run(stashId, userId, seriesId);
    for (const bookId of uniqExcludedBookIds) insExcluded.run(stashId, userId, bookId);
  })();
  return { ok: true };
}

function deleteStash(userId, stashId) {
  const row = db.prepare('SELECT id FROM user_stashes WHERE id = ? AND user_id = ?').get(stashId, userId);
  if (!row) return false;
  db.prepare('DELETE FROM user_stashes WHERE id = ? AND user_id = ?').run(stashId, userId);
  return true;
}

function setBookBgPref(userId, bookId, hidden, posY) {
  const clamped = Math.max(0, Math.min(100, posY ?? 50));
  db.prepare('UPDATE user_books SET bg_hidden = ?, bg_pos_y = ? WHERE user_id = ? AND book_id = ?')
    .run(hidden ? 1 : 0, clamped, userId, bookId);
}

// For the admin watch view - mirrors the same hidden/pos_y a real player sees
// (bg.js's own resetBgState()), plus the book's cover_path so the watch
// canvas can render the identical background image rather than a blank one.
function getBookBgPref(userId, bookId) {
  const row  = db.prepare('SELECT bg_hidden, bg_pos_y FROM user_books WHERE user_id = ? AND book_id = ?').get(userId, bookId);
  const book = db.prepare('SELECT cover_path FROM books WHERE id = ?').get(bookId);
  return {
    bgHidden: !!row?.bg_hidden,
    bgPosY:   row?.bg_pos_y ?? 50,
    coverUrl: book?.cover_path ? `/covers/${book.cover_path}` : null,
  };
}

function awardPdfXp(bookId, uploaderId) {
  if (uploaderId) {
    awardXp(uploaderId, 'pdf_available', String(bookId));
  } else {
    const users = db.prepare('SELECT user_id FROM user_books WHERE book_id = ?').all(bookId);
    for (const { user_id } of users) awardXp(user_id, 'pdf_available', String(bookId));
  }
}

function setBookPdf(bookId, pdfPath) {
  const book = db.prepare('SELECT pdf_path FROM books WHERE id = ?').get(bookId);
  if (!book) return;
  if (book.pdf_path) {
    try { require('fs').unlinkSync(require('path').join(__dirname, '..', '..', 'public', 'books', book.pdf_path)); } catch (_) {}
  }
  db.prepare('UPDATE books SET pdf_path = ? WHERE id = ?').run(pdfPath, bookId);
}

function removeBookCover(bookId) {
  const book = db.prepare('SELECT cover_path FROM books WHERE id = ?').get(bookId);
  if (!book?.cover_path) return;
  try { require('fs').unlinkSync(require('path').join(__dirname, '..', '..', 'public', 'covers', book.cover_path)); } catch (_) {}
  db.prepare("UPDATE books SET cover_path = NULL, updated_at = strftime('%s','now') WHERE id = ?").run(bookId);
}

function removeBookPdf(bookId) {
  const book = db.prepare('SELECT pdf_path FROM books WHERE id = ?').get(bookId);
  if (!book?.pdf_path) return;
  try { require('fs').unlinkSync(require('path').join(__dirname, '..', '..', 'public', 'books', book.pdf_path)); } catch (_) {}
  db.prepare('UPDATE books SET pdf_path = NULL WHERE id = ?').run(bookId);
}

function setBookCover(userId, bookId, coverPath, isAdmin = false) {
  const book = db.prepare('SELECT cover_path, created_by FROM books WHERE id = ?').get(bookId);
  if (!book) return;
  if (!isAdmin) {
    const ub = db.prepare('SELECT book_id FROM user_books WHERE book_id = ? AND user_id = ?').get(bookId, userId);
    if (!ub) return;
    if (book.created_by !== null && book.created_by !== userId) return;
  }
  // Delete old cover file if present
  if (book?.cover_path) {
    try { require('fs').unlinkSync(require('path').join(__dirname, '..', '..', 'public', 'covers', book.cover_path)); } catch (_) {}
  }
  db.prepare('UPDATE books SET cover_path = ?, updated_at = strftime(\'%s\',\'now\') WHERE id = ?').run(coverPath, bookId);
}

function getBookContainerFields(bookId) {
  return db.prepare('SELECT series_id, series_number, is_container, parent_book_id, book_order FROM books WHERE id = ?').get(bookId) ?? null;
}

// A book's *secondary* anthology memberships - see book_anthology_memberships'
// own comment in server/db.js. Same "creator of the anthology, or admin" gate
// as updateBook()'s primary-parent editing, since this is fundamentally the
// same action (editing which books an anthology lists as its own).
function addAnthologyMember(userId, anthologyId, bookId, bookOrder, isAdmin = false) {
  const anthology = db.prepare('SELECT id, created_by, is_container FROM books WHERE id = ?').get(anthologyId);
  if (!anthology || !anthology.is_container) return { error: 'not_an_anthology' };
  if (!isAdmin && anthology.created_by !== null && anthology.created_by !== userId) return { error: 'forbidden' };
  const book = db.prepare('SELECT id, is_container, parent_book_id, created_by FROM books WHERE id = ?').get(bookId);
  if (!book || book.is_container) return { error: 'invalid_book' };
  if (bookId === anthologyId) return { error: 'invalid_book' };
  if (book.parent_book_id === anthologyId) return { error: 'already_primary' };
  const isNew = !db.prepare('SELECT 1 FROM book_anthology_memberships WHERE book_id = ? AND anthology_id = ?').get(bookId, anthologyId);
  db.prepare(
    'INSERT OR REPLACE INTO book_anthology_memberships (book_id, anthology_id, book_order) VALUES (?, ?, ?)'
  ).run(bookId, anthologyId, bookOrder ?? null);
  return { ok: true, isNew, bookCreatedBy: book.created_by, bookOrderSet: bookOrder != null };
}

function removeAnthologyMember(userId, anthologyId, bookId, isAdmin = false) {
  const anthology = db.prepare('SELECT id, created_by, is_container FROM books WHERE id = ?').get(anthologyId);
  if (!anthology || !anthology.is_container) return { error: 'not_an_anthology' };
  if (!isAdmin && anthology.created_by !== null && anthology.created_by !== userId) return { error: 'forbidden' };
  db.prepare('DELETE FROM book_anthology_memberships WHERE book_id = ? AND anthology_id = ?').run(bookId, anthologyId);
  return { ok: true };
}

// Called after a book's primary parent_book_id changes - if it now matches
// an existing secondary membership, that membership is now a pure duplicate
// (the book would otherwise get double-listed as a child everywhere the two
// are combined). Not creator-gated: the caller already authorized the parent
// change itself, this just keeps the two relationships from overlapping.
function _pruneRedundantAnthologyMembership(bookId, parentBookId) {
  if (!parentBookId) return;
  db.prepare('DELETE FROM book_anthology_memberships WHERE book_id = ? AND anthology_id = ?').run(bookId, parentBookId);
}

// A single anthology's secondary members only (not its parent_book_id
// children) - callers combine this with their own primary-children query.
function getAnthologyExtraMembers(anthologyId) {
  return db.prepare(
    `SELECT b.id, b.name, b.total_sections, m.book_order FROM book_anthology_memberships m
     JOIN books b ON b.id = m.book_id
     WHERE m.anthology_id = ? AND b.is_demo = 0`
  ).all(anthologyId);
}

function getOrCreateSeries(name, userId, addToLibrary = false) {
  if (!name || !name.trim()) return null;
  const trimmed = name.trim();
  const folded = _foldForSearch(trimmed);
  const existing = db.prepare('SELECT id, name FROM series').all()
    .find(row => _foldForSearch(row.name) === folded);
  if (existing) {
    if (userId && addToLibrary) db.prepare('INSERT OR IGNORE INTO user_series (user_id, series_id) VALUES (?, ?)').run(userId, existing.id);
    return existing.id;
  }
  const id = db.prepare('INSERT INTO series (name, created_by) VALUES (?, ?)').run(trimmed, userId).lastInsertRowid;
  if (userId) db.prepare('INSERT OR IGNORE INTO user_series (user_id, series_id) VALUES (?, ?)').run(userId, id);
  return id;
}

function getAllSeries(userId) {
  if (userId) {
    return db.prepare(`
      SELECT s.id, s.name, s.description, s.is_public, s.is_open_world,
             CASE WHEN s.created_by = ? THEN 1 ELSE 0 END AS is_owner
      FROM series s
      JOIN user_series us ON us.series_id = s.id AND us.user_id = ?
    `).all(userId, userId)
      .map(r => ({ ...r, is_owner: !!r.is_owner, is_open_world: !!r.is_open_world }))
      .sort(_naturalCompareByName);
  }
  return db.prepare(`
    SELECT s.id, s.name, s.description, s.is_public, s.is_open_world, u.username AS created_by_username
    FROM series s LEFT JOIN users u ON u.id = s.created_by
  `).all().sort(_naturalCompareByName).map(r => ({ ...r, is_open_world: !!r.is_open_world }));
}

function getBookEnemies(bookId) {
  return db.prepare(`
    SELECT id, name, attack, defense, hp, pb
    FROM book_enemies
    WHERE book_id = ?
    ORDER BY name COLLATE NOCASE
  `).all(bookId);
}

function addSeriesToLibrary(userId, seriesId) {
  db.prepare('INSERT OR IGNORE INTO user_series (user_id, series_id) VALUES (?, ?)').run(userId, seriesId);
}

function getSeriesById(id) {
  const r = db.prepare('SELECT id, name, description, is_public, is_open_world, created_by FROM series WHERE id = ?').get(id) ?? null;
  if (r) r.is_open_world = !!r.is_open_world;
  return r;
}

function updateSeries(id, name, description, isPublic, isOpenWorld = null) {
  if (!name?.trim()) return false;
  const old = db.prepare('SELECT is_public, published_at FROM series WHERE id = ?').get(id);
  if (!old) return false;
  const firstPublish = old.is_public !== 1 && !!isPublic && old.published_at == null;
  const owVal = isOpenWorld !== null ? (isOpenWorld ? 1 : 0) : undefined;
  if (owVal !== undefined) {
    db.prepare(`
      UPDATE series
      SET name = ?, description = ?, is_public = ?, is_open_world = ?,
          published_at = CASE WHEN ? THEN strftime('%s','now') ELSE published_at END
      WHERE id = ?
    `).run(name.trim(), description?.trim() || null, isPublic ? 1 : 0, owVal, firstPublish ? 1 : 0, id);
  } else {
    db.prepare(`
      UPDATE series
      SET name = ?, description = ?, is_public = ?,
          published_at = CASE WHEN ? THEN strftime('%s','now') ELSE published_at END
      WHERE id = ?
    `).run(name.trim(), description?.trim() || null, isPublic ? 1 : 0, firstPublish ? 1 : 0, id);
  }
  return true;
}

function getSeriesCharacter(userId, seriesId) {
  const row = db.prepare('SELECT char_data FROM series_characters WHERE user_id = ? AND series_id = ?').get(userId, seriesId);
  try { return JSON.parse(row?.char_data || '{"fields":[]}'); } catch { return { fields: [] }; }
}

function saveSeriesCharacter(userId, seriesId, charData) {
  db.prepare(`
    INSERT INTO series_characters (user_id, series_id, char_data, updated_at)
    VALUES (?, ?, ?, strftime('%s','now'))
    ON CONFLICT(user_id, series_id) DO UPDATE SET char_data = excluded.char_data, updated_at = excluded.updated_at
  `).run(userId, seriesId, JSON.stringify(charData));
}

function getSeriesRuns(userId, seriesId) {
  const rows = db.prepare('SELECT run_index, char_data, started_at, last_book_id, last_section, completed, result, is_public FROM series_runs WHERE user_id = ? AND series_id = ? ORDER BY run_index ASC').all(userId, seriesId);
  return rows.map(r => ({
    run_index:    r.run_index,
    char_data:    (() => { try { return JSON.parse(r.char_data || '{"fields":[]}'); } catch { return { fields: [] }; } })(),
    started_at:   r.started_at,
    last_book_id: r.last_book_id || null,
    last_section: r.last_section || null,
    completed:    !!r.completed,
    result:       r.result || null,
    is_public:    !!r.is_public,
  }));
}

function updateSeriesRunPosition(userId, seriesId, runIndex, bookId, section) {
  db.prepare(`UPDATE series_runs SET last_book_id = ?, last_section = ? WHERE user_id = ? AND series_id = ? AND run_index = ?`)
    .run(bookId, String(section), userId, seriesId, runIndex);
}

function completeSeriesRun(userId, seriesId, runIndex, result) {
  db.prepare(`UPDATE series_runs SET completed = 1, result = ?, last_book_id = NULL, last_section = NULL, completed_at = strftime('%s','now') WHERE user_id = ? AND series_id = ? AND run_index = ?`)
    .run(result, userId, seriesId, runIndex);
}

function updateSeriesRunPublic(userId, seriesId, runIndex, isPublic) {
  db.prepare(`UPDATE series_runs SET is_public = ? WHERE user_id = ? AND series_id = ? AND run_index = ?`)
    .run(isPublic ? 1 : 0, userId, seriesId, runIndex);
}

// When a series is first marked open world, migrate all existing standalone runs
// in its books to preSeriesRuns so they don't get misidentified as series runs.
function migratePreSeriesRuns(seriesId) {
  const minRow = db.prepare(
    'SELECT MIN(started_at) AS min FROM series_runs WHERE series_id = ?'
  ).get(seriesId);
  const minTs = minRow?.min ? minRow.min * 1000 : 0; // 0 = everything is pre-series

  const rows = db.prepare(`
    SELECT ub.user_id, ub.book_id, ub.state_data
    FROM user_books ub JOIN books b ON b.id = ub.book_id
    WHERE b.series_id = ?
  `).all(seriesId);

  const upd = db.prepare('UPDATE user_books SET state_data = ? WHERE user_id = ? AND book_id = ?');
  const migrate = db.transaction(() => {
    for (const row of rows) {
      let s;
      try { s = JSON.parse(row.state_data); } catch { continue; }
      if (s.preSeriesRuns !== undefined) continue; // already migrated
      const pts = s.playthroughs || [];
      const toMigrate = pts.filter(p =>
        p.startedAt && (minTs === 0 || p.startedAt < minTs) &&
        (p.path?.length > 0 || p.completed)
      );
      s.preSeriesRuns = toMigrate;
      if (toMigrate.length > 0) {
        // activePtIndex points into playthroughs by position, not identity -
        // migrating entries out from under it without adjusting would either
        // point past the end of the shrunk array, or (worse) silently land
        // on a *different* surviving playthrough that shifted into that same
        // index, letting the player unknowingly resume the wrong run.
        const toMigrateSet = new Set(toMigrate);
        const activePt = typeof s.activePtIndex === 'number' ? pts[s.activePtIndex] : null;
        s.playthroughs = pts.filter(p => !toMigrateSet.has(p));
        if (activePt && toMigrateSet.has(activePt)) {
          s.activePtIndex = null;
        } else if (activePt) {
          s.activePtIndex = s.playthroughs.indexOf(activePt);
        }
      }
      upd.run(JSON.stringify(s), row.user_id, row.book_id);
    }
  });
  migrate();
}

// Reverse the open-world migration when is_open_world is turned off.
// - Restores preSeriesRuns back into playthroughs (prepended, as they came first)
// - Strips placeholder runs (startedAt=null, path=[], not completed) - sync artifacts
// - Clears preSeriesRuns and resets activePtIndex
// series_runs rows are left intact (historical data; re-enabling would reuse them)
function reverseSeriesOpenWorld(seriesId) {
  const rows = db.prepare(`
    SELECT ub.user_id, ub.book_id, ub.state_data
    FROM user_books ub JOIN books b ON b.id = ub.book_id
    WHERE b.series_id = ?
  `).all(seriesId);

  const upd = db.prepare('UPDATE user_books SET state_data = ? WHERE user_id = ? AND book_id = ?');
  db.transaction(() => {
    for (const row of rows) {
      let s;
      try { s = JSON.parse(row.state_data); } catch { continue; }
      const realRuns = (s.playthroughs || []).filter(
        p => p.startedAt !== null || (p.path?.length > 0) || p.completed
      );
      const preRuns = s.preSeriesRuns || [];
      s.playthroughs = [...preRuns, ...realRuns];
      s.activePtIndex = null;
      delete s.preSeriesRuns;
      upd.run(JSON.stringify(s), row.user_id, row.book_id);
    }
  })();
}

function createSeriesRun(userId, seriesId) {
  const next = (db.prepare('SELECT COALESCE(MAX(run_index) + 1, 0) AS n FROM series_runs WHERE user_id = ? AND series_id = ?').get(userId, seriesId).n);
  db.prepare('INSERT INTO series_runs (user_id, series_id, run_index) VALUES (?, ?, ?)').run(userId, seriesId, next);
  return next;
}

function getActiveSeriesRunsForUser(userId) {
  // Returns active (non-completed) series runs across all open-world series the user is in,
  // where last_book_id is set. Used by the books screen to show "active here" badges.
  return db.prepare(`
    SELECT sr.series_id, sr.run_index, sr.last_book_id, sr.last_section, s.name AS series_name
    FROM series_runs sr
    JOIN series s ON s.id = sr.series_id
    JOIN user_series us ON us.series_id = sr.series_id AND us.user_id = sr.user_id
    WHERE sr.user_id = ?
      AND sr.completed = 0
      AND sr.last_book_id IS NOT NULL
      AND s.is_open_world = 1
  `).all(userId);
}

function deleteSeriesRun(userId, seriesId, runIndex) {
  db.transaction(() => {
    db.prepare('DELETE FROM series_runs WHERE user_id = ? AND series_id = ? AND run_index = ?').run(userId, seriesId, runIndex);
    db.prepare('UPDATE series_runs SET run_index = run_index - 1 WHERE user_id = ? AND series_id = ? AND run_index > ?').run(userId, seriesId, runIndex);
  })();
}

function patchSeriesRunDeletion(userId, seriesId, runIndex) {
  const bookIds = db.prepare('SELECT id FROM books WHERE series_id = ?').all(seriesId).map(r => r.id);
  for (const bookId of bookIds) {
    const row = db.prepare('SELECT state_data FROM user_books WHERE user_id = ? AND book_id = ?').get(userId, bookId);
    if (!row?.state_data) continue;
    let stateObj;
    try { stateObj = JSON.parse(row.state_data); } catch (e) {
      // This book's own playthroughs array won't get re-spliced/renumbered to
      // match the series_runs rows this same deletion just shifted - silently
      // skipping used to leave that mismatch with zero trace of why.
      console.warn(`[series-run-delete] user ${userId} series ${seriesId} book ${bookId}: unparseable state_data, run-index patch skipped:`, e.message);
      continue;
    }
    if (!Array.isArray(stateObj.playthroughs) || stateObj.playthroughs.length <= runIndex) continue;
    stateObj.playthroughs.splice(runIndex, 1);
    if (stateObj.activePtIndex === runIndex) {
      stateObj.activePtIndex = null;
    } else if (typeof stateObj.activePtIndex === 'number' && stateObj.activePtIndex > runIndex) {
      stateObj.activePtIndex -= 1;
    }
    db.prepare('UPDATE user_books SET state_data = ?, updated_at = strftime(\'%s\',\'now\') WHERE user_id = ? AND book_id = ?')
      .run(JSON.stringify(stateObj), userId, bookId);
  }
}

function resetSeriesForUser(userId, seriesId) {
  const bookIds = db.prepare('SELECT id FROM books WHERE series_id = ?').all(seriesId).map(r => r.id);
  db.transaction(() => {
    db.prepare('DELETE FROM series_runs WHERE user_id = ? AND series_id = ?').run(userId, seriesId);
    for (const bookId of bookIds) resetBookProgress(userId, bookId);
    // Open-world series books log per-run XP (win_run/death_run/etc, see
    // xp.js's processStateXp) under a series-scoped ref (`series:<id>:...`),
    // not a book-scoped one, so the run isn't double-counted across every
    // book in the series. resetBookProgress's own cleanup only ever matches
    // bookId-scoped refs, so those series-scoped rows survive a per-book
    // reset untouched - safe to do here instead, since resetting the whole
    // series (every member book, above) is the one case where nothing else
    // in the series could still legitimately depend on that run history.
    const placeholders = RESETTABLE_PROGRESS_EVENTS.map(() => '?').join(',');
    db.prepare(`
      DELETE FROM xp_events
      WHERE user_id = ?
        AND event IN (${placeholders})
        AND ref LIKE ?
    `).run(userId, ...RESETTABLE_PROGRESS_EVENTS, `series:${seriesId}:%`);
  })();
  return bookIds;
}

function updateSeriesRun(userId, seriesId, runIndex, charData) {
  db.prepare(`
    INSERT INTO series_runs (user_id, series_id, run_index, char_data)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, series_id, run_index) DO UPDATE SET char_data = excluded.char_data
  `).run(userId, seriesId, runIndex, JSON.stringify(charData));
}

function deleteSeries(seriesId) {
  // Full admin-level delete - orphan books, remove all user_series, delete row
  db.prepare('UPDATE books SET series_id = NULL, series_number = NULL WHERE series_id = ?').run(seriesId);
  db.prepare('DELETE FROM user_series WHERE series_id = ?').run(seriesId);
  db.prepare('DELETE FROM series WHERE id = ?').run(seriesId);
}

function deleteSeriesRow(seriesId) {
  db.prepare('DELETE FROM series WHERE id = ?').run(seriesId);
}

function countSeriesOtherUsers(seriesId, excludeUserId) {
  return db.prepare('SELECT COUNT(*) AS n FROM user_series WHERE series_id = ? AND user_id != ?').get(seriesId, excludeUserId).n;
}

function countBooksInSeries(seriesId) {
  return db.prepare('SELECT COUNT(*) AS n FROM books WHERE series_id = ?').get(seriesId).n;
}

function getNextSeriesUser(seriesId) {
  return db.prepare('SELECT user_id FROM user_series WHERE series_id = ? ORDER BY added_at ASC LIMIT 1').get(seriesId) ?? null;
}

function transferSeriesOwnership(seriesId, newOwnerId) {
  db.prepare('UPDATE series SET created_by = ? WHERE id = ?').run(newOwnerId, seriesId);
}

function removeSeriesEntryOnly(userId, seriesId) {
  // Remove just the user_series row - books stay in library as standalones
  db.prepare('DELETE FROM user_series WHERE user_id = ? AND series_id = ?').run(userId, seriesId);
}

function removeSeriesFromLibrary(userId, seriesId) {
  // Remove user_series row and remove series books from the user's library,
  // but preserve anthology children when their anthology parent remains in the library.
  db.transaction(() => {
    db.prepare('DELETE FROM user_series WHERE user_id = ? AND series_id = ?').run(userId, seriesId);

    const candidates = db.prepare(`
      SELECT b.id, b.parent_book_id
      FROM books b
      WHERE b.series_id = ?
         OR EXISTS (SELECT 1 FROM books p WHERE p.id = b.parent_book_id AND p.series_id = ?)
    `).all(seriesId, seriesId);

    const parentStillOwnedStmt = db.prepare(`
      SELECT 1
      FROM user_books ub
      JOIN books p ON p.id = ub.book_id
      WHERE ub.user_id = ?
        AND ub.book_id = ?
        AND (p.series_id IS NULL OR p.series_id != ?)
      LIMIT 1
    `);
    const delStmt = db.prepare('DELETE FROM user_books WHERE user_id = ? AND book_id = ?');

    for (const row of candidates) {
      if (row.parent_book_id) {
        const parentStillOwned = parentStillOwnedStmt.get(userId, row.parent_book_id, seriesId);
        if (parentStillOwned) continue;
      }
      delStmt.run(userId, row.id);
    }
  })();
}

function createSeries(name, description, userId, isPublic = false) {
  const trimmed = (name || '').trim();
  if (!trimmed) return null;
  const folded = _foldForSearch(trimmed);
  const existing = db.prepare(`
    SELECT s.id, s.name, u.username AS created_by_username
    FROM series s LEFT JOIN users u ON u.id = s.created_by
  `).all().find(row => _foldForSearch(row.name) === folded);
  if (existing) {
    if (description?.trim()) {
      db.prepare('UPDATE series SET description = ? WHERE id = ? AND (description IS NULL OR description = \'\')').run(description.trim(), existing.id);
    }
    if (userId) db.prepare('INSERT OR IGNORE INTO user_series (user_id, series_id) VALUES (?, ?)').run(userId, existing.id);
    return { id: existing.id, name: existing.name, existed: true, createdByUsername: existing.created_by_username || null };
  }
  const id = db.prepare(`
    INSERT INTO series (name, description, created_by, is_public, published_at)
    VALUES (?, ?, ?, ?, CASE WHEN ? THEN strftime('%s','now') ELSE NULL END)
  `).run(trimmed, description?.trim() || null, userId, isPublic ? 1 : 0, isPublic ? 1 : 0).lastInsertRowid;
  if (userId) db.prepare('INSERT OR IGNORE INTO user_series (user_id, series_id) VALUES (?, ?)').run(userId, id);
  return { id, name: trimmed, existed: false };
}

function getPublicSeriesInfo(seriesId) {
  const series = db.prepare('SELECT id, name, description, is_public FROM series WHERE id = ? AND is_public = 1').get(seriesId);
  if (!series) return null;
  // Top-level books/anthologies in this series only (no anthology children)
  const books = db.prepare(
    `SELECT b.id, b.name, b.total_sections, b.cover_path, b.is_container, b.series_number,
            b.isbn, b.issn, b.pages, b.authors,
            (SELECT COUNT(*) FROM books c WHERE c.parent_book_id = b.id AND c.is_demo = 0) AS child_count
     FROM books b
     WHERE b.series_id = ? AND b.is_demo = 0
       AND (b.parent_book_id IS NULL OR b.parent_book_id = 0)
       AND (b.is_public = 1 OR b.is_container = 1)
     ORDER BY CASE WHEN b.series_number IS NULL OR b.series_number = '' THEN 1 ELSE 0 END,
              CAST(b.series_number AS REAL)`
  ).all(seriesId);
  const childrenStmt = db.prepare(
    `SELECT id, name, total_sections, cover_path, isbn, issn, pages, authors
     FROM books WHERE parent_book_id = ? AND is_demo = 0 AND is_public = 1
     ORDER BY COALESCE(book_order, id)`
  );
  books.sort((a, b) => {
    const aNum = a.series_number == null || a.series_number === '' ? Number.NaN : Number(a.series_number);
    const bNum = b.series_number == null || b.series_number === '' ? Number.NaN : Number(b.series_number);
    const aValid = Number.isFinite(aNum);
    const bValid = Number.isFinite(bNum);
    if (aValid && bValid && aNum !== bNum) return aNum - bNum;
    if (aValid !== bValid) return aValid ? -1 : 1;
    return _naturalCompare(a.name, b.name);
  });
  const agg = _getAggregateSeriesRating(series.id);
  return {
    id:          series.id,
    name:        series.name,
    description: series.description || null,
    isPublic:    series.is_public === 1,
    avgRating:   agg.avgRating,
    voteCount:   agg.voteCount,
    books: books.map(b => {
      const isContainer = b.is_container === 1;
      const children = isContainer
        ? childrenStmt.all(b.id).map(c => ({
            id:            c.id,
            name:          c.name,
            totalSections: c.total_sections,
            coverUrl:      c.cover_path ? `/covers/${c.cover_path}` : null,
            isbn:          c.isbn || null,
            issn:          c.issn || null,
            pages:         c.pages || null,
            authors:       c.authors || null,
          }))
        : [];
      return {
        id:            b.id,
        name:          b.name,
        totalSections: b.total_sections,
        coverUrl:      b.cover_path ? `/covers/${b.cover_path}` : null,
        isContainer,
        seriesNumber:  b.series_number || null,
        childCount:    b.child_count || 0,
        isbn:          b.isbn || null,
        issn:          b.issn || null,
        pages:         b.pages || null,
        authors:       b.authors || null,
        children,
      };
    }),
  };
}

function normalizeAuthors(raw) {
  if (!raw) return null;
  const parts = raw.split(/\s*,\s*/).map(a => a.trim()).filter(Boolean);
  if (!parts.length) return null;
  parts.sort((a, b) => a.localeCompare(b));
  return parts.join(', ');
}

function createBook(userId, name, totalSections, isbn, issn, asin, pages, authors, description, seriesId, seriesNumber, isContainer, parentBookId, bookOrder, isPublic = false) {
  const initialState = JSON.stringify({
    bookName: name,
    totalSections,
    graph: {},
    playthroughs: [],
    activePtIndex: null,
    positions: {},
  });
  const bookResult = db.prepare(
    `INSERT INTO books (
      name, total_sections, isbn, issn, asin, pages, authors, description, created_by,
      series_id, series_number, is_container, parent_book_id, book_order, is_public, published_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? THEN strftime('%s','now') ELSE NULL END)`
  ).run(name, totalSections, isbn || null, issn || null, asin || null, pages || null, normalizeAuthors(authors), description || null, userId, seriesId || null, seriesNumber || null, isContainer ? 1 : 0, parentBookId || null, bookOrder ?? null, isPublic ? 1 : 0, isPublic ? 1 : 0);
  const bookId = bookResult.lastInsertRowid;
  db.prepare(
    'INSERT INTO user_books (user_id, book_id, state_data) VALUES (?, ?, ?)'
  ).run(userId, bookId, initialState);
  return {
    id: bookId,
    name,
    total_sections: totalSections,
    isbn: isbn || null,
    issn: issn || null,
    asin: asin || null,
    pages: pages || null,
    authors: authors || null,
    description: description || null,
    is_public: isPublic ? 1 : 0,
  };
}

function getBookState(userId, bookId) {
  const ub = db.prepare(
    'SELECT state_data FROM user_books WHERE book_id = ? AND user_id = ?'
  ).get(bookId, userId);
  if (!ub) return null;
  let s;
  try { s = JSON.parse(ub.state_data); } catch { s = {}; }
  // Always use the authoritative values from the books table so that a stale
  // saveState() call cannot overwrite a newer updateBook() result.
  const book = db.prepare('SELECT name, total_sections FROM books WHERE id = ?').get(bookId);
  if (book) {
    s.bookName      = book.name;
    s.totalSections = book.total_sections;
  }
  return s;
}

// Which book in an open-world series a user is currently actually playing in
// right now - only one book's own state_data.activePtIndex is ever non-null
// at a time (the app enforces a single active location per series), so that's
// the source of truth for "which book do they need to be watched in", not
// whichever book someone happened to open the watch view from.
function getActiveBookInSeries(userId, seriesId) {
  const rows = db.prepare(
    `SELECT ub.book_id, ub.state_data FROM user_books ub
     JOIN books b ON b.id = ub.book_id
     WHERE ub.user_id = ? AND b.series_id = ?`
  ).all(userId, seriesId);
  for (const row of rows) {
    let s;
    try { s = JSON.parse(row.state_data); } catch { continue; }
    if (s.activePtIndex != null) return row.book_id;
  }
  return null;
}

function getBookById(bookId) {
  const book = db.prepare(`
    SELECT id, name, is_public, is_container, parent_book_id, cover_path, pdf_path
    FROM books
    WHERE id = ?
  `).get(bookId) ?? null;
  if (!book) return null;
  return { ...book, pdf_size: _getPdfSize(book.pdf_path) };
}

// skipTimestamp is set by handleSaveState when the request came from an
// impersonation session - the data itself still saves (an admin fixing a
// stuck state while impersonating should work), but updated_at doesn't
// bump, since admin's own adminGetUsers() query falls back to
// MAX(user_books.updated_at) as a "last active" proxy for users whose
// last_active_at is still null, and that fallback has no way to tell
// genuine user activity apart from an admin just browsing as them.
function saveBookState(userId, bookId, stateObj, { skipTimestamp = false } = {}) {
  // Deduplicate each playthrough's path (preserve first visit order) to guard
  // against unbounded growth if the user cycles through sections repeatedly.
  for (const pt of (stateObj.playthroughs || [])) {
    if (Array.isArray(pt.path) && pt.path.length > 500) {
      const seen = new Set();
      pt.path = pt.path.filter(s => { if (seen.has(s)) return false; seen.add(s); return true; });
    }
  }
  const json = JSON.stringify(stateObj);
  const ubResult = db.prepare(`
    UPDATE user_books SET state_data = ?${skipTimestamp ? '' : ", updated_at = strftime('%s','now')"}
    WHERE book_id = ? AND user_id = ?
  `).run(json, bookId, userId);
  return ubResult.changes > 0;
}

// Shared by resetBookProgress (bookId-scoped cleanup) and resetSeriesForUser
// (series-scoped cleanup, see its own comment) - one list so the two never
// drift apart on which events count as "progress" worth wiping on a reset.
const RESETTABLE_PROGRESS_EVENTS = [
  'discover_node',
  'visit_node',
  'discover_all',
  'visit_all',
  'add_note',
  'set_priority',
  'mark_battle',
  'set_color',
  'death_run',
  'battle_run',
  'win_run',
  'share_run',
  'charsheet_saved',
  'charsheet_run',
  'run_depth',
  'add_charsheet_field',
  'inventory_started',
  'add_item',
  'equipment_started',
  'equip_item',
];

function resetBookProgress(userId, bookId) {
  const book = db.prepare(`
    SELECT name, total_sections
    FROM books
    WHERE id = ?
  `).get(bookId);
  if (!book) return null;

  const stateObj = {
    bookName: book.name || '',
    totalSections: book.total_sections || 0,
    graph: {},
    playthroughs: [],
    activePtIndex: null,
    positions: {},
    charSheetTemplate: null,
    alphanumericSections: false,
  };

  const tx = db.transaction(() => {
    const saved = saveBookState(userId, bookId, stateObj);
    if (!saved) return false;
    const placeholders = RESETTABLE_PROGRESS_EVENTS.map(() => '?').join(',');
    db.prepare(`
      DELETE FROM xp_events
      WHERE user_id = ?
        AND event IN (${placeholders})
        AND (ref = ? OR ref LIKE ?)
    `).run(userId, ...RESETTABLE_PROGRESS_EVENTS, bookId, `${bookId}:%`);
    return true;
  });

  return tx() ? stateObj : null;
}

function updateBook(userId, bookId, name, totalSections, isbn, issn, asin, pages, authors, description, discoverableSections, isPublic, isAdmin = false, seriesId, seriesNumber, isContainer, parentBookId, bookOrder) {
  // Verify user tracks this book (or is admin)
  let ub = db.prepare('SELECT state_data FROM user_books WHERE book_id = ? AND user_id = ?').get(bookId, userId);
  if (!ub && isAdmin) {
    // Admin may not track the book - use the first available user_books row for state sync
    ub = db.prepare('SELECT state_data FROM user_books WHERE book_id = ? LIMIT 1').get(bookId);
  }
  if (!ub) return false;
  // Only creator can edit book metadata, unless admin
  const bookMeta = db.prepare('SELECT created_by FROM books WHERE id = ?').get(bookId);
  if (!isAdmin && bookMeta?.created_by !== null && bookMeta?.created_by !== userId) return false;
  let stateObj = {};
  try { stateObj = JSON.parse(ub.state_data); } catch {}
  stateObj.bookName      = name;
  stateObj.totalSections = totalSections;

  // Capture old discoverable_sections before overwriting
  const oldBook = db.prepare('SELECT discoverable_sections, is_public, published_at FROM books WHERE id = ?').get(bookId);
  const oldDs   = oldBook?.discoverable_sections ?? null;
  const firstPublish = oldBook?.is_public !== 1 && !!isPublic && oldBook?.published_at == null;

  db.prepare(`
    UPDATE books
    SET name = ?, total_sections = ?, isbn = ?, issn = ?, asin = ?, pages = ?, authors = ?,
        description = ?, discoverable_sections = ?, is_public = ?,
        published_at = CASE WHEN ? THEN strftime('%s','now') ELSE published_at END,
        series_id = ?, series_number = ?, is_container = ?, parent_book_id = ?, book_order = ?,
        updated_at = strftime('%s','now')
    WHERE id = ?
  `).run(name, totalSections, isbn || null, issn || null, asin || null, pages || null,
         normalizeAuthors(authors), description || null, discoverableSections ?? null, isPublic ? 1 : 0, firstPublish ? 1 : 0,
         seriesId ?? null, seriesNumber || null, isContainer ? 1 : 0, parentBookId ?? null, bookOrder ?? null,
         bookId);
  db.prepare(`
    UPDATE user_books SET state_data = ?, updated_at = strftime('%s','now')
    WHERE book_id = ? AND user_id = ?
  `).run(JSON.stringify(stateObj), bookId, userId);

  // Retroactive XP: fire discover_all / visit_all for every user of this book
  // if discoverable_sections was just set or changed to a new value.
  if (discoverableSections != null && discoverableSections !== oldDs) {
    const userRows = db.prepare('SELECT user_id, state_data FROM user_books WHERE book_id = ?').all(bookId);
    for (const row of userRows) {
      let s = {}; try { s = JSON.parse(row.state_data || '{}'); } catch {}
      const disc = _discoveredSet(s.graph || {});
      const vis  = new Set([...(_visitedSet(s.playthroughs || [])), ...(_mappedSet(s.graph || {}))]);
      if (disc.size >= discoverableSections) {
        awardXp(row.user_id, 'discover_all', bookId);
        _checkGroupMilestone(row.user_id, seriesId, parentBookId,
          'discover_all', 'discover_all_series', 'discover_all_anthology');
      }
      const trulyVisited = vis.size >= discoverableSections
        ? vis.size
        : Math.max(vis.size, _permanentVisitedCount(row.user_id, bookId));
      if (trulyVisited >= discoverableSections) {
        awardXp(row.user_id, 'visit_all', bookId);
        awardCoins(row.user_id, 'book_completed', bookId, 1);
        _checkGroupMilestone(row.user_id, seriesId, parentBookId,
          'visit_all', 'visit_all_series', 'visit_all_anthology', true);
      }
    }
  }

  return true;
}

function getNotebook(userId, bookId) {
  const row = db.prepare('SELECT notebook FROM user_books WHERE book_id = ? AND user_id = ?').get(bookId, userId);
  if (!row) return null;
  return row.notebook ?? '';
}

function setNotebook(userId, bookId, text) {
  const result = db.prepare(
    'UPDATE user_books SET notebook = ? WHERE book_id = ? AND user_id = ?'
  ).run(text || null, bookId, userId);
  return result.changes > 0;
}

function deleteBook(userId, bookId, cascade = true) {
  const isContainer = db.prepare('SELECT is_container FROM books WHERE id = ?').get(bookId)?.is_container;
  if (isContainer && cascade) {
    // Remove anthology AND all its children from user's library
    const childIds = db.prepare('SELECT id FROM books WHERE parent_book_id = ?').all(bookId).map(r => r.id);
    for (const cid of childIds) db.prepare('DELETE FROM user_books WHERE book_id = ? AND user_id = ?').run(cid, userId);
  }
  // If not cascading, children stay in library as standalone (parent_book_id still points to the anthology,
  // but since the anthology is removed from user_books, they'll render as orphaned standalones)
  const result = db.prepare(
    'DELETE FROM user_books WHERE book_id = ? AND user_id = ?'
  ).run(bookId, userId);
  if (result.changes === 0 && !isContainer) return false;

  // Option B: if the deleting user was the creator, transfer ownership to the next user
  const book = db.prepare('SELECT cover_path, created_by FROM books WHERE id = ?').get(bookId);
  if (book?.created_by === userId) {
    const nextUser = db.prepare('SELECT user_id FROM user_books WHERE book_id = ? ORDER BY created_at ASC LIMIT 1').get(bookId);
    if (nextUser) {
      db.prepare('UPDATE books SET created_by = ? WHERE id = ?').run(nextUser.user_id, bookId);
    }
  }

  // Clean up book row if no other users track it
  const remaining = db.prepare('SELECT COUNT(*) AS n FROM user_books WHERE book_id = ?').get(bookId).n;
  if (remaining === 0) {
    if (book?.cover_path) {
      try { require('fs').unlinkSync(require('path').join(__dirname, '..', '..', 'public', 'covers', book.cover_path)); } catch (_) {}
    }
    // Orphan children of this anthology before deleting
    db.prepare('UPDATE books SET parent_book_id = NULL WHERE parent_book_id = ?').run(bookId);
    db.prepare('DELETE FROM books WHERE id = ?').run(bookId);
  }
  return true;
}

function addBookToLibrary(userId, bookId) {
  const book = db.prepare('SELECT id, name, total_sections, is_public, created_by, is_container FROM books WHERE id = ? AND is_demo = 0').get(bookId);
  if (!book || !book.is_public) return { ok: false, reason: 'not_public' };
  const existing = db.prepare('SELECT book_id FROM user_books WHERE user_id = ? AND book_id = ?').get(userId, bookId);
  if (!existing) {
    const initialState = JSON.stringify({
      bookName: book.name, totalSections: book.total_sections,
      graph: {}, playthroughs: [], activePtIndex: null, positions: {},
    });
    db.prepare('INSERT INTO user_books (user_id, book_id, state_data) VALUES (?, ?, ?)').run(userId, bookId, initialState);
    awardXp(userId, 'add_to_library', String(bookId));
    if (book.created_by && book.created_by !== userId)
      awardXp(book.created_by, 'book_added_by_other', String(bookId) + ':' + String(userId));
  }
  // Cascade: if this is an anthology container, also add all its public children
  if (book.is_container) {
    const children = db.prepare('SELECT id, name, total_sections, is_public, created_by FROM books WHERE parent_book_id = ? AND is_demo = 0 AND is_public = 1').all(bookId);
    for (const child of children) {
      const childExists = db.prepare('SELECT book_id FROM user_books WHERE user_id = ? AND book_id = ?').get(userId, child.id);
      if (!childExists) {
        const childState = JSON.stringify({
          bookName: child.name, totalSections: child.total_sections,
          graph: {}, playthroughs: [], activePtIndex: null, positions: {},
        });
        db.prepare('INSERT INTO user_books (user_id, book_id, state_data) VALUES (?, ?, ?)').run(userId, child.id, childState);
        awardXp(userId, 'add_to_library', String(child.id));
        if (child.created_by && child.created_by !== userId)
          awardXp(child.created_by, 'book_added_by_other', String(child.id) + ':' + String(userId));
      }
    }
  }
  return { ok: true };
}

// ── Ratings ───────────────────────────────────────────────────────────────────
// Lived physically in a different part of the original file (interleaved with
// feed-related code), moved here since getBooks()/getPublicSeriesInfo() above
// already depend on it and ratings are fundamentally book/series data.

// Resolve the user's own user_books entry for a given book (matching by ISBN/ISSN if available)
function _getUserBookId(userId, bookId) {
  const row = db.prepare('SELECT book_id FROM user_books WHERE user_id = ? AND book_id = ?').get(userId, bookId);
  return row ? row.book_id : null;
}

function _getAggregateRating(bookId) {
  const row = db.prepare(
    `SELECT AVG(rating) AS avg_rating, COUNT(rating) AS vote_count
     FROM user_books WHERE book_id = ? AND rating IS NOT NULL`
  ).get(bookId);
  return { avgRating: row?.avg_rating ?? null, voteCount: row?.vote_count || 0 };
}

// Per-author derived rating for a book's authors field (a free-text,
// comma-separated field - see normalizeAuthors - not a normalized author
// table), shown next to each author's name in the cover-activity dialog.
// One name can appear on several books, so this pools every individual
// rating across every public book crediting that exact name and averages
// them directly (not an average of each book's own average), which weights
// naturally toward books with more ratings rather than treating a
// one-vote book the same as a hundred-vote one.
function _getAuthorRatings(authorsField) {
  const names = (authorsField || '').split(/\s*,\s*/).map(a => a.trim()).filter(Boolean);
  if (!names.length) return [];
  const allBooks = db.prepare(
    `SELECT id, authors FROM books WHERE is_public = 1 AND is_demo = 0 AND authors IS NOT NULL`
  ).all();
  return names.map(name => {
    const matchingIds = allBooks
      .filter(b => b.authors.split(/\s*,\s*/).map(a => a.trim()).includes(name))
      .map(b => b.id);
    if (!matchingIds.length) return { name, avgRating: null, voteCount: 0 };
    const placeholders = matchingIds.map(() => '?').join(',');
    const row = db.prepare(
      `SELECT AVG(rating) AS avg_rating, COUNT(rating) AS vote_count
       FROM user_books WHERE book_id IN (${placeholders}) AND rating IS NOT NULL`
    ).get(...matchingIds);
    return { name, avgRating: row?.avg_rating ?? null, voteCount: row?.vote_count || 0 };
  });
}

const _RUN_EVENTS = `('win_run','death_run','battle_run')`;

// Returns true if user has completed at least one run of any kind for a standalone book.
function _userHasRun(userId, bookId) {
  return !!db.prepare(
    `SELECT 1 FROM xp_events WHERE user_id = ? AND event IN ${_RUN_EVENTS} AND ref LIKE ? LIMIT 1`
  ).get(userId, `${bookId}:%`);
}

// Returns true if the user may rate the given book or anthology.
function canUserRateBook(userId, bookId) {
  const book = db.prepare('SELECT is_container FROM books WHERE id = ?').get(bookId);
  if (!book) return false;
  if (!book.is_container) return _userHasRun(userId, bookId);
  // Anthology: every child must have at least one run.
  const children = db.prepare('SELECT id FROM books WHERE parent_book_id = ? AND is_demo = 0').all(bookId);
  if (children.length === 0) return false;
  return children.every(c => _userHasRun(userId, c.id));
}

// Returns true if the user may rate the given series.
// Each top-level item must satisfy canUserRateBook (handles books and anthologies correctly).
function canUserRateSeries(userId, seriesId) {
  const items = db.prepare(
    `SELECT id FROM books WHERE series_id = ? AND is_demo = 0
       AND (parent_book_id IS NULL OR parent_book_id = 0)`
  ).all(seriesId);
  if (items.length === 0) return false;
  return items.every(b => canUserRateBook(userId, b.id));
}

// One-time cleanup: clear ratings that no longer satisfy the new rules.
{
  const rated = db.prepare('SELECT DISTINCT user_id, book_id FROM user_books WHERE rating IS NOT NULL').all();
  db.transaction(() => {
    for (const { user_id, book_id } of rated) {
      if (!canUserRateBook(user_id, book_id))
        db.prepare('UPDATE user_books SET rating = NULL WHERE user_id = ? AND book_id = ?').run(user_id, book_id);
    }
    // Series ratings (column just added - nothing to clean yet, but future-proof).
    const ratedSeries = db.prepare('SELECT user_id, series_id FROM user_series WHERE rating IS NOT NULL').all();
    for (const { user_id, series_id } of ratedSeries) {
      if (!canUserRateSeries(user_id, series_id))
        db.prepare('UPDATE user_series SET rating = NULL WHERE user_id = ? AND series_id = ?').run(user_id, series_id);
    }
  })();
}

function getBookRating(userId, bookId) {
  const ownBookId = _getUserBookId(userId, bookId);
  if (ownBookId === null) return null;
  const row = db.prepare('SELECT rating FROM user_books WHERE user_id = ? AND book_id = ?').get(userId, ownBookId);
  const agg = _getAggregateRating(bookId);
  const canRate = canUserRateBook(userId, bookId);
  return { rating: row?.rating ?? null, userBookId: ownBookId, avgRating: agg.avgRating, voteCount: agg.voteCount, canRate };
}

const VALID_RATINGS = new Set([0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]);

function setBookRating(userId, bookId, rating) {
  if (rating !== null && !VALID_RATINGS.has(rating)) return null;
  const ownBookId = _getUserBookId(userId, bookId);
  if (ownBookId === null) return null;
  if (rating !== null && !canUserRateBook(userId, bookId)) return { blocked: true };
  db.prepare('UPDATE user_books SET rating = ?, rated_at = ? WHERE user_id = ? AND book_id = ?')
    .run(rating, rating !== null ? Math.floor(Date.now() / 1000) : null, userId, ownBookId);
  const xpAwarded = rating !== null ? awardXp(userId, 'rate_book', ownBookId) : false;
  const agg = _getAggregateRating(bookId);
  return { userBookId: ownBookId, xpAwarded, avgRating: agg.avgRating, voteCount: agg.voteCount };
}

function _getAggregateSeriesRating(seriesId) {
  const row = db.prepare(
    `SELECT AVG(rating) AS avg_rating, COUNT(rating) AS vote_count
     FROM user_series WHERE series_id = ? AND rating IS NOT NULL`
  ).get(seriesId);
  return { avgRating: row?.avg_rating ?? null, voteCount: row?.vote_count || 0 };
}

function getSeriesRating(userId, seriesId) {
  const member = db.prepare('SELECT rating FROM user_series WHERE user_id = ? AND series_id = ?').get(userId, seriesId);
  if (!member) return null;
  const agg = _getAggregateSeriesRating(seriesId);
  const canRate = canUserRateSeries(userId, seriesId);
  return { rating: member.rating ?? null, avgRating: agg.avgRating, voteCount: agg.voteCount, canRate };
}

function setSeriesRating(userId, seriesId, rating) {
  if (rating !== null && !VALID_RATINGS.has(rating)) return null;
  const member = db.prepare('SELECT 1 FROM user_series WHERE user_id = ? AND series_id = ?').get(userId, seriesId);
  if (!member) return null;
  if (rating !== null && !canUserRateSeries(userId, seriesId)) return { blocked: true };
  db.prepare('UPDATE user_series SET rating = ?, rated_at = ? WHERE user_id = ? AND series_id = ?')
    .run(rating, rating !== null ? Math.floor(Date.now() / 1000) : null, userId, seriesId);
  const xpAwarded = rating !== null ? awardXp(userId, 'rate_series', String(seriesId)) : false;
  const agg = _getAggregateSeriesRating(seriesId);
  return { xpAwarded, avgRating: agg.avgRating, voteCount: agg.voteCount };
}

module.exports = {
  getBooks, getStashes, createStash, updateStash, deleteStash,
  setBookBgPref, getBookBgPref, awardPdfXp, setBookPdf, removeBookCover, removeBookPdf, setBookCover,
  getBookContainerFields, getOrCreateSeries, getAllSeries, getBookEnemies, addSeriesToLibrary,
  addAnthologyMember, removeAnthologyMember, getAnthologyExtraMembers,
  _pruneRedundantAnthologyMembership,
  getBookSection, _canLiveRead,
  getSeriesById, updateSeries, getSeriesCharacter, saveSeriesCharacter, getSeriesRuns,
  updateSeriesRunPosition, completeSeriesRun, updateSeriesRunPublic, migratePreSeriesRuns,
  reverseSeriesOpenWorld, createSeriesRun, getActiveSeriesRunsForUser, deleteSeriesRun,
  patchSeriesRunDeletion, resetSeriesForUser, updateSeriesRun, deleteSeries, deleteSeriesRow,
  countSeriesOtherUsers, countBooksInSeries, getNextSeriesUser, transferSeriesOwnership,
  removeSeriesEntryOnly, removeSeriesFromLibrary, createSeries, getPublicSeriesInfo,
  normalizeAuthors, createBook, getBookState, getActiveBookInSeries, getBookById, saveBookState, resetBookProgress,
  updateBook, getNotebook, setNotebook, deleteBook, addBookToLibrary,
  _getUserBookId, _getAggregateRating, _getAuthorRatings, canUserRateBook, canUserRateSeries,
  getBookRating, setBookRating, _getAggregateSeriesRating, getSeriesRating, setSeriesRating,
};
