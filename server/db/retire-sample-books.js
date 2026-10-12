'use strict';

// Retire legacy sample records and covers without touching real books or account balances.
const fs = require('fs');
const path = require('path');

const BOOK_EVENTS = new Set([
  'discover_node', 'visit_node', 'discover_all', 'visit_all', 'add_note', 'set_priority',
  'mark_battle', 'set_color', 'run_depth', 'death_run', 'battle_run', 'win_run',
  'first_win', 'first_loss', 'first_battle_death', 'clean_run', 'share_run',
  'charsheet_run', 'charsheet_saved', 'notebook_saved', 'rate_book', 'add_to_library',
  'add_book', 'add_isbn', 'add_issn', 'add_asin', 'add_pages', 'add_authors',
  'add_description', 'make_book_public', 'upload_cover', 'favorite_cover',
  'add_book_to_series', 'add_series_number', 'add_book_to_anthology', 'add_anthology_order',
  'book_added_by_other', 'pdf_available', 'epub_available', 'export_book',
  'inventory_started', 'add_item', 'add_charsheet_field', 'equipment_started',
  'equip_item', 'undo', 'fast_travel',
]);

function retireSampleBooks(db, { coversDir, dropLegacyColumn = true } = {}) {
  const columns = db.prepare('PRAGMA table_info(books)').all().map(c => c.name);
  if (!columns.length) return { removed: 0, coversRemoved: 0 };
  const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(t => t.name));
  const hasFlag = columns.includes('is_demo');
  const legacyState = columns.includes('state_data');
  const samples = hasFlag
    ? db.prepare('SELECT id, cover_path FROM books WHERE is_demo = 1').all()
    : legacyState
      ? db.prepare(`SELECT id, cover_path FROM books
          WHERE json_extract(CASE WHEN json_valid(state_data) THEN state_data ELSE '{}' END, '$.isDemoBook') = 1`).all()
      : [];
  const ids = new Set(samples.map(b => String(b.id)));

  db.transaction(() => {
    // Refs also identify users, series and forum posts; only book events are eligible.
    if (ids.size && tables.has('xp_events')) {
      const del = db.prepare('DELETE FROM xp_events WHERE id = ?');
      for (const e of db.prepare('SELECT id, event, ref FROM xp_events').all()) {
        if (BOOK_EVENTS.has(e.event) && ids.has(String(e.ref).split(':')[0])) del.run(e.id);
      }
    }
    if (ids.size && tables.has('notifications')) {
      const del = db.prepare('DELETE FROM notifications WHERE id = ?');
      for (const n of db.prepare('SELECT id, payload FROM notifications').all()) {
        let payload;
        try { payload = JSON.parse(n.payload); } catch { continue; }
        if (ids.has(String(payload?.bookId))) del.run(n.id);
      }
    }
    const del = db.prepare('DELETE FROM books WHERE id = ?');
    for (const book of samples) {
      if (tables.has('series_runs')) db.prepare('UPDATE series_runs SET last_book_id = NULL, last_section = NULL WHERE last_book_id = ?').run(book.id);
      del.run(book.id); // Foreign keys cascade libraries, parties, stashes and reading data.
    }
    if (hasFlag && dropLegacyColumn) db.exec('ALTER TABLE books DROP COLUMN is_demo');
  })();

  let coversRemoved = 0;
  if (coversDir && fs.existsSync(coversDir)) {
    const referenced = new Set(db.prepare('SELECT cover_path FROM books WHERE cover_path IS NOT NULL').all().map(b => b.cover_path));
    const candidates = new Set(samples.map(b => b.cover_path).filter(Boolean));
    // Earlier deletions left generated covers behind. Require the exact naming convention
    // and SVG label, and never remove a cover still used by a real book.
    for (const entry of fs.readdirSync(coversDir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const name = entry.name;
      if (/^demo_\d+\.svg$/.test(name) && !referenced.has(name)
          && fs.readFileSync(path.join(coversDir, name), 'utf8').includes('Sample Gamebook')) candidates.add(name);
    }
    for (const name of candidates) {
      if (name !== path.basename(name) || referenced.has(name)) continue;
      try {
        const fullPath = path.join(coversDir, name);
        const entry = fs.lstatSync(fullPath);
        if (!entry.isFile() && !entry.isSymbolicLink()) continue;
        fs.unlinkSync(fullPath);
        coversRemoved++;
      }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
  }
  return { removed: samples.length, coversRemoved };
}

module.exports = { retireSampleBooks };
