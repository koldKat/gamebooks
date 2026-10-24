'use strict';

function ensureEnemyRosterSchema(db) {
  if (!db.prepare('PRAGMA table_info(book_enemies)').all().some(column => column.name === 'stats_json')) {
    db.exec('ALTER TABLE book_enemies ADD COLUMN stats_json TEXT DEFAULT NULL');
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_book_enemies_book_name ON book_enemies(book_id, name COLLATE NOCASE)');
}

function getBookEnemyRows(db, bookId) {
  return db.prepare('SELECT id, name, attack, defense, hp, pb, stats_json FROM book_enemies WHERE book_id = ? ORDER BY name COLLATE NOCASE').all(bookId)
    .map(({ stats_json, ...row }) => {
      if (stats_json) {
        try { row.stats = JSON.parse(stats_json); } catch { /* Retain the legacy fields if old metadata is damaged. */ }
      }
      return row;
    });
}

// Update owned rows or explicitly adopt one exact, unambiguous legacy match.
// Existing IDs, unrelated enemy rows and player state are preserved. Repeating
// a seed is a no-op.
function seedEnemyRoster(db, document) {
  if (document?.schemaVersion !== 1 || !Number.isSafeInteger(document.bookId) || document.bookId < 1 ||
      typeof document.family !== 'string' || !document.family || !Array.isArray(document.enemies) || !document.enemies.length) throw new TypeError('Invalid roster document');
  const keys = new Set();
  const entries = document.enemies.map(enemy => {
    if (typeof enemy.key !== 'string' || !enemy.key || keys.has(enemy.key) || typeof enemy.name !== 'string' || !enemy.name.trim() ||
        !enemy.stats || typeof enemy.stats !== 'object' || Array.isArray(enemy.stats)) throw new TypeError('Invalid enemy seed');
    keys.add(enemy.key);
    const values = ['attack', 'defense', 'hp', 'pb'].map(key => {
      const value = enemy[key] ?? null;
      if (value !== null && (typeof value !== 'number' || !Number.isFinite(value))) throw new TypeError('Invalid legacy enemy stat');
      return value;
    });
    const stats = { ...enemy.stats, roster: { schemaVersion: 1, family: document.family, key: enemy.key } };
    if (enemy.adopt && (enemy.adopt.name !== enemy.name || ['attack','defense','hp','pb'].some((key,index)=>
        !Object.hasOwn(enemy.adopt,key) || enemy.adopt[key] !== values[index]))) throw new TypeError('Adoption must preserve every legacy field');
    return { name: enemy.name, values, metadata: JSON.stringify(stats), key: enemy.key, adopt: enemy.adopt };
  });
  if (!db.prepare('SELECT id FROM books WHERE id = ?').get(document.bookId)) throw new RangeError('Roster book does not exist');
  return db.transaction(() => {
    ensureEnemyRosterSchema(db);
    const managed = new Map();
    const existing = db.prepare('SELECT id, name, attack, defense, hp, pb, stats_json FROM book_enemies WHERE book_id = ?').all(document.bookId);
    const used = new Set();
    for (const row of existing) {
      let owner;
      try { owner = JSON.parse(row.stats_json)?.roster; } catch {}
      if (owner?.family === document.family && owner.schemaVersion === 1) {
        if (managed.has(owner.key)) throw new Error('Duplicate managed enemy key');
        managed.set(owner.key, row);
      }
    }
    const insert = db.prepare('INSERT INTO book_enemies (book_id, name, attack, defense, hp, pb, stats_json) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const update = db.prepare('UPDATE book_enemies SET name = ?, attack = ?, defense = ?, hp = ?, pb = ?, stats_json = ? WHERE id = ? AND book_id = ?');
    let inserted = 0, updated = 0;
    for (const entry of entries) {
      let row = managed.get(entry.key);
      if (!row && entry.adopt) {
        const candidates=existing.filter(row=>row.stats_json===null && !used.has(row.id) && row.name===entry.adopt.name &&
          ['attack','defense','hp','pb'].every(key=>row[key]===entry.adopt[key]));
        if(candidates.length!==1)throw new Error('Exact unambiguous legacy roster match required');
        row=candidates[0];
      }
      if(row)used.add(row.id);
      if (!row) { insert.run(document.bookId, entry.name, ...entry.values, entry.metadata); inserted++; }
      else if (row.name !== entry.name || row.stats_json !== entry.metadata || entry.values.some((value, index) => row[['attack', 'defense', 'hp', 'pb'][index]] !== value)) {
        update.run(entry.name, ...entry.values, entry.metadata, row.id, document.bookId); updated++;
      }
    }
    return { inserted, updated };
  })();
}

module.exports = { ensureEnemyRosterSchema, getBookEnemyRows, seedEnemyRoster };
