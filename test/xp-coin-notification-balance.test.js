'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Database = require('better-sqlite3');

function fixture({ xp = 495999, purchased = 16, bonus = 393, spent = 899 } = {}) {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, xp INTEGER, xp_boost_pct INTEGER DEFAULT 0,
    xp_boost_carry REAL DEFAULT 0, xp_from_boost INTEGER DEFAULT 0, coins_spent INTEGER DEFAULT 0,
    bonus_coins INTEGER DEFAULT 0, pending_bonus_gc INTEGER DEFAULT 0, bonus_gc_generated INTEGER DEFAULT 0,
    bonus_gc_chance_purchased INTEGER DEFAULT 0, bonus_gc_mint_purchased INTEGER DEFAULT 0);
    CREATE TABLE notifications (id INTEGER PRIMARY KEY, user_id INTEGER, type TEXT, payload TEXT);
    CREATE TABLE xp_events (id INTEGER PRIMARY KEY, user_id INTEGER, event TEXT, ref TEXT, template_id INTEGER,
      UNIQUE(user_id,event,ref));
    CREATE TABLE coin_events (id INTEGER PRIMARY KEY, user_id INTEGER, event TEXT, ref TEXT, amount INTEGER,
      UNIQUE(user_id,event,ref));
    CREATE TABLE level_up_templates (id INTEGER PRIMARY KEY, active INTEGER);`);
  db.prepare('INSERT INTO users(id,xp,bonus_gc_mint_purchased,bonus_coins,coins_spent) VALUES(1,?,?,?,?)')
    .run(xp, purchased, bonus, spent);
  const math = Object.create(Math); math.random = () => 1;
  const context = vm.createContext({ db, Math: math, isImpersonatingContext: () => false, seasonalXpMultiplier: () => 1,
    _insertNotif: db.prepare('INSERT INTO notifications(user_id,type,payload) VALUES(?,?,?)'),
    _appXpHook: null, _xpFeedHook: null, getTitleForLevel: level => 'Level ' + level });
  const source = fs.readFileSync(require.resolve('../server/db/xp'), 'utf8');
  vm.runInContext(source.slice(source.indexOf('function computeLevel('), source.indexOf('function toRoman('))
    + '\n_liveUserCount = () => 1000;', context);
  vm.runInContext(source.slice(source.indexOf('const _awardCoinsTx'), source.indexOf('// Same central safety net as awardCoins above.'))
    + '\nglobalThis.award = _awardXpTx;', context);
  return { db, context, award: (amount, ref = 'test') => context.award(1, 'idle_heartbeat', ref, amount),
    balance: () => context.coinBalance(db.prepare('SELECT * FROM users WHERE id=1').get()),
    coins: () => db.prepare("SELECT payload FROM notifications WHERE type='coin_gain' ORDER BY id").all().map(row => JSON.parse(row.payload)) };
}

test('same-tick level and mint rewards report the final spendable balance', t => {
  const f = fixture(); t.after(() => f.db.close());
  assert.equal(f.balance(), 12);
  assert.equal(f.award(1), true);
  assert.deepEqual(f.coins(), [
    { amount: 1, balance: 14, reason: 'level_up_coin' },
    { amount: 1, balance: 14, reason: 'xp_milestone' },
  ]);
  assert.equal(f.balance(), 14);
  assert.equal(f.db.prepare('SELECT bonus_coins FROM users WHERE id=1').get().bonus_coins, 394);
});

test('admin-only notifications preserve XP, level rewards and coin minting', t => {
  const f = fixture(); t.after(() => f.db.close());
  require('../server/db/notification-policy').initializeNotificationPolicy(f.db);
  assert.equal(f.award(1), true);
  assert.equal(f.balance(), 14);
  assert.equal(f.db.prepare('SELECT xp FROM users WHERE id=1').get().xp, 496000);
  assert.equal(f.db.prepare('SELECT bonus_coins FROM users WHERE id=1').get().bonus_coins, 394);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM notifications').get().n, 0);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM xp_events WHERE event='level_up'").get().n, 1);
});

test('an XP award crossing multiple levels includes every level coin in the mint notification', t => {
  const f = fixture({ xp: 0, purchased: 0, bonus: 0, spent: 0 }); t.after(() => f.db.close());
  f.award(6000);
  const notifications = f.coins();
  assert.deepEqual(notifications.filter(row => row.reason === 'level_up_coin').map(row => row.balance), [7, 8, 9]);
  assert.deepEqual(notifications.at(-1), { amount: 6, balance: 9, reason: 'xp_milestone' });
  assert.equal(f.balance(), 9);
});

test('mint gains without a level-up retain existing bonus coins and spending', t => {
  const f = fixture({ xp: 10000, purchased: 0, bonus: 5, spent: 2 }); t.after(() => f.db.close());
  f.award(1000);
  assert.equal(f.coins().length, 1);
  assert.equal(f.coins().at(-1).balance, f.balance());
  assert.equal(f.coins().at(-1).reason, 'xp_milestone');
});

test('duplicate XP awards neither mint coins nor duplicate notifications', t => {
  const f = fixture(); t.after(() => f.db.close());
  f.award(1);
  const before = f.coins(), balance = f.balance();
  assert.equal(f.award(1), false);
  assert.deepEqual(f.coins(), before);
  assert.equal(f.balance(), balance);
});

test('notification failure rolls back XP and all same-tick level rewards', t => {
  const f = fixture(); t.after(() => f.db.close());
  const before = f.db.prepare('SELECT * FROM users WHERE id=1').get();
  f.db.exec(`CREATE TRIGGER reject_mint_notification BEFORE INSERT ON notifications
    WHEN json_extract(NEW.payload,'$.reason')='xp_milestone'
    BEGIN SELECT RAISE(ABORT,'notification failed'); END;`);
  assert.throws(() => f.award(1), /notification failed/);
  assert.deepEqual(f.db.prepare('SELECT * FROM users WHERE id=1').get(), before);
  assert.equal(f.db.prepare('SELECT count(*) n FROM xp_events').get().n, 0);
  assert.equal(f.db.prepare('SELECT count(*) n FROM coin_events').get().n, 0);
  assert.deepEqual(f.coins(), []);
});

test('admin hooks report committed mining and Job EV changes, never duplicate or failed awards',t=>{
 const f=fixture();t.after(()=>f.db.close());require('../server/db/diamonds').initializeDiamondBalances(f.db);
 f.db.exec('INSERT INTO user_diamonds(user_id,dig_progress) VALUES(1,999999)');require('../server/db/job-xp').initializeJobXp(f.db);
 const events=[];f.context._appXpHook=event=>events.push(JSON.parse(JSON.stringify(event)));
 const code=fs.readFileSync(require.resolve('../server/db/xp'),'utf8');vm.runInContext(code.slice(code.indexOf('function awardXp('),code.indexOf('function awardIdleHeartbeatXp(')),f.context);
 assert.equal(f.context.awardXp(1,'visit_node','diamond-test',0),true);assert.deepEqual(events,[{userId:1,jobXpDelta:1},{userId:1,diamondDelta:1}]);
 assert.equal(f.context.awardXp(1,'visit_node','diamond-test',0),false);assert.equal(events.length,2);
 f.db.exec('UPDATE user_job_xp SET xp=999 WHERE user_id=1; UPDATE user_diamonds SET dig_progress=0 WHERE user_id=1');
 assert.equal(f.context.awardXp(1,'visit_node','job-capped',0),true);
 assert.equal(f.db.prepare('SELECT xp FROM user_job_xp WHERE user_id=1').get().xp,999);
 assert.deepEqual(events.at(-1),{userId:1,jobXpDelta:0});
 f.db.exec("CREATE TRIGGER reject_xp BEFORE INSERT ON xp_events BEGIN SELECT RAISE(ABORT,'fail xp');END");
 assert.throws(()=>f.context.awardXp(1,'visit_node','diamond-fail',0),/fail xp/);assert.equal(events.length,3);
});
