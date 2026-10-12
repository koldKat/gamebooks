'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const Database = require('better-sqlite3');
const { retireSampleBooks } = require('../server/db/retire-sample-books');

test('retirement removes only flagged records and book references, preserving real data and balances', t => {
  const db = new Database(':memory:');
  const coversDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sample-retirement-'));
  t.after(() => { db.close(); fs.rmSync(coversDir, { recursive: true, force: true }); });
  db.pragma('foreign_keys = ON');
  db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, xp INTEGER, coins_spent INTEGER);
    INSERT INTO users VALUES (1,1234,7);
    CREATE TABLE books (id INTEGER PRIMARY KEY, name TEXT, is_demo INTEGER DEFAULT 0, cover_path TEXT,
      parent_book_id INTEGER REFERENCES books(id) ON DELETE SET NULL);
    INSERT INTO books VALUES (1,'Renamed sample',1,'sample.svg',NULL),
      (2,'Demo Book',0,'shared.svg',1),(3,'Another sample',1,'shared.svg',NULL);
    CREATE TABLE user_books (book_id INTEGER REFERENCES books(id) ON DELETE CASCADE, state_data TEXT);
    INSERT INTO user_books VALUES (1,'sample state'),(2,'real state');
    CREATE TABLE book_parties (id INTEGER PRIMARY KEY, book_id INTEGER REFERENCES books(id) ON DELETE CASCADE);
    INSERT INTO book_parties VALUES (1,1),(2,2);
    CREATE TABLE party_invites (party_id INTEGER REFERENCES book_parties(id) ON DELETE CASCADE);
    INSERT INTO party_invites VALUES (1),(2);
    CREATE TABLE series_runs (last_book_id INTEGER, last_section TEXT);
    INSERT INTO series_runs VALUES (1,'50'),(2,'9');
    CREATE TABLE xp_events (id INTEGER PRIMARY KEY, event TEXT, ref TEXT);
    INSERT INTO xp_events VALUES (1,'add_book','1'),(2,'visit_node','1:3'),
      (3,'create_series','1'),(4,'add_book','2'),(5,'visit_node','10:3');
    CREATE TABLE notifications (id INTEGER PRIMARY KEY, payload TEXT);
    INSERT INTO notifications VALUES (1,'{"bookId":1}'),(2,'{"bookId":2}'),(3,'{"seriesId":1}');`);
  for (const name of ['sample.svg', 'shared.svg', 'demo_99.svg']) fs.writeFileSync(path.join(coversDir, name), '<svg>Sample Gamebook</svg>');
  fs.writeFileSync(path.join(coversDir, 'demo_98.svg'), '<svg>Real custom cover</svg>');
  fs.mkdirSync(path.join(coversDir, 'demo_97.svg'));
  const before = db.prepare('SELECT * FROM users').all();
  assert.deepEqual(retireSampleBooks(db, { coversDir }), { removed: 2, coversRemoved: 2 });
  assert.deepEqual(db.prepare('SELECT * FROM users').all(), before);
  assert.deepEqual(db.prepare('SELECT id, name, parent_book_id FROM books').all(), [{ id: 2, name: 'Demo Book', parent_book_id: null }]);
  assert.deepEqual(db.prepare('SELECT * FROM user_books').all(), [{ book_id: 2, state_data: 'real state' }]);
  assert.deepEqual(db.prepare('SELECT * FROM party_invites').all(), [{ party_id: 2 }]);
  assert.deepEqual(db.prepare('SELECT id FROM xp_events').all().map(e => e.id), [3,4,5]);
  assert.deepEqual(db.prepare('SELECT id FROM notifications').all().map(e => e.id), [2,3]);
  assert.deepEqual(db.prepare('SELECT * FROM series_runs').all(), [{ last_book_id: null, last_section: null }, { last_book_id: 2, last_section: '9' }]);
  assert.equal(db.prepare('PRAGMA table_info(books)').all().some(c => c.name === 'is_demo'), false);
  assert.deepEqual(fs.readdirSync(coversDir).sort(), ['demo_97.svg','demo_98.svg','shared.svg']);
  assert.deepEqual(retireSampleBooks(db, { coversDir }), { removed: 0, coversRemoved: 0 });
  assert.deepEqual(db.pragma('foreign_key_check'), []);
});

test('legacy state migration tolerates invalid JSON and does not match a real title by name', t => {
  const db = new Database(':memory:');
  t.after(() => db.close());
  db.exec(`CREATE TABLE books (id INTEGER PRIMARY KEY, name TEXT, cover_path TEXT, state_data TEXT);
    INSERT INTO books VALUES (1,'Renamed',NULL,'{"isDemoBook": true}'),
      (2,'Demo Book',NULL,'{}'),(3,'Real',NULL,'invalid json');`);
  assert.equal(retireSampleBooks(db).removed, 1);
  assert.deepEqual(db.prepare('SELECT id FROM books').all().map(b => b.id), [2,3]);
});

test('registration creates an account and session without adding any book or cover', async () => {
  const calls = [];
  const deps = {
    'geoip-lite': {}, '../db': {
      createUser: async () => { calls.push('account'); return { id: 1, username: 'Player' }; },
      createSession: () => { calls.push('session'); return 'token'; },
    },
    '../request-helpers': { getClientIp: () => '', isRateLimited: () => false,
      readBody: async () => ({ username: 'Player', password: 'secret' }),
      send: (_res, status, body) => calls.push({ status, body }), recordAuthFailure: () => calls.push('failed') },
    '../email': { getTransporter: () => null }, '../sse': { feedPush: event => calls.push(event.action) },
  };
  const context = vm.createContext({ module: { exports: {} }, require: n => {
    assert.ok(n in deps, `registration module must not import filesystem cover writers: ${n}`); return deps[n];
  } });
  vm.runInContext(fs.readFileSync(require.resolve('../server/routes/auth'), 'utf8'), context);
  await context.module.exports.handleRegister({}, {});
  assert.equal(JSON.stringify(calls), JSON.stringify(['account','session',{ status: 200, body: { token: 'token', username: 'Player' } },'user_joined']));
});
