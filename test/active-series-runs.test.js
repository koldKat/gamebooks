'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Database = require('better-sqlite3');

function fixture(t) {
  let queries = 0;
  const db = new Database(':memory:', { verbose: () => queries++ });
  t.after(() => db.close());
  db.exec(`CREATE TABLE series (id PRIMARY KEY, name, is_open_world);
    CREATE TABLE user_series (user_id, series_id);
    CREATE TABLE series_runs (user_id, series_id, run_index, last_book_id, last_section, completed);
    CREATE TABLE user_books (user_id, book_id, state_data, PRIMARY KEY(user_id,book_id));
    INSERT INTO series VALUES (1,'World',1),(2,'Ordinary',0);
    INSERT INTO user_series VALUES (7,1),(7,2),(8,1);
    INSERT INTO series_runs VALUES
      (7,1,0,10,'400',0),(7,1,1,10,'30',0),(7,1,2,20,'100',0),
      (7,1,3,20,'5',1),(7,1,4,NULL,NULL,0),(7,2,0,30,'1',0),(8,1,0,10,'9',0);
    INSERT INTO user_books VALUES (7,10,'{}'),(7,20,'{}'),(8,10,'{}');`);
  const source = fs.readFileSync(require.resolve('../server/db/books'), 'utf8');
  const start = source.indexOf('function getActiveSeriesRunsForUser(');
  const end = source.indexOf('\nfunction deleteSeriesRun(', start);
  const get = vm.runInNewContext(source.slice(start, end) + '\ngetActiveSeriesRunsForUser', { db });
  return { db, get: () => JSON.parse(JSON.stringify(get(7))),
    state: (id, state) => db.prepare('UPDATE user_books SET state_data=? WHERE user_id=7 AND book_id=?')
      .run(typeof state === 'string' ? state : JSON.stringify(state), id),
    queryCount: () => queries };
}

test('parked runs prefer the selected run and retain badges in other books without writes', t => {
  const f = fixture(t);
  f.state(10, { activePtIndex: 1, playthroughs: [{lastActionAt:999}, {lastActionAt:10}] });
  f.state(20, { activePtIndex: 2, playthroughs: [{}, {}, {lastActionAt:20}] });
  const before = f.db.prepare('SELECT total_changes() n').get().n;
  const q = f.queryCount(), rows = f.get();
  assert.equal(f.queryCount() - q, 2, 'two bounded queries, independent of run count');
  assert.equal(rows.find(r => r.last_book_id === 10).run_index, 1);
  assert.equal(rows.find(r => r.last_book_id === 20).run_index, 2);
  assert.equal(rows.length, 3, 'exclude completed, unstarted, other accounts and ordinary series');
  assert.equal(f.db.prepare('SELECT total_changes() n').get().n, before);
});

test('without a selected run, recent activity wins, with deterministic fallback for legacy states', t => {
  const f = fixture(t);
  f.state(10, {activePtIndex:null, playthroughs:[{lastActionAt:30}, {startedAt:20}]});
  assert.equal(f.get().find(r => r.last_book_id === 10).run_index, 0);
  f.state(10, {activePtIndex:null, playthroughs:[{lastActionAt:30}, {lastActionAt:40}]});
  assert.equal(f.get().find(r => r.last_book_id === 10).run_index, 1);
  f.state(10, 'invalid legacy state');
  assert.equal(f.get().find(r => r.last_book_id === 10).run_index, 1);
  f.db.prepare('DELETE FROM user_series WHERE user_id=7').run();
  assert.deepEqual(f.get(), []);
});
