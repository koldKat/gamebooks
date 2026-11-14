'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Database = require('better-sqlite3');

test('series run feed follows library membership and surviving started book runs', t => {
  const db = new Database(':memory:');
  t.after(() => db.close());
  db.exec(`CREATE TABLE users(id,username,public_profile,avatar_path,hide_from_feed,xp,
    is_author,is_contributor,is_moderator,is_squire,display_name);
    CREATE TABLE series(id,name,is_public,is_open_world);
    CREATE TABLE user_series(user_id,series_id);
    CREATE TABLE series_runs(user_id,series_id,run_index,started_at,completed,result,completed_at,is_public);
    CREATE TABLE books(id,name,is_public,cover_path,series_id);
    CREATE TABLE user_books(user_id,book_id,state_data);
    INSERT INTO users VALUES(7,'Reader',1,NULL,0,0,0,0,0,0,NULL);
    INSERT INTO series VALUES(1,'World',1,1);
    INSERT INTO user_series VALUES(7,1);
    INSERT INTO books VALUES(10,'Opening',1,NULL,1),(11,'Ending',1,NULL,1);
    INSERT INTO user_books VALUES(7,10,'{}'),(7,11,'{}');`);
  const now = Math.floor(Date.now() / 1000);
  db.prepare('INSERT INTO series_runs VALUES(7,1,0,?,1,?, ?,1)').run(now, 'win', now);
  const state = (id, playthroughs) => db.prepare('UPDATE user_books SET state_data=? WHERE book_id=?')
    .run(JSON.stringify({ playthroughs }), id);
  state(10, [{ startedAt: now * 1000, completed: true, result: 'portal' }]);
  state(11, [{ startedAt: now * 1000 + 1, completed: true, result: 'win' }]);
  const context = { module: { exports: {} }, require(name) {
    return { './connection': { db: { prepare(sql) {
      return /FROM series_runs sr|FROM books b JOIN user_books ub/.test(sql)
        ? db.prepare(sql) : { all: () => [], get: () => undefined };
    } } }, './xp': { computeLevel: () => 1, getTitleForLevel: () => '' },
    './job-xp': {}, './content': {}, './books': {}, './rating-stats': {},
    './gameplay-stats': {}, './profile-progress': {} }[name];
  } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../server/db/feed'), 'utf8'), context);
  const feed = () => JSON.parse(JSON.stringify(context.module.exports.getFeed()));
  assert.equal(feed().length, 2, 'surviving series journey has start and completion events');
  assert.equal(feed().find(e => e.type === 'series_run_started').bookId, 10);
  assert.equal(feed().find(e => e.type === 'series_run_completed').bookId, 11);
  db.exec('DELETE FROM user_series');
  assert.deepEqual(feed(), [], 'removed series must not expose retained historical run rows');
  db.exec('INSERT INTO user_series VALUES(7,1)');
  state(10, []); state(11, []);
  assert.deepEqual(feed(), [], 'deleted book runs must not leave phantom series events');
  state(10, [{ startedAt: null, completed: true, result: 'win' }]);
  assert.deepEqual(feed(), [], 'untouched placeholders are not actual journeys');
  state(10, [{ startedAt: now * 1000 }]);
  assert.deepEqual(feed().map(e => e.type), ['series_run_started']);
  db.exec('DELETE FROM series_runs');
  assert.deepEqual(feed(), [], 'deleting the series run removes its events');
});

test('deleting a public series run refreshes the feed over SSE', async () => {
  const source = fs.readFileSync(require.resolve('../server/routes/books'), 'utf8');
  const start = source.indexOf('async function handleDeleteSeriesRun(');
  const end = source.indexOf('\nasync function ', start + 1);
  const events = [], calls = [];
  let isPublic = true;
  const handler = vm.runInNewContext(source.slice(start, end) + '\nhandleDeleteSeriesRun', {
    authenticate: async () => 7,
    db: { getSeriesById: () => ({ is_open_world: true, is_public: isPublic }),
      deleteSeriesRun: (...args) => calls.push(['delete', ...args]),
      patchSeriesRunDeletion: (...args) => calls.push(['patch', ...args]) },
    send: (_req, status) => calls.push(['response', status]),
    feedPush: event => events.push(event),
  });
  await handler({}, {}, 1, 0);
  assert.deepEqual(calls, [['delete', 7, 1, 0], ['patch', 7, 1, 0], ['response', 200]]);
  assert.deepEqual(JSON.parse(JSON.stringify(events)), [
    { type: 'feed_changed', entity: 'series', action: 'run_deleted', id: 1 },
  ]);
  isPublic = false;
  await handler({}, {}, 1, 0);
  assert.equal(events.length, 1, 'private runs do not broadcast public feed activity');
});
