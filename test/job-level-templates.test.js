'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const {initializeJobLevelTemplates} = require('../server/db/job-level-templates');

function fixture(t) {
  const db = new Database(':memory:');
  t.after(() => db.close());
  db.pragma('foreign_keys=ON');
  db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY, xp INTEGER);
    INSERT INTO users VALUES(1,12345);
    CREATE TABLE user_job_xp(user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,xp INTEGER);
    INSERT INTO user_job_xp VALUES(1,999);
    CREATE TABLE job_level_events(user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      level INTEGER,created_at INTEGER DEFAULT (strftime('%s','now')),PRIMARY KEY(user_id,level));
    INSERT INTO job_level_events VALUES(1,2,123);
    CREATE TABLE untouched(value TEXT);
    INSERT INTO untouched VALUES('player data');`);
  const init = () => db.transaction(() => initializeJobLevelTemplates(db)).immediate();
  return {db,init};
}

test('91 unique trade messages seed once; migration preserves existing dates, levels and player data',t => {
  const {db,init} = fixture(t); init();
  const rows = db.prepare('SELECT * FROM job_level_up_templates ORDER BY id').all();
  assert.equal(rows.length,91);
  assert.equal(new Set(rows.map(r=>r.template)).size,91);
  for (const row of rows) {
    assert.equal(row.active,1);
    assert.deepEqual(row.template.match(/\{\w+\}/g).sort(),['{level}','{name}','{title}']);
    assert.ok(!/[<>—]/.test(row.template));
    assert.ok(row.template.includes('Job Level'));
  }
  const events = db.prepare('SELECT * FROM job_level_events').all();
  assert.equal(events[0].created_at,123); assert.equal(events[0].level,2);
  assert.ok(events[0].template_id);
  init();
  assert.deepEqual(db.prepare('SELECT * FROM job_level_events').all(),events);
  assert.deepEqual(db.prepare('SELECT * FROM job_level_up_templates ORDER BY id').all(),rows);
  assert.equal(db.prepare('SELECT xp FROM users').get().xp,12345);
  assert.equal(db.prepare('SELECT xp FROM user_job_xp').get().xp,999);
  assert.equal(db.prepare('SELECT value FROM untouched').get().value,'player data');
});

test('promotions select active templates atomically, retain selection and allow an empty active pool',t => {
  const {db,init} = fixture(t); init();
  db.exec('UPDATE job_level_up_templates SET active=0; UPDATE job_level_up_templates SET active=1 WHERE id=7');
  db.exec('UPDATE user_job_xp SET xp=1000');
  assert.equal(db.prepare('SELECT template_id FROM job_level_events WHERE level=1').get().template_id,7);
  db.exec('UPDATE job_level_up_templates SET active=0 WHERE id=7'); init();
  assert.equal(db.prepare('SELECT template_id FROM job_level_events WHERE level=1').get().template_id,7);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM job_level_up_templates WHERE active=1').get().n,0);
  assert.throws(()=>db.transaction(()=>{db.exec('UPDATE user_job_xp SET xp=6000');throw Error('rollback');})(),/rollback/);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM job_level_events WHERE level=3').get().n,0);
  db.exec('UPDATE user_job_xp SET xp=6000');
  assert.equal(db.prepare('SELECT template_id FROM job_level_events WHERE level=3').get().template_id,null);
  db.exec('UPDATE user_job_xp SET xp=6001');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM job_level_events WHERE level=3').get().n,1);
  db.exec('DELETE FROM job_level_up_templates WHERE id=7');
  assert.equal(db.prepare('SELECT template_id FROM job_level_events WHERE level=1').get().template_id,null);
  db.exec('DELETE FROM users WHERE id=1');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM job_level_events').get().n,0);
});
