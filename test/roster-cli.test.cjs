'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const Database = require('better-sqlite3');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roster-cli-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const database = path.join(dir, 'catalog.sqlite');
  const db = new Database(database);
  db.exec(`CREATE TABLE books(id INTEGER PRIMARY KEY); INSERT INTO books VALUES(1);
    CREATE TABLE book_enemies(id INTEGER PRIMARY KEY, book_id INTEGER, name TEXT, attack INTEGER, defense INTEGER, hp INTEGER, pb INTEGER);
    CREATE TABLE players(id INTEGER PRIMARY KEY, state TEXT); INSERT INTO players VALUES(1,'keep this save');`);
  db.close();
  const document = { schemaVersion:1, bookId:1, family:'test', enemies:[{
    key:'guard', name:'Guard', attack:6, hp:8, stats:{skill:6, stamina:8},
  }] };
  const file = path.join(dir, 'reviewed-input.json');
  fs.writeFileSync(file, JSON.stringify(document));
  const run = files => spawnSync(process.execPath, ['--max-old-space-size=1024',
    'scripts/seed-simulator-rosters.js', database, ...files], { encoding:'utf8' });
  return { dir, database, file, document, run };
}

test('explicit temporary roster input installs idempotently without changing player saves', t => {
  const f = fixture(t);
  const first = f.run([f.file]);assert.equal(first.status,0,first.stderr);
  assert.deepEqual(JSON.parse(first.stdout),{bookId:1,inserted:1,updated:0});
  const db = new Database(f.database,{readonly:true});
  const before = db.prepare('SELECT * FROM book_enemies').all();
  const second = f.run([f.file]);assert.equal(second.status,0,second.stderr);
  assert.deepEqual(JSON.parse(second.stdout),{bookId:1,inserted:0,updated:0});
  assert.deepEqual(db.prepare('SELECT * FROM book_enemies').all(),before);
  assert.equal(db.prepare('SELECT state FROM players').get().state,'keep this save');db.close();
});

test('duplicate books in different input files fail before any database write', t => {
  const f = fixture(t), duplicate = path.join(f.dir,'duplicate.json');
  fs.writeFileSync(duplicate,JSON.stringify(f.document));
  const before=fs.readFileSync(f.database), result=f.run([f.file,duplicate]);
  assert.equal(result.status,1);assert.match(result.stderr,/Duplicate roster book ID/);
  assert.deepEqual(fs.readFileSync(f.database),before);
});
