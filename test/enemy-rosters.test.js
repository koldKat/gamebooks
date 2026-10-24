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
  const plan=db.prepare('EXPLAIN QUERY PLAN SELECT id,name,attack,defense,hp,pb,stats_json FROM book_enemies WHERE book_id=? ORDER BY name COLLATE NOCASE').all(246);
  assert.ok(plan.some(row=>row.detail.includes('idx_book_enemies_book_name')));
  assert.equal(plan.some(row=>row.detail.includes('TEMP B-TREE')),false);
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

test('adopting a verified legacy row keeps its ID and every existing field without creating a duplicate',t=>{
  const db=fixture(t);
  const document={schemaVersion:1,bookId:246,family:'test-family',enemies:[{key:'source-1',name:'Existing enemy',attack:5,hp:12,
    adopt:{name:'Existing enemy',attack:5,defense:null,hp:12,pb:null},stats:{schemaVersion:1,source:'verified'}}]};
  assert.deepEqual(seedEnemyRoster(db,document),{inserted:0,updated:1});
  assert.equal(db.prepare('SELECT COUNT(*) n FROM book_enemies WHERE book_id=246').get().n,1);
  assert.deepEqual(getBookEnemyRows(db,246).map(({stats,...row})=>row),[{id:1,name:'Existing enemy',attack:5,defense:null,hp:12,pb:null}]);
  assert.equal(db.prepare('SELECT created_at FROM book_enemies WHERE id=1').get().created_at,123);
  assert.deepEqual(seedEnemyRoster(db,document),{inserted:0,updated:0});
});

test('ambiguous or changed legacy rows abort the entire repair transaction',t=>{
  const db=fixture(t);
  db.exec("INSERT INTO book_enemies(id,book_id,name,attack,hp) VALUES(3,246,'Existing enemy',5,12)");
  const document={schemaVersion:1,bookId:246,family:'test-family',enemies:[{key:'new',name:'Another',attack:1,hp:1,stats:{}},
    {key:'source-1',name:'Existing enemy',attack:5,hp:12,adopt:{name:'Existing enemy',attack:5,defense:null,hp:12,pb:null},stats:{}}]};
  assert.throws(()=>seedEnemyRoster(db,document),/unambiguous/);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM book_enemies WHERE name='Another'").get().n,0);
  assert.equal(db.prepare('PRAGMA table_info(book_enemies)').all().some(c=>c.name==='stats_json'),false);
  document.enemies[1].adopt.hp=99;
  assert.throws(()=>seedEnemyRoster(db,document),/preserve every/);
});

test('every staged repair seed is valid and retains all structured source data', t => {
  const db = fixture(t);
  for (const name of fs.readdirSync(path.join(__dirname,'../data/simulator-rosters'))) {
    const document=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/simulator-rosters',name),'utf8'));
    db.prepare('INSERT OR IGNORE INTO books(id) VALUES (?)').run(document.bookId);
    for(const enemy of document.enemies)if(enemy.adopt)db.prepare('INSERT INTO book_enemies(book_id,name,attack,defense,hp,pb) VALUES(?,?,?,?,?,?)')
      .run(document.bookId,enemy.adopt.name,enemy.adopt.attack,enemy.adopt.defense,enemy.adopt.hp,enemy.adopt.pb);
    const result=seedEnemyRoster(db,document);
    assert.equal(result.inserted,document.enemies.filter(enemy=>!enemy.adopt).length,name);
    assert.equal(result.updated,document.enemies.filter(enemy=>enemy.adopt).length,name);
    assert.deepEqual(seedEnemyRoster(db,document),{inserted:0,updated:0},name);
  }
});
