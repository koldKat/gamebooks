'use strict';
const path = require('node:path');
const Database = require('better-sqlite3');
const { getBookEnemyRows } = require('../../server/db/enemy-rosters');

// Book-content checks use the installed catalog, never a second checked-in copy.
// Opening this helper cannot run migrations or write to the application database.
function withDatabase(read) {
  const databasePath = process.env.GAMEBOOKS_TEST_DATABASE || path.resolve(__dirname, '../../database.sqlite');
  const db = new Database(databasePath, { readonly: true, fileMustExist: true });
  try { return read(db); } finally { db.close(); }
}

function getRosterRows(bookId) {
  return withDatabase(db => getBookEnemyRows(db, Number(bookId)));
}

function rosterBookIds() {
  return withDatabase(db => db.prepare(`SELECT DISTINCT book_id FROM book_enemies
    WHERE json_valid(stats_json) AND json_extract(stats_json, '$.roster.key') IS NOT NULL
    ORDER BY book_id`).all().map(row => row.book_id));
}

function readRosterDocument(bookId) {
  const id = Number(bookId);
  if (!Number.isSafeInteger(id) || id < 1) throw new RangeError('Invalid roster book ID');
  return withDatabase(db => {
    const enemies = db.prepare(`SELECT name, attack, defense, hp, pb, stats_json
      FROM book_enemies WHERE book_id=? ORDER BY id`).all(id).flatMap(row => {
      let stats;
      try { stats = JSON.parse(row.stats_json); } catch { return []; }
      if (!stats?.roster?.key) return [];
      const { roster, ...values } = stats;
      return [{ key: roster.key, name: row.name, attack: row.attack, defense: row.defense,
        hp: row.hp, pb: row.pb, stats: values, family: roster.family }];
    });
    if (!enemies.length) throw new Error(`No installed roster for book ${id}; use a catalog database for book-content tests (GAMEBOOKS_TEST_DATABASE).`);
    const family = enemies[0].family;
    if (enemies.some(enemy => enemy.family !== family)) throw new Error('Inconsistent installed roster family');
    return { schemaVersion: 1, bookId: id, family, rosterComplete: true,
      enemies: enemies.map(({ family: _family, ...enemy }) => enemy) };
  });
}

module.exports = { readRosterDocument, getRosterRows, rosterBookIds };
