'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const fs = require('node:fs');
const vm = require('node:vm');
const { initializeSeasonParticipation, recordSeasonParticipation } = require('../server/db/season-participation');
const { createSeasonPayouts, getSeasonPayoutReports } = require('../server/db/season-payouts');
const events = require('../public/js/seasonal-events/calendar.json');

function fixture(t, initialize = true) {
  const db = new Database(':memory:'); t.after(() => db.close()); db.pragma('foreign_keys=ON');
  db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,username TEXT,xp INTEGER DEFAULT 0,
      coins_spent INTEGER DEFAULT 0,bonus_coins INTEGER DEFAULT 0,admin_gifted_coins INTEGER DEFAULT 0,
      bonus_gc_mint_purchased INTEGER DEFAULT 0);
    INSERT INTO users(id,username) VALUES(1,'Alice'),(2,'Bob'),(3,'Carol');
    CREATE TABLE user_job_xp(user_id INTEGER PRIMARY KEY,xp INTEGER DEFAULT 0);
    CREATE TABLE xp_events(user_id INTEGER,event TEXT,created_at INTEGER);
    CREATE TABLE admin_settings(key TEXT PRIMARY KEY,value TEXT);
    CREATE TABLE notifications(user_id INTEGER,type TEXT,payload TEXT);`);
  if (initialize) initializeSeasonParticipation(db, new Date('2026-02-01T12:00:00Z'));
  let earned = 100;
  const source = fs.readFileSync(require.resolve('../server/db/misc'), 'utf8');
  const context = vm.createContext({ db, coinBalance: row => row.bonus_coins - row.coins_spent,
    _insertNotif: db.prepare('INSERT INTO notifications VALUES(?,?,?)') });
  vm.runInContext(source.slice(source.indexOf('function adminGiftGc('), source.indexOf('function getAppBirthTimestamp(')), context);
  const gifted = () => Number(db.prepare("SELECT value FROM admin_settings WHERE key='admin_gc_gifted'").get()?.value || 0);
  const dependencies = { db, getSupply: () => ({ available: Math.max(0, earned - gifted()) }), gift: context.adminGiftGc };
  return { db, dependencies, gifted, supply: amount => { earned = amount; },
    record: (user, event, at) => recordSeasonParticipation(db, user, event, new Date(at)),
    settle: (at, run = createSeasonPayouts(dependencies)) => run(0, new Date(at)),
    balances: () => db.prepare('SELECT bonus_coins FROM users ORDER BY id').all().map(u => u.bonus_coins),
    notifications: () => db.prepare('SELECT user_id,type,payload FROM notifications').all().map(n => ({ ...n, payload: JSON.parse(n.payload) })) };
}

function halloween(f) {
  f.record(1, 'death_run', '2026-10-28T12:00:00Z');
  f.record(1, 'battle_run', '2026-10-28T13:00:00Z');
  f.record(1, 'battlesim_loss', '2026-10-29T12:00:00Z');
  f.record(2, 'first_loss', '2026-10-30T12:00:00Z');
}

test('one GC per Sofia participation day, paid only after the inclusive event ends', t => {
  const f = fixture(t); halloween(f); f.record(3, 'win_run', '2026-10-30T12:00:00Z');
  assert.equal(f.settle('2026-11-03T21:59:59Z').results.length, 0);
  const paid = f.settle('2026-11-03T22:00:00Z');
  assert.deepEqual(paid.userIds, [1, 2]); assert.deepEqual(f.balances(), [2, 1, 0]); assert.equal(f.gifted(), 3);
  assert.equal(paid.results[0].status, 'paid'); assert.equal(paid.results[0].total, 3);
  assert.deepEqual(f.notifications().map(n => n.payload.message), [
    'Thank you for participating in the Halloween event!', 'Thank you for participating in the Halloween event!',
  ]);
  assert.deepEqual(f.notifications().map(n => n.payload.amount), [2, 1]);
  assert.equal(createSeasonPayouts(f.dependencies)(0, new Date('2026-11-05T00:00:00Z')).results.length, 0);
  assert.deepEqual(f.balances(), [2, 1, 0], 'restarts and repeated scheduler ticks never pay twice');
});

test('insufficient pool permanently skips everyone without coins, notifications or later retries', t => {
  const f = fixture(t); halloween(f); f.supply(2);
  assert.equal(f.settle('2026-11-04T00:00:00Z').results[0].status, 'skipped');
  assert.deepEqual(f.balances(), [0, 0, 0]); assert.equal(f.gifted(), 0); assert.equal(f.notifications().length, 0);
  f.supply(100); assert.equal(f.settle('2026-11-05T00:00:00Z').results.length, 0);
  f.record(3, 'death_run', '2026-10-31T12:00:00Z');
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM seasonal_participation_days').get().n, 3, 'settled occurrences cannot gain late participants');
});

test('an exactly sufficient pool pays every recipient in full', t => {
  const f = fixture(t); halloween(f); f.supply(3);
  assert.equal(f.settle('2026-11-04T00:00:00Z').results[0].status, 'paid'); assert.equal(f.gifted(), 3);
});

test('a failed gift rolls back all recipients, the pool charge and settlement marker', t => {
  const f = fixture(t); halloween(f); let calls = 0;
  const broken = createSeasonPayouts({ ...f.dependencies, gift(...args) {
    if (++calls === 2) throw Error('injected failure');
    return f.dependencies.gift(...args);
  } });
  assert.throws(() => f.settle('2026-11-04T00:00:00Z', broken), /injected failure/);
  assert.deepEqual(f.balances(), [0, 0, 0]); assert.equal(f.gifted(), 0); assert.equal(f.notifications().length, 0);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM seasonal_participation_payouts').get().n, 0);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM seasonal_participation_recipients').get().n, 0);
  assert.equal(f.settle('2026-11-04T00:00:00Z').results[0].status, 'paid');
});

test('payout reports preserve the exact recipients and pool debit after renames, deletion and repeated ticks', t => {
  const f = fixture(t); halloween(f);
  f.settle('2026-11-04T00:00:00Z');
  const [report] = getSeasonPayoutReports(f.db);
  assert.equal(report.name, 'Halloween');
  assert.equal(report.startsOn, '2026-10-28'); assert.equal(report.endsOn, '2026-11-03');
  assert.equal(report.paidGc, f.gifted()); assert.equal(report.eligibleGc, 3);
  assert.equal(report.recipientCount, 2); assert.equal(report.status, 'paid');
  assert.deepEqual(report.recipients, [
    { user_id: 1, username: 'Alice', qualifying_days: 2, paid_gc: 2 },
    { user_id: 2, username: 'Bob', qualifying_days: 1, paid_gc: 1 },
  ]);
  f.db.exec("UPDATE users SET username='Renamed' WHERE id=1; DELETE FROM users WHERE id=2;");
  initializeSeasonParticipation(f.db, new Date('2026-11-05T00:00:00Z'));
  f.settle('2026-11-05T00:00:00Z');
  assert.deepEqual(getSeasonPayoutReports(f.db), [report]);
  assert.equal(report.recipients.reduce((sum, row) => sum + row.paid_gc, 0), report.paidGc);
});

test('payout reports show the most recently processed report first', t => {
  const f = fixture(t);
  const insert = f.db.prepare(`INSERT INTO seasonal_participation_payouts
    (season_id,starts_on,ends_on,status,total_gc,recipients,processed_at,event_name)
    VALUES(?,?,?,'paid',0,0,?,?)`);
  insert.run('older-report', '2026-10-28', '2026-11-03', 100, 'Older report');
  insert.run('newer-report', '2026-09-01', '2026-09-07', 200, 'Newer report');
  assert.deepEqual(getSeasonPayoutReports(f.db).map(row => row.seasonId), ['newer-report', 'older-report']);
});

test('skipped payout reports distinguish eligible gold from actual zero spending', t => {
  const f = fixture(t); halloween(f); f.supply(2);
  f.settle('2026-11-04T00:00:00Z');
  const [report] = getSeasonPayoutReports(f.db);
  assert.equal(report.status, 'skipped'); assert.equal(report.paidGc, 0); assert.equal(report.eligibleGc, 3);
  assert.deepEqual(report.recipients.map(row => [row.username, row.qualifying_days, row.paid_gc]),
    [['Alice', 2, 0], ['Bob', 1, 0]]);
  assert.equal(f.gifted(), 0);
});

test('Sofia midnight counts separate days while repeated actions on one day count once', t => {
  const f = fixture(t);
  f.record(1, 'death_run', '2026-10-28T21:59:59Z');
  f.record(1, 'death_run', '2026-10-28T22:00:00Z');
  f.record(1, 'battle_run', '2026-10-29T02:00:00Z');
  assert.deepEqual(f.db.prepare('SELECT earned_on FROM seasonal_participation_days ORDER BY earned_on').all(),
    [{ earned_on: '2026-10-28' }, { earned_on: '2026-10-29' }]);
});

test('Diwali moving dates, Christmas heartbeat awards and New Year crossing years all qualify', t => {
  const f = fixture(t);
  f.record(1, 'battlesim_win', '2026-11-08T12:00:00Z');
  f.record(1, 'idle_heartbeat', '2026-12-25T12:00:00Z');
  f.record(1, 'future_xp_action', '2026-12-31T12:00:00Z');
  f.record(1, 'future_xp_action', '2027-01-01T12:00:00Z');
  const paid = f.settle('2027-01-04T22:00:00Z');
  assert.deepEqual(paid.results.map(r => [r.seasonId, r.total]), [['diwali', 1], ['christmas', 1], ['new-year', 2]]);
  assert.deepEqual(f.balances(), [4, 0, 0]);
});

test('each annual occurrence has its own day count and permanent settlement', t => {
  const f = fixture(t); halloween(f); f.supply(0); f.settle('2026-11-04T00:00:00Z');
  f.supply(100); f.record(1, 'death_run', '2027-10-31T12:00:00Z');
  const paid = f.settle('2027-11-04T00:00:00Z');
  assert.equal(paid.results.length, 1); assert.equal(paid.results[0].startsOn, '2027-10-28'); assert.equal(f.gifted(), 1);
});

test('future calendar events and overlapping qualifying events require no payout-specific code', t => {
  events.push({ id: 'future-festival', title: 'Future Festival event active', start: 1030, end: 1102,
    xpMultiplier: 2, xpEvents: ['death_run'] });
  t.after(() => events.pop());
  const f = fixture(t); f.record(1, 'death_run', '2026-10-31T12:00:00Z');
  const paid = f.settle('2026-11-04T00:00:00Z');
  assert.equal(paid.results.length, 2); assert.equal(f.gifted(), 2);
  assert.equal(f.notifications()[0].payload.message, 'Thank you for participating in the Future Festival event!');
});

test('first deployment recovers the active festival once and retains days after XP cleanup', t => {
  const f = fixture(t, false), insert = f.db.prepare('INSERT INTO xp_events VALUES(?,?,?)');
  for (const [event, at] of [['death_run', '2026-10-28T12:00:00Z'], ['death_run', '2026-10-29T12:00:00Z'],
    ['win_run', '2026-10-30T12:00:00Z'], ['death_run', '2025-10-31T12:00:00Z']]) insert.run(1, event, Date.parse(at) / 1000);
  initializeSeasonParticipation(f.db, new Date('2026-11-01T12:00:00Z'));
  f.db.exec('DELETE FROM xp_events');
  initializeSeasonParticipation(f.db, new Date('2026-11-04T12:00:00Z'));
  assert.equal(f.settle('2026-11-04T12:00:00Z').results[0].total, 2);
});

test('doubled positive job XP records participation even with no ordinary XP gain', t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2027-01-01T12:00:00Z') });
  const f = fixture(t); f.db.exec(`INSERT INTO user_job_xp VALUES(1,0),(2,999);
    UPDATE user_job_xp SET xp=xp+2 WHERE user_id=1;
    UPDATE user_job_xp SET xp=xp+1 WHERE user_id=2;`);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM seasonal_participation_days').get().n, 2,
    'a doubled job award limited to one remaining XP by its cap still qualifies');
  assert.equal(f.db.prepare('SELECT xp FROM users WHERE id=1').get().xp, 0);
});
