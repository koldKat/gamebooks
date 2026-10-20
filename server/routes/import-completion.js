'use strict';

const { db } = require('../db/connection');
const { requireLocalhost, send } = require('../request-helpers');
const { publicCatalogPush } = require('../sse');

const REQUIRED_CHECKS = [
  'paragraph_implosion_ck', 'paragraph_explosion_ck', 'section_glue_ck',
  'links_conservative_ck', 'graph_connectivity_ck', 'frontmatter_done',
  'enemy_roster_reported', 'prose_full_read', 'paragraph_structure_verified',
];

// Offline import finalization calls this only after completing its audit file.
// Reuse the public catalog stream so viewers retain their own display preferences.
function handleImportComplete(req, res, bookId) {
  if (!requireLocalhost(req, res)) return;
  const book = db.prepare(`SELECT b.has_live_reading, b.has_battle_sim, b.is_container,
    c.*, EXISTS(SELECT 1 FROM book_sections s WHERE s.book_id=b.id) AS has_sections
    FROM books b LEFT JOIN book_import_checklist c ON c.book_id=b.id WHERE b.id=?`).get(bookId);
  if (!book) return send(res, 404, { error: 'Book not found' });
  if (book.is_container || !book.has_live_reading || !book.has_sections || book.unimportable
      || !REQUIRED_CHECKS.every(key => book[key] === 1)
      || ![0, 1].includes(book.sim_applicable)
      || (book.sim_applicable === 1 && (!book.sim_registered || !book.has_battle_sim))) {
    return send(res, 409, { error: 'Book import is not complete' });
  }
  publicCatalogPush({ type: 'public_catalog_changed', entity: 'book', id: bookId, action: 'import_complete' });
  return send(res, 200, { ok: true, bookId });
}

module.exports = { handleImportComplete };
