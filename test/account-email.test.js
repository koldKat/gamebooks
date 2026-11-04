'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Database = require('better-sqlite3');
const identity = require('../server/db/email-identity');

function fixture(t) {
  const db = new Database(':memory:');
  t.after(() => db.close());
  db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY, username TEXT UNIQUE,
    password_hash TEXT, salt TEXT, email TEXT, join_template_id INTEGER);
    CREATE TABLE join_templates(id INTEGER PRIMARY KEY, active INTEGER);
    INSERT INTO join_templates VALUES(1,1);`);
  identity.initializeEmailIdentity(db);
  const context = vm.createContext({module: {exports: {}}, Buffer, process,
    require(name) {
      if (name === './connection') return {db};
      if (name === './bookkeeping') return {};
      if (name === './email-identity') return identity;
      return require(name);
    }});
  vm.runInContext(fs.readFileSync(require.resolve('../server/db/auth'), 'utf8'), context);
  return {db, auth: context.module.exports};
}

test('registration normalizes emails and rejects duplicates without creating an account', async t => {
  const {db,auth} = fixture(t);
  await auth.createUser('First', 'test password', '  Reader@Example.com  ');
  assert.equal(auth.getUserEmail(1), 'reader@example.com');
  await assert.rejects(auth.createUser('Second', 'test password', 'READER@example.com'), /email address is already in use/);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM users').get().n, 1);
  await assert.rejects(auth.createUser('First', 'test password', 'another@example.com'), /Username already taken/);
  await auth.createUser('Different', 'test password', 'different@example.com');
});

test('database constraint protects concurrent registrations and direct email updates', async t => {
  const {db,auth} = fixture(t);
  const results = await Promise.allSettled([
    auth.createUser('RacerOne', 'test password', 'race@example.com'),
    auth.createUser('RacerTwo', 'test password', ' RACE@example.com '),
  ]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.match(results.find(r => r.status === 'rejected').reason.message, /email address is already in use/);
  assert.throws(() => db.prepare('INSERT INTO users(username,email) VALUES(?,?)')
    .run('Direct', ' RACE@EXAMPLE.COM '), identity.isDuplicateEmail);
  await auth.createUser('Other', 'test password', 'other@example.com');
  assert.throws(() => db.prepare("UPDATE users SET email='race@example.com' WHERE username='Other'" )
    .run(), identity.isDuplicateEmail);
});

test('email changes retain ownership, reject other owners and allow clearing', async t => {
  const {db,auth} = fixture(t);
  await auth.createUser('Owner', 'test password', 'owner@example.com');
  await auth.createUser('Other', 'test password', 'other@example.com');
  assert.equal(auth.setUserEmail(1, ' OWNER@example.com ').ok, true);
  assert.equal(auth.setUserEmail(2, 'Owner@example.com').error, 'email_taken');
  assert.equal(auth.getUserEmail(2), 'other@example.com');
  assert.equal(auth.setUserEmail(1, null).ok, true);
  assert.equal(auth.setUserEmail(2, 'owner@example.com').ok, true);
  db.prepare("UPDATE users SET email=' Legacy@Example.com ' WHERE id=1").run();
  assert.equal(auth.setUserEmail(2, 'legacy@example.com').error, 'email_taken');
});

test('multiple accounts without email remain supported', async t => {
  const {db,auth} = fixture(t);
  for (const [i,email] of [null, '', '   ', undefined].entries()) await auth.createUser('NoEmail'+i, 'test password', email);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM users WHERE email IS NULL').get().n, 4);
});

test('index migration is idempotent and preserves account records', t => {
  const {db} = fixture(t);
  db.prepare('INSERT INTO users(username,email) VALUES(?,?)').run('Legacy', ' Legacy@Example.com ');
  const before = db.prepare('SELECT * FROM users').all();
  identity.initializeEmailIdentity(db);
  assert.deepEqual(db.prepare('SELECT * FROM users').all(), before);
});
