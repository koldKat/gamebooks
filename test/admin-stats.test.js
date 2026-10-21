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
    CREATE TABLE users (last_active_at INTEGER, created_at INTEGER, xp INTEGER DEFAULT 0, bonus_gc_mint_purchased INTEGER DEFAULT 0,
      bonus_coins INTEGER DEFAULT 0, coins_spent INTEGER DEFAULT 0, bonus_gc_generated INTEGER DEFAULT 0,
      xp_boost_pct INTEGER DEFAULT 0, bonus_heartbeat_xp INTEGER DEFAULT 0,
      bonus_gc_chance_purchased INTEGER DEFAULT 0, bonus_diamond_dig_purchased INTEGER DEFAULT 0,
      bonus_diamond_exchange_purchased INTEGER DEFAULT 0, bonus_undos INTEGER DEFAULT 0,
      bonus_fast_travels INTEGER DEFAULT 0);
    CREATE TABLE books (id INTEGER PRIMARY KEY, parent_book_id INTEGER, is_container INTEGER DEFAULT 0,
      total_sections INTEGER, pdf_path TEXT, epub_path TEXT, has_battle_sim INTEGER DEFAULT 0, has_live_reading INTEGER DEFAULT 0);
    CREATE TABLE user_books (book_id INTEGER, state_data TEXT);
    CREATE TABLE series (id INTEGER);
    CREATE TABLE sessions (token TEXT, expires_at INTEGER, is_impersonation INTEGER DEFAULT 0);
    CREATE TABLE user_diamonds(user_id INTEGER PRIMARY KEY,diamonds_earned INTEGER,diamonds_bought INTEGER,diamonds_spent INTEGER,lucky_diamonds_earned INTEGER);
    CREATE TABLE user_heartbeat_coins(user_id INTEGER PRIMARY KEY,heartbeat_count INTEGER);
    CREATE TABLE diamond_market(id INTEGER PRIMARY KEY,diamonds INTEGER,diamonds_mined INTEGER);
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
  const stats = vm.runInNewContext(source.slice(source.indexOf('function adminGetStats('), source.indexOf('function getSiteStats()')) + '\nadminGetStats;', {
    db, ...keys, adminSimHistoryKeys: new Set([...keys.SIM_HISTORY_KEYS, ...keys.RETIRED_SIM_HISTORY_KEYS]),
    collectDashboardStats: require('../server/db/gameplay-stats').collectDashboardStats,
    getShopPurchaseTotals: require('../server/db/shop-purchases').getShopPurchaseTotals,
    computeLevel: vm.runInNewContext(xp.slice(xp.indexOf('function computeLevel('), xp.indexOf('// Dynamic level cap')) + '\ncomputeLevel;'),
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
  return { db, stats: extras => JSON.parse(JSON.stringify(stats(extras))) };
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

test('site extras include containers and padding without adding them to dashboard run totals', t => {
  const { db, stats } = fixture(t);
  db.prepare('UPDATE user_books SET state_data=? WHERE book_id=2').run(JSON.stringify({
    playthroughs: [{ startedAt: null, undosUsed: 4, fastTravelsUsed: 3 }],
    graph: { 1: { portals: [{ bookId: 1 }] } },
  }));
  const extras = { undosTotal: 0, fastTravelsTotal: 0, owPortals: 0 };
  const before = stats();
  const after = stats(extras);
  assert.deepEqual(after, before);
  assert.deepEqual(extras, { undosTotal: 4, fastTravelsTotal: 3, owPortals: 1 });
});


test('dashboard activity windows and sign-in sessions use real activity and expiry', t => {
  const { db, stats } = fixture(t), now = Math.floor(Date.now() / 1000);
  db.prepare('UPDATE users SET last_active_at=?,created_at=?').run(now-120,now-800000);
  db.prepare('INSERT INTO users(last_active_at,created_at) VALUES(?,?),(?,?)').run(now-600,now-100,now-90000,now-800000);
  db.prepare('INSERT INTO sessions VALUES(?,?,?),(?,?,?),(?,?,?)').run('valid',now+3600,0,'expired',now-1,0,'impersonation',now+3600,1);
  const s=stats();
  assert.equal(s.users,3);assert.equal(s.onlineUsers,1);assert.equal(s.activeUsers24h,2);assert.equal(s.newUsers7d,1);assert.equal(s.sessions,1);
});

test('dashboard catalog and currency totals retain child books, rewards, trades and metal remainders', t => {
  const { db, stats } = fixture(t);
  db.exec(`UPDATE books SET has_live_reading=1,has_battle_sim=1 WHERE id=3;
    UPDATE books SET pdf_path='book.pdf' WHERE id=1;
    UPDATE books SET pdf_path='',epub_path='book.epub' WHERE id=3;
    INSERT INTO user_diamonds VALUES(1,12,3,8,2),(2,4,2,1,1);
    INSERT INTO user_heartbeat_coins VALUES(1,10123),(2,456);
    INSERT INTO diamond_market VALUES(1,7,9);`);
  const changes=db.prepare('SELECT total_changes() n').get().n,s=stats();
  assert.equal(s.playableBooks,2);assert.equal(s.readingBooks,1);assert.equal(s.battleSims,1);
  assert.equal(s.pdfCount,1);assert.equal(s.epubCount,1);
  assert.equal(s.diamondsEarned,16);assert.equal(s.diamondsAvailable,12);
  assert.equal(s.diamondsSold,9);assert.equal(s.diamondsBought,5);assert.equal(s.luckyDiamondsEarned,3);
  assert.equal(s.bronzeAvailable,79);assert.equal(s.silverAvailable,5);
  assert.equal(s.marketDiamonds,7);assert.equal(s.marketDiamondsMined,9);
  assert.equal(db.prepare('SELECT total_changes() n').get().n,changes,'statistics never write data');
});

test('empty dashboard aggregates return numeric zeros', t => {
  const {db,stats}=fixture(t);db.exec('DELETE FROM user_books;DELETE FROM books;DELETE FROM users');
  const s=stats();
  for(const key of ['users','books','playableBooks','readingBooks','onlineUsers','activeUsers24h','newUsers7d','sessions','diamondsEarned','diamondsAvailable','diamondsSold','diamondsBought','luckyDiamondsEarned','bronzeAvailable','silverAvailable','marketDiamonds','marketDiamondsMined'])assert.equal(s[key],0,key);
});
