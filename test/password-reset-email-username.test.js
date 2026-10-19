'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Database = require('better-sqlite3');

function setup(t, username, email = null) {
  const db = new Database(':memory:');
  t.after(() => db.close());
  db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT UNIQUE, email TEXT);
    CREATE TABLE password_reset_tokens (token TEXT PRIMARY KEY, user_id INTEGER, expires_at INTEGER);`);
  db.prepare('INSERT INTO users VALUES (1, ?, ?)').run(username, email);
  const context = vm.createContext({ module: { exports: {} }, Date,
    require: name => name === './connection' ? { db }
      : name === './bookkeeping' ? { tryBookkeepingWrite: write => write() } : require(name),
  });
  vm.runInContext(fs.readFileSync(require.resolve('../server/db/auth'), 'utf8'), context);
  return { auth: context.module.exports, db };
}

test('reset uses a stored email-shaped username, including case-insensitive requests', t => {
  const { auth, db } = setup(t, 'Reader.Name+books@example.com');
  const result = auth.createPasswordResetToken(' reader.name+books@EXAMPLE.COM ');
  assert.equal(result.userEmail, 'Reader.Name+books@example.com');
  assert.match(result.token, /^[0-9a-f]{64}$/);
  assert.equal(db.prepare('SELECT user_id FROM password_reset_tokens').get().user_id, 1);
  assert.equal(db.prepare('SELECT email FROM users').get().email, null);
});

test('saved account email takes priority over an email-shaped username', t => {
  const { auth } = setup(t, 'old@example.com', 'current@example.com');
  assert.equal(auth.createPasswordResetToken('old@example.com').userEmail, 'current@example.com');
  assert.equal(auth.createPasswordResetToken('CURRENT@example.com').userEmail, 'current@example.com');
});

test('accounts without any email address still return noEmail and create no token', t => {
  const { auth, db } = setup(t, 'NormalReader');
  assert.equal(auth.createPasswordResetToken('NormalReader').noEmail, true);
  assert.equal(auth.createPasswordResetToken('stranger@example.com'), null);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM password_reset_tokens').get().n, 0);
});

test('email fallback rejects recipient lists and display-name syntax', t => {
  const { auth, db } = setup(t, 'placeholder');
  for (const username of ['Name <reader@example.com>', 'reader@example.com,other@example.com', 'reader@example.com;other@example.com', 'reader@example.com\nBcc:other@example.com', 'not@an-address']) {
    db.prepare('UPDATE users SET username = ? WHERE id = 1').run(username);
    assert.equal(auth.createPasswordResetToken(username).noEmail, true);
  }
  assert.equal(db.prepare('SELECT COUNT(*) n FROM password_reset_tokens').get().n, 0);
});

test('username fallback replaces old reset tokens and preserves one-hour expiry', t => {
  const { auth, db } = setup(t, 'reader@example.com');
  const before = Math.floor(Date.now() / 1000);
  const first = auth.createPasswordResetToken('reader@example.com');
  const second = auth.createPasswordResetToken('reader@example.com');
  assert.notEqual(first.token, second.token);
  assert.equal(auth.validateResetToken(first.token), null);
  assert.equal(auth.validateResetToken(second.token).user_id, 1);
  const token = db.prepare('SELECT * FROM password_reset_tokens').get();
  assert.ok(token.expires_at >= before + 3600 && token.expires_at <= Math.floor(Date.now() / 1000) + 3600);
});

test('forgot-password route sends the reset to the fallback mailbox', async t => {
  const { auth } = setup(t, 'reader@example.com');
  const sent = [], responses = [];
  const deps = {
    '../geoip': {}, '../db': { createPasswordResetToken: auth.createPasswordResetToken, getAdminSetting: () => null },
    '../paths': {}, '../sse': {},
    '../email': { getTransporter: () => ({ sendMail: async message => sent.push(message) }) },
    '../request-helpers': { getClientIp: () => '127.0.0.1', isRateLimited: () => false,
      readBody: async () => ({ identifier: 'reader@example.com' }), send: (_, status, body) => responses.push({ status, body }),
    },
  };
  const context = vm.createContext({ module: { exports: {} }, process, console,
    require: name => Object.hasOwn(deps, name) ? deps[name] : require(name),
  });
  vm.runInContext(fs.readFileSync(require.resolve('../server/routes/auth'), 'utf8'), context);
  await context.module.exports.handleForgotPassword({}, {});
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'reader@example.com');
  assert.match(sent[0].text, /https:\/\/pathmap.net\/\?reset_token=[0-9a-f]{64}/);
  assert.equal(responses[0].status, 200);
  assert.equal(responses[0].body.ok, true);
});
