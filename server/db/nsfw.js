'use strict';

// Store book content classifications and describe which public artwork to hide.
const INITIAL_BOOKS = new Map([
  [1283, 'Night Shift'], [1801, 'Escape the Monster Breeding Grounds'], [1847, 'Club 42'],
  [1875, 'The Classics Professor'], [1876, 'Kathryn in the City'],
  [2358, 'Futa Nightclub : A Date with Claire'], [2384, 'Choose Your Shot'],
  [2457, "My Lady's Choosing"], [2462, 'Take Me There'],
  [2532, 'Pick Your Pleasure'], [2533, 'Pick Your Pleasure 2'],
  [2665, 'Sextrap Dungeon'], [2666, 'Critical Ass'], [2667, 'Clock Tease'],
  [2803, 'Becca, Reporting for Duty'], [2804, 'Lauren, Riding Off Trail'],
  [2805, 'Charlotte, Prowling for Enchantment'], [3187, 'A Girl Walks Into a Bar'],
  [3188, 'A Girl Walks Into a Wedding'], [3189, 'Soapy Bimbo Car Wash Fantasy'],
  [3190, 'Succubus Fantasy'], [3191, 'Cuckolding Fantasy'],
]);

function initializeNsfw(db) {
  if (db.prepare('PRAGMA table_info(books)').all().some(c => c.name === 'is_nsfw')) return;
  db.transaction(() => {
    db.exec('ALTER TABLE books ADD COLUMN is_nsfw INTEGER NOT NULL DEFAULT 0 CHECK(is_nsfw IN (0,1))');
    const mark = db.prepare('UPDATE books SET is_nsfw = 1 WHERE id = ? AND name = ?');
    for (const [id, name] of INITIAL_BOOKS) mark.run(id, name);
  })();
}

function getNsfwCatalog(db) {
  const rows = db.prepare('SELECT id,cover_path FROM books WHERE is_nsfw = 1 AND is_public = 1').all();
  const anthologies = db.prepare(`
    WITH members AS (
      SELECT parent_book_id AS anthology_id,id AS book_id FROM books WHERE parent_book_id IS NOT NULL
      UNION SELECT anthology_id,book_id FROM book_anthology_memberships
    )
    SELECT a.id,a.cover_path FROM members m
    JOIN books a ON a.id=m.anthology_id JOIN books b ON b.id=m.book_id
    WHERE a.is_public=1 AND b.is_public=1
    GROUP BY a.id HAVING MIN(b.is_nsfw)=1
  `).all();
  const series = db.prepare(`
    WITH members AS (
      SELECT COALESCE(b.series_id,p.series_id) AS series_id,b.id,b.is_nsfw FROM books b
      LEFT JOIN books p ON p.id=b.parent_book_id AND p.is_public=1
      WHERE b.is_public=1 AND b.is_container=0
      UNION
      SELECT a.series_id,b.id,b.is_nsfw FROM book_anthology_memberships m
      JOIN books a ON a.id=m.anthology_id JOIN books b ON b.id=m.book_id
      WHERE a.is_public=1 AND b.is_public=1
    )
    SELECT series_id AS id FROM members WHERE series_id IS NOT NULL
    GROUP BY series_id HAVING MIN(is_nsfw)=1
  `).all();
  return {
    bookIds: [...new Set([...rows,...anthologies].map(r => r.id))],
    coverUrls: [...new Set([...rows,...anthologies].filter(r => r.cover_path).map(r => `/covers/${r.cover_path}`))],
    seriesIds: series.map(r => r.id),
  };
}

module.exports = { initializeNsfw, getNsfwCatalog };
