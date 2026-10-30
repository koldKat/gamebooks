'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { initializeDiamondBalances } = require('../server/db/diamonds');
const { initializeJobXp } = require('../server/db/job-xp');
const { seasonalXpMultiplier } = require('../server/seasonal-events');

function fixture(t, users = 20) {
  const db = new Database(':memory:');
  t.after(() => db.close());
  db.pragma('foreign_keys=ON');
  db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,xp INTEGER DEFAULT 0);
    CREATE TABLE xp_events(user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      event TEXT,ref TEXT,UNIQUE(user_id,event,ref));`);
  const insertUser = db.prepare('INSERT INTO users(id) VALUES(?)');
  for (let id = 1; id <= users; id++) insertUser.run(id);
  initializeDiamondBalances(db);
  const insert = db.prepare('INSERT OR IGNORE INTO xp_events VALUES(?,?,?)');
  const add = (event, count, prefix = '') => db.transaction(() => {
    for (let i = 0; i < count; i++) insert.run(1, event, prefix + i);
  })();
  return { db, add, init: () => initializeJobXp(db),
    xp: () => db.prepare('SELECT xp FROM user_job_xp WHERE user_id=1').get()?.xp,
    cap: () => Math.floor(db.prepare('SELECT user_count FROM job_xp_policy').get().user_count / 10) };
}

test('New Year doubles job XP prospectively while preserving caps, deduplication and gem event counts',t=>{
  const h=fixture(t);let date=new Date('2026-12-31T12:00:00Z');
  initializeJobXp(h.db,{xpMultiplier:()=>seasonalXpMultiplier('job_xp',date)});
  h.add('visit_node',1);assert.equal(h.xp(),2);
  h.add('visit_node',1);assert.equal(h.xp(),2);
  h.add('idle_heartbeat',1);assert.equal(h.xp(),2);
  assert.equal(h.db.prepare('SELECT qualifying_events FROM user_diamonds WHERE user_id=1').get().qualifying_events,1);
  date=new Date('2027-01-05T12:00:00Z');h.add('add_note',1);assert.equal(h.xp(),3);
  date=new Date('2027-01-01T12:00:00Z');h.db.exec('UPDATE user_job_xp SET xp=5998 WHERE user_id=1');h.add('set_priority',1);assert.equal(h.xp(),5999);
});

test('Job XP backfills genuine event counts once, independently of main XP and gem balances', t => {
  const h = fixture(t);
  h.add('visit_node', 4500); h.add('idle_heartbeat', 5000);
  h.db.exec('UPDATE users SET xp=999999 WHERE id=1');
  const wallet = h.db.prepare('SELECT * FROM user_diamonds WHERE user_id=1').get();
  h.init(); assert.equal(h.xp(), 4500); assert.equal(h.cap(), 2);
  h.init(); assert.equal(h.xp(), 4500);
  assert.deepEqual(h.db.prepare('SELECT * FROM user_diamonds WHERE user_id=1').get(), wallet);
  assert.equal(h.db.prepare('SELECT xp FROM users WHERE id=1').get().xp, 999999);
  h.add('add_note', 1); assert.equal(h.xp(), 4501);
  h.add('add_note', 1); h.add('idle_heartbeat', 1000, 'later-');
  assert.equal(h.xp(), 4501, 'duplicates and heartbeats never contribute');
});

test('cap buffers to one below next level; discarded events are not banked behind the cap', t => {
  const h = fixture(t);
  h.add('visit_node', 8000); h.init();
  assert.equal(h.xp(), 5999, 'level 2 may buffer only to 5999');
  h.add('add_note', 100); assert.equal(h.xp(), 5999);
  for (let id = 21; id <= 29; id++) h.db.prepare('INSERT INTO users(id) VALUES(?)').run(id);
  assert.equal(h.cap(), 2); h.add('set_color', 1); assert.equal(h.xp(), 5999);
  h.db.prepare('INSERT INTO users(id) VALUES(30)').run(); assert.equal(h.cap(), 3);
  assert.equal(h.xp(), 5999, 'new users do not release discarded events');
  h.add('set_priority', 1); assert.equal(h.xp(), 6000, 'a new event reaches level 3');
  h.init(); assert.equal(h.xp(), 6000, 'restart does not backfill discarded events again');
});

test('falling user count does not remove existing levels; buffer follows the retained level', t => {
  const h = fixture(t, 30);
  h.add('visit_node', 6000); h.init();
  h.db.exec('DELETE FROM users WHERE id>20'); assert.equal(h.cap(), 2);
  assert.equal(h.xp(), 6000);
  h.add('add_note', 5000); assert.equal(h.xp(), 9999);
  h.init(); assert.equal(h.xp(), 9999);
});

test('new-account first event, failed transactions, cleanup and account deletion preserve counter semantics', t => {
  const h = fixture(t); h.init();
  h.db.prepare('INSERT INTO users(id) VALUES(21)').run();
  h.db.prepare('INSERT INTO xp_events VALUES(21,?,?)').run('visit_node', 'first');
  assert.equal(h.db.prepare('SELECT xp FROM user_job_xp WHERE user_id=21').get().xp, 1);
  assert.throws(() => h.db.transaction(() => { h.add('add_note', 10); throw Error('rollback'); })(), /rollback/);
  assert.equal(h.xp(), 0);
  h.add('add_note', 10); h.db.exec('DELETE FROM xp_events WHERE user_id=1'); h.init();
  assert.equal(h.xp(), 10, 'book log cleanup never revokes Job XP');
  h.db.exec('DELETE FROM users WHERE id=21');
  assert.equal(h.db.prepare('SELECT xp FROM user_job_xp WHERE user_id=21').get(), undefined);
  assert.equal(h.cap(), 2);
});

test('fewer than ten users allows the level-zero buffer and unlocks level one at ten users', t => {
  const h = fixture(t, 9); h.add('visit_node', 1000); h.init();
  assert.equal(h.cap(), 0); assert.equal(h.xp(), 999);
  h.db.prepare('INSERT INTO users(id) VALUES(10)').run();
  h.add('add_note', 1); assert.equal(h.cap(), 1); assert.equal(h.xp(), 1000);
});


test('Job promotions persist once at real thresholds without creating XP events or replaying history', t => {
  const h = fixture(t); h.add('visit_node', 999); h.init();
  const events = () => h.db.prepare('SELECT level FROM job_level_events WHERE user_id=1 ORDER BY level').all().map(r => r.level);
  assert.deepEqual(events(), [], 'initial backfill does not invent dated promotions');
  const wallet = h.db.prepare('SELECT * FROM user_diamonds WHERE user_id=1').get();
  h.add('add_note', 1);
  assert.deepEqual(events(), [1]);
  assert.equal(h.xp(), 1000, 'promotion must not count as another XP event');
  assert.equal(h.db.prepare('SELECT COUNT(*) AS n FROM xp_events').get().n, 1000);
  h.add('add_note', 1); h.add('idle_heartbeat', 10); h.init();
  assert.deepEqual(events(), [1], 'duplicate awards, heartbeats and restarts do not replay promotions');
  assert.equal(h.db.prepare('SELECT qualifying_events FROM user_diamonds WHERE user_id=1').get().qualifying_events, wallet.qualifying_events + 1);
  assert.throws(() => h.db.transaction(() => { h.add('set_priority', 2000); throw Error('rollback'); })(), /rollback/);
  assert.deepEqual(events(), [1]); assert.equal(h.xp(), 1000);
  h.add('set_priority', 2000); assert.deepEqual(events(), [1,2]);
  h.add('set_color', 4000); assert.deepEqual(events(), [1,2], 'capped progress never announces an unearned level');
  h.db.exec('DELETE FROM users WHERE id=1'); assert.deepEqual(events(), []);
});

test('server trade titles match all approved player-facing titles', () => {
  const { getJobTitle } = require('../server/db/job-xp');
  const source = require('node:fs').readFileSync(require.resolve('../public/js/i18n/en/progression.js'), 'utf8');
  for (let level=0; level<=20; level++) {
    const match = source.match(new RegExp("'job.title."+level+"': *'([^']+)'"));
    assert.ok(match); assert.equal(getJobTitle(level), match[1]);
  }
  assert.equal(getJobTitle(21), 'Gem Guildmaster');
});
