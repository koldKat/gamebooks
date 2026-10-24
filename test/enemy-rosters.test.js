'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { ensureEnemyRosterSchema, getBookEnemyRows, seedEnemyRoster } = require('../server/db/enemy-rosters');
const seed = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/simulator-rosters/1285.json'), 'utf8'));

function fixture(t) {
  const db = new Database(':memory:');
  t.after(() => db.close());
  db.exec(`CREATE TABLE books(id INTEGER PRIMARY KEY);
    INSERT INTO books VALUES (1285),(246);
    CREATE TABLE book_enemies(id INTEGER PRIMARY KEY,book_id INTEGER,name TEXT,attack INTEGER,defense INTEGER,hp INTEGER,pb INTEGER,created_at INTEGER DEFAULT 42);
    INSERT INTO book_enemies VALUES(1,246,'Existing enemy',5,NULL,12,NULL,123);
    INSERT INTO book_enemies VALUES(2,1285,'Manual enemy',7,2,30,NULL,456);
    CREATE TABLE players(id INTEGER PRIMARY KEY,coins INTEGER,state_data TEXT);
    INSERT INTO players VALUES(1,900,'{"run":3,"sim1285":{"unrelated":true}}');`);
  return db;
}

test('schema migration and legacy API results preserve old enemy rows and player state exactly', t => {
  const db = fixture(t);
  const before = db.prepare('SELECT * FROM players').all();
  ensureEnemyRosterSchema(db);
  ensureEnemyRosterSchema(db);
  assert.deepEqual(getBookEnemyRows(db, 246), [{id:1,name:'Existing enemy',attack:5,defense:null,hp:12,pb:null}]);
  assert.deepEqual(db.prepare('SELECT * FROM players').all(), before);
  assert.equal(db.prepare('SELECT created_at FROM book_enemies WHERE id=1').get().created_at, 123);
});

test('full source seed round-trips all 218 typed parts and is idempotent without replacing IDs', t => {
  const db = fixture(t);
  assert.deepEqual(seedEnemyRoster(db, seed), {inserted:218,updated:0});
  const first = getBookEnemyRows(db, 1285);
  const managed = first.filter(row => row.stats?.roster);
  assert.equal(managed.length, 218);
  assert.equal(new Set(managed.map(row => row.stats.encounter.section)).size, 99);
  for (const expected of seed.enemies) {
    const actual = managed.find(row => row.stats.roster.key === expected.key);
    assert.deepEqual(actual.stats.part, expected.stats.part);
    assert.deepEqual(actual.stats.encounter, expected.stats.encounter);
  }
  assert.deepEqual(seedEnemyRoster(db, seed), {inserted:0,updated:0});
  assert.deepEqual(getBookEnemyRows(db, 1285), first);
  assert.equal(first.find(row=>row.name==='Manual enemy').id,2);
  assert.deepEqual(db.prepare('SELECT * FROM players').all(), [{id:1,coins:900,state_data:'{"run":3,"sim1285":{"unrelated":true}}'}]);
});

test('a corrected seed updates only its managed row while retaining the database ID', t => {
  const db = fixture(t);
  seedEnemyRoster(db, seed);
  const old = getBookEnemyRows(db,1285).find(row=>row.stats?.roster.key===seed.enemies[0].key);
  const corrected = structuredClone(seed);
  corrected.enemies[0].stats.part.health++;
  assert.deepEqual(seedEnemyRoster(db,corrected),{inserted:0,updated:1});
  const next=getBookEnemyRows(db,1285).find(row=>row.id===old.id);
  assert.equal(next.stats.part.health,old.stats.part.health+1);
  assert.deepEqual(getBookEnemyRows(db,246),[{id:1,name:'Existing enemy',attack:5,defense:null,hp:12,pb:null}]);
});

test('invalid or duplicate seed keys fail before schema or content changes', t => {
  const db = fixture(t);
  const bad = structuredClone(seed); bad.enemies.push(bad.enemies[0]);
  assert.throws(()=>seedEnemyRoster(db,bad),/Invalid enemy/);
  assert.equal(db.prepare('PRAGMA table_info(book_enemies)').all().some(c=>c.name==='stats_json'),false);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM book_enemies').get().n,2);
});

test('every staged repair seed is valid and retains all structured source data', t => {
  const db = fixture(t);
  for (const name of fs.readdirSync(path.join(__dirname,'../data/simulator-rosters'))) {
    const document=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/simulator-rosters',name),'utf8'));
    db.prepare('INSERT OR IGNORE INTO books(id) VALUES (?)').run(document.bookId);
    const result=seedEnemyRoster(db,document);
    assert.equal(result.inserted,document.enemies.length,name);
    assert.deepEqual(seedEnemyRoster(db,document),{inserted:0,updated:0},name);
  }
});
