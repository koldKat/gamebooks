'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Database = require('better-sqlite3');

test('join events exclude stored location data and respect hide-from-feed', t => {
  const db = new Database(':memory:');
  t.after(() => db.close());
  db.exec(`CREATE TABLE users (
    id INTEGER PRIMARY KEY, username TEXT, signup_country TEXT, last_country TEXT, last_city TEXT,
    avatar_path TEXT, public_profile INTEGER DEFAULT 0, xp INTEGER DEFAULT 0,
    hide_from_feed INTEGER DEFAULT 0, created_at INTEGER DEFAULT (strftime('%s','now')),
    join_template_id INTEGER, is_author INTEGER DEFAULT 0, is_contributor INTEGER DEFAULT 0,
    is_moderator INTEGER DEFAULT 0, is_squire INTEGER DEFAULT 0, display_name TEXT);
    CREATE TABLE join_templates (id INTEGER PRIMARY KEY, template TEXT);
    INSERT INTO join_templates VALUES (1, '{name} joins.');
    INSERT INTO users (id,username,signup_country,last_country,last_city,join_template_id)
      VALUES (1,'Reader','PL','BG','Sofia',1);
    INSERT INTO users (id,username,signup_country,hide_from_feed,join_template_id)
      VALUES (2,'HiddenReader','CA',1,1);
    UPDATE users SET is_squire=1 WHERE id=1;`);
  const deps = {
    './connection': { db: { prepare: sql => (sql.includes('FROM users u') && sql.includes('u.join_template_id')) || sql.includes('SELECT template FROM join_templates')
      ? db.prepare(sql) : { all: () => [], get: () => undefined } } },
    './xp': { computeLevel: () => 0, getTitleForLevel: () => 'Newborn' },
    './job-xp': require('../server/db/job-xp'), './content': { getRandomJoinTemplate: () => '{name} joins.' }, './books': {}, './rating-stats': {},
  };
  const context = vm.createContext({ module: { exports: {} }, Date, require: n => deps[n] });
  vm.runInContext(fs.readFileSync(require.resolve('../server/db/feed'), 'utf8'), context);
  const entries = context.module.exports.getFeed().filter(e => e.type === 'user_joined');
  assert.equal(entries.length, 1);
  assert.equal(entries[0].username, 'Reader');
  assert.equal(entries[0].isSquire, true);
  assert.equal(entries[0].isModerator, false);
  assert.doesNotMatch(JSON.stringify(entries), /country|city|Sofia|"PL"|"BG"/);
});

test('join renderer ignores country data from an older server', () => {
  const context = vm.createContext({ _hooks: {},
    escapeHtml: s => String(s ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;'),
    t: () => '{name} joins.',
  });
  vm.runInContext(fs.readFileSync('public/js/feed/entries.js', 'utf8').replace(/^import .*;\n/gm, '').replace(/\bexport /g, ''), context);
  const base = { type: 'user_joined', username: 'Reader', joinTemplate: 'Welcome, {name}.' };
  assert.equal(context.renderEntry({ ...base, country: 'PL' }).html, context.renderEntry(base).html);
  assert.equal(context.renderEntry(base).html, 'Welcome, <span class="feed-user">Reader</span>.');
});

test('startup removes the retired signup country column and preserves admin location data', t => {
  const db = new Database(':memory:');
  t.after(() => db.close());
  db.exec("CREATE TABLE users(id INTEGER PRIMARY KEY,signup_country TEXT,last_country TEXT,last_city TEXT); INSERT INTO users VALUES(1,'PL','BG','Sofia');");
  const source = fs.readFileSync('server/db.js', 'utf8');
  const migration = source.split('\n').find(line => line.startsWith("if (hasColumn('users', 'signup_country'))"));
  assert.ok(migration);
  const context = vm.createContext({ db, hasColumn: (table, column) => db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === column) });
  vm.runInContext(migration, context);
  vm.runInContext(migration, context);
  assert.deepEqual(db.prepare('SELECT * FROM users').get(), { id: 1, last_country: 'BG', last_city: 'Sofia' });
});
