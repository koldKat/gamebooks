'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Database = require('better-sqlite3');

function fixture(t) {
  const db = new Database(':memory:');
  t.after(() => db.close());
  db.exec(`
    CREATE TABLE users (xp INTEGER DEFAULT 0, bonus_gc_mint_purchased INTEGER DEFAULT 0,
      bonus_coins INTEGER DEFAULT 0, coins_spent INTEGER DEFAULT 0, bonus_gc_generated INTEGER DEFAULT 0);
    CREATE TABLE books (id INTEGER PRIMARY KEY, parent_book_id INTEGER, is_container INTEGER DEFAULT 0,
      total_sections INTEGER, pdf_path TEXT, epub_path TEXT, has_battle_sim INTEGER DEFAULT 0);
    CREATE TABLE user_books (book_id INTEGER, state_data TEXT);
    CREATE TABLE series (id INTEGER);
    CREATE TABLE sessions (token TEXT);
    CREATE TABLE feedback (admin_unread INTEGER, deleted_by_admin INTEGER);
    CREATE TABLE coin_events (event TEXT, amount INTEGER);
    INSERT INTO users DEFAULT VALUES;
    INSERT INTO books (id,total_sections) VALUES (1,100);
    INSERT INTO books (id,total_sections,is_container) VALUES (2,999,1);
    INSERT INTO books (id,total_sections,parent_book_id) VALUES (3,200,2);
  `);
  const source = fs.readFileSync(require.resolve('../server/db/admin'), 'utf8');
  const xp = fs.readFileSync(require.resolve('../server/db/xp'), 'utf8');
  const keys = vm.runInNewContext(xp.slice(xp.indexOf('const SIM_HISTORY_KEYS ='), xp.indexOf('function processStateXp(')) + '\n({SIM_HISTORY_KEYS,RETIRED_SIM_HISTORY_KEYS})');
  const stats = vm.runInNewContext(source.slice(source.indexOf('function adminGetStats()'), source.indexOf('function getSiteStats()')) + '\nadminGetStats;', {
    db, ...keys, adminSimHistoryKeys: new Set([...keys.SIM_HISTORY_KEYS, ...keys.RETIRED_SIM_HISTORY_KEYS]),
  });
  const put = (book, state) => db.prepare('INSERT INTO user_books VALUES (?,?)').run(book, JSON.stringify(state));
  put(1, { graph: { 1: { choices: [2, 0, -1] }, 2: { choices: [3] } }, playthroughs: [
    { startedAt: 1, result: 'success', isPublic: true, sim891: { history: [{ outcome: 'win' }, { outcome: 'loss' }, {}] } },
    { startedAt: 2, sim758: { history: [{ outcome: 'win' }] }, unrelated: { history: [{ outcome: 'win' }] } },
    { startedAt: null, result: 'death', sim891: { history: [{ outcome: 'loss' }] } },
  ] });
  put(1, { graph: { 9: { discovered: true } }, playthroughs: [{ startedAt: 3 }] });
  put(2, { playthroughs: [{ startedAt: 1, result: 'success' }] });
  put(3, { graph: { 4: { choices: [5] } }, playthroughs: [
    { startedAt: 1, result: 'death' }, { startedAt: 2, result: 'battle', sim2116: { history: [{ outcome: 'loss' }] } },
  ] });
  db.prepare('INSERT INTO user_books VALUES (1,?)').run('invalid JSON');
  return { db, stats: () => JSON.parse(JSON.stringify(stats())) };
}

test('stats preserve anthology, graph, started-run and registered/retired battle counts', t => {
  const { db, stats } = fixture(t);
  const before = db.prepare('SELECT total_changes() AS n').get().n;
  const s = stats();
  assert.equal(s.books, 1);
  assert.equal(s.anthologies, 1);
  assert.equal(s.totalSections, 300);
  assert.equal(s.mappedSections, 3);
  assert.equal(s.discoveredSections, 5);
  assert.equal(s.playthroughs, 5);
  assert.equal(s.activePlaythroughs, 2);
  assert.equal(s.finishedPlaythroughs, 3);
  assert.equal(s.wins, 1);
  assert.equal(s.deaths, 1);
  assert.equal(s.battleCount, 1);
  assert.equal(s.publicRuns, 1);
  assert.equal(s.battlesFought, 5);
  assert.equal(s.battlesWon, 2);
  assert.equal(s.battlesLost, 2);
  assert.equal(s.battleWinRate, 40);
  assert.equal(db.prepare('SELECT total_changes() AS n').get().n, before);
});

test('dashboard totals immediately reflect gameplay changes and library removals', t => {
  const { db, stats } = fixture(t);
  assert.equal(stats().battlesFought, 5);
  db.prepare('DELETE FROM user_books WHERE book_id=3').run();
  assert.equal(stats().battlesFought, 4);
  assert.equal(stats().playthroughs, 3);
  db.exec("INSERT INTO coin_events VALUES ('bonus_gc_claim',7)");
  assert.equal(stats().luckyGcClaimed, 7);
});

test('admin timers skip hidden tabs and refresh metrics upon return', () => {
  const source = fs.readFileSync('admin/js/boot.js', 'utf8');
  const callbacks = [], counts = { live: 0, stats: 0, gc: 0, size: 0 };
  let visible;
  const document = { hidden: true, addEventListener(event, fn) { assert.equal(event, 'visibilitychange'); visible = fn; } };
  vm.runInNewContext(source.slice(source.indexOf('const pollVisible =')), {
    document, setInterval: fn => callbacks.push(fn),
    loadLive: () => counts.live++, loadStats: () => counts.stats++,
    loadAdminGc: () => counts.gc++, loadAppSize: () => counts.size++,
  });
  callbacks.forEach(fn => fn());
  visible();
  assert.deepEqual(counts, { live: 0, stats: 0, gc: 0, size: 0 });
  document.hidden = false;
  visible();
  assert.deepEqual(counts, { live: 1, stats: 1, gc: 1, size: 1 });
  callbacks.forEach(fn => fn());
  assert.deepEqual(counts, { live: 2, stats: 2, gc: 2, size: 2 });
});
