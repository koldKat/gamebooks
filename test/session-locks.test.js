'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const Database = require('better-sqlite3');

function setup(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'session-locks-'));
  const file = path.join(directory, 'test.sqlite');
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.exec(`CREATE TABLE sessions (token TEXT PRIMARY KEY, user_id INTEGER, expires_at INTEGER, is_impersonation INTEGER);
    CREATE TABLE users (id INTEGER PRIMARY KEY, active INTEGER DEFAULT 0, geo INTEGER DEFAULT 0, domain INTEGER DEFAULT 0);
    INSERT INTO users(id) VALUES(1);`);
  const locker = new Database(file, { timeout: 0 });
  t.after(() => { locker.close(); db.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  function load(file, dependencies) {
    const context = vm.createContext({ module: { exports: {} }, Buffer, Date, console, setInterval: () => 0,
      require: name => Object.hasOwn(dependencies, name) ? dependencies[name] : require(name) });
    vm.runInContext(fs.readFileSync(require.resolve(file), 'utf8'), context);
    return context.module.exports;
  }
  const bookkeeping = load('../server/db/bookkeeping', { './connection': { db } });
  const auth = load('../server/db/auth', { './connection': { db }, './bookkeeping': bookkeeping });
  const helpers = load('../server/request-helpers', {
    './db': { ...auth,
      updateUserLastActive: id => db.prepare('UPDATE users SET active = active + 1 WHERE id = ?').run(id),
      updateUserActiveGeo: id => db.prepare('UPDATE users SET geo = geo + 1 WHERE id = ?').run(id),
      updateUserLastDomain: id => db.prepare('UPDATE users SET domain = domain + 1 WHERE id = ?').run(id) },
    './db/bookkeeping': bookkeeping, './geoip': { lookup: () => null }, './impersonation-context': {},
    './request-url': { requestQueryParameter: () => '' },
  });
  const request = token => ({ headers: { authorization: 'Bearer ' + token, host: 'example.test' }, socket: { remoteAddress: '127.0.0.1' } });
  const now = Math.floor(Date.now() / 1000);
  const insert = (token, expires = now + 300, impersonating = 0) => db.prepare('INSERT INTO sessions VALUES (?,1,?,?)').run(token, expires, impersonating);
  return { db, locker, auth, helpers, bookkeeping, request, now, insert };
}

test('both authentication paths accept a valid session promptly during a real SQLite write lock', async t => {
  const h = setup(t);
  h.insert('valid');
  const expiry = h.db.prepare('SELECT expires_at FROM sessions').get().expires_at;
  h.locker.exec('BEGIN IMMEDIATE');
  const start = Date.now();
  assert.equal(await h.helpers.authenticate(h.request('valid'), {}), 1);
  assert.equal(h.helpers.authenticateOptional(h.request('valid')), 1);
  assert.ok(Date.now() - start < 500, 'optional bookkeeping must not wait for the 5-second busy timeout');
  assert.equal(h.db.pragma('busy_timeout', { simple: true }), 5000);
  assert.equal(h.db.prepare('SELECT expires_at FROM sessions').get().expires_at, expiry);
  assert.equal(h.db.prepare('SELECT active FROM users').get().active, 0);
  h.locker.exec('ROLLBACK');
  assert.equal(await h.helpers.authenticate(h.request('valid'), {}), 1);
  assert.ok(h.db.prepare('SELECT expires_at FROM sessions').get().expires_at >= h.now + 1209600);
  assert.equal(h.db.prepare('SELECT active FROM users').get().active, 1);
});

test('recent session renewal avoids another write and due renewal retries after contention', t => {
  const h = setup(t);
  h.insert('recent', h.now + 1209600);
  h.insert('due');
  h.db.exec(`CREATE TRIGGER count_renewals AFTER UPDATE ON sessions BEGIN UPDATE users SET active = active + 1; END`);
  h.auth.refreshSession('recent');
  assert.equal(h.db.prepare('SELECT active FROM users').get().active, 0);
  h.locker.exec('BEGIN IMMEDIATE');
  assert.doesNotThrow(() => h.auth.refreshSession('due'));
  h.locker.exec('ROLLBACK');
  h.auth.refreshSession('due');
  assert.equal(h.db.prepare('SELECT active FROM users').get().active, 1);
});

test('expired and revoked sessions remain unauthorized and cannot be renewed', async t => {
  const h = setup(t);
  h.insert('expired', h.now - 1);
  for (const token of ['expired', 'revoked']) {
    const response = { setHeader() {}, writeHead(status) { this.status = status; }, end() {} };
    assert.equal(await h.helpers.authenticate(h.request(token), response), null);
    assert.equal(response.status, 401);
    assert.equal(h.helpers.authenticateOptional(h.request(token)), null);
    h.auth.refreshSession(token);
  }
  assert.equal(h.db.prepare('SELECT expires_at FROM sessions').get().expires_at, h.now - 1);
});

test('impersonated authentication preserves real-user presence fields', async t => {
  const h = setup(t);
  h.insert('impersonated', h.now + 300, 1);
  assert.equal(await h.helpers.authenticate(h.request('impersonated'), {}), 1);
  assert.equal(h.helpers.authenticateOptional(h.request('impersonated')), 1);
  assert.deepEqual(h.db.prepare('SELECT active,geo,domain FROM users').get(), { active: 0, geo: 0, domain: 0 });
});

test('optional writes suppress only lock contention and always restore the connection timeout', t => {
  const h = setup(t);
  const failure = Object.assign(new Error('broken statement'), { code: 'SQLITE_ERROR' });
  assert.throws(() => h.bookkeeping.tryBookkeepingWrite(() => { throw failure; }), error => error === failure);
  assert.equal(h.db.pragma('busy_timeout', { simple: true }), 5000);
  for (const code of ['SQLITE_BUSY', 'SQLITE_BUSY_SNAPSHOT', 'SQLITE_LOCKED']) {
    assert.equal(h.bookkeeping.tryBookkeepingWrite(() => { throw Object.assign(new Error('locked'), { code }); }), false);
  }
  h.db.pragma('busy_timeout = 0');
  h.locker.exec('BEGIN IMMEDIATE');
  assert.throws(() => h.db.prepare('UPDATE users SET active=100').run(), { code: 'SQLITE_BUSY' });
  h.locker.exec('ROLLBACK');
});
