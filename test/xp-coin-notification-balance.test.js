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
    bonus_gc_chance_purchased INTEGER DEFAULT 0, bonus_gc_mint_purchased INTEGER DEFAULT 0,
    bonus_heartbeat_xp INTEGER DEFAULT 0, heartbeat_carry REAL DEFAULT 0, heartbeat_minutes_banked INTEGER DEFAULT 0,
    heartbeat_xp_earned INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE notifications (id INTEGER PRIMARY KEY, user_id INTEGER, type TEXT, payload TEXT);
    CREATE TABLE xp_events (id INTEGER PRIMARY KEY, user_id INTEGER, event TEXT, ref TEXT, template_id INTEGER,
      UNIQUE(user_id,event,ref));
    CREATE TABLE coin_events (id INTEGER PRIMARY KEY, user_id INTEGER, event TEXT, ref TEXT, amount INTEGER,
      UNIQUE(user_id,event,ref));
    CREATE TABLE level_up_templates (id INTEGER PRIMARY KEY, active INTEGER);`);
  db.exec(`CREATE TABLE user_job_xp(user_id INTEGER PRIMARY KEY,xp INTEGER DEFAULT 0);
    CREATE TABLE job_xp_policy(id INTEGER PRIMARY KEY,user_count INTEGER);
    INSERT INTO job_xp_policy VALUES(1,1);`);
  db.exec(`CREATE TABLE user_rubies(user_id INTEGER PRIMARY KEY,rubies_earned INTEGER DEFAULT 0,
    rubies_bought INTEGER DEFAULT 0,rubies_spent INTEGER DEFAULT 0);`);
  db.prepare('INSERT INTO users(id,xp,bonus_gc_mint_purchased,bonus_coins,coins_spent) VALUES(1,?,?,?,?)')
    .run(xp, purchased, bonus, spent);
  const math = Object.create(Math); math.random = () => 1;
  const context = vm.createContext({ db, Math: math,
    require: name => require('../server/db/' + name),
    isImpersonatingContext: () => false, seasonalContributionEligible:require('../server/db/seasonal-contributions').seasonalContributionEligible,seasonalXpMultiplier: () => 1,
    recordSeasonParticipation: () => {},
    recordCappedActivityGems: require('../server/db/capped-activity-gems').recordCappedActivityGems,
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

test('level-based heartbeats preserve earned XP and carry, accumulate tenths and deduplicate minutes', t => {
  const f = fixture({ xp: 1500, purchased: 0, bonus: 0, spent: 0 });
  t.after(() => f.db.close());
  const source = fs.readFileSync(require.resolve('../server/db/xp'), 'utf8');
  let minute = 100;
  Object.assign(f.context, { getXpAmount: () => 1, advanceHeartbeatCoins: () => false,
    Date: { now: () => minute * 60000 } });
  vm.runInContext(source.slice(source.indexOf('function awardXp('), source.indexOf('function getUserXpInfo(')), f.context);
  const state = () => f.db.prepare('SELECT xp,heartbeat_carry FROM users WHERE id=1').get();
  assert.deepEqual(state(), { xp: 1500, heartbeat_carry: 0 });
  for (let n = 1; n <= 10; n++, minute++) {
    assert.equal(f.context.awardIdleHeartbeatXp(1).awarded, true);
    const beforeRetry = state();
    assert.equal(f.context.awardIdleHeartbeatXp(1).awarded, false);
    assert.deepEqual(state(), beforeRetry);
    assert.equal(state().xp, n === 10 ? 1501 : 1500);
  }
  assert.equal(state().heartbeat_carry, 0);
  // Existing fractional entitlement remains; two purchases add another 0.2/min.
  f.db.exec('UPDATE users SET heartbeat_carry=0.7,bonus_heartbeat_xp=2,xp_boost_pct=100');
  f.context.awardIdleHeartbeatXp(1);
  assert.deepEqual(state(), { xp: 1502, heartbeat_carry: 0 });
  assert.equal(f.db.prepare('SELECT xp_boost_carry FROM users').get().xp_boost_carry, 0.1);
  // A level-zero player starts at zero and keeps all previously earned XP.
  f.db.exec('UPDATE users SET xp=500,bonus_heartbeat_xp=0,heartbeat_carry=0');
  minute++;
  f.context.awardIdleHeartbeatXp(1);
  assert.deepEqual(state(), { xp: 500, heartbeat_carry: 0 });
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

test('publishing a corrected pending mapping milestone preserves its original reward credit', t => {
  const f = fixture({ xp: 10000, purchased: 0, bonus: 0, spent: 0 });
  t.after(() => f.db.close());
  f.db.exec(`ALTER TABLE xp_events ADD COLUMN created_at INTEGER DEFAULT 0;
    CREATE TABLE credits(n INTEGER); INSERT INTO credits VALUES(0);
    CREATE TRIGGER count_credit AFTER INSERT ON xp_events BEGIN UPDATE credits SET n=n+1; END;`);
  assert.equal(f.context.award(1, 'visit_all', '1316', 40), true);
  const before = f.db.prepare('SELECT * FROM users WHERE id=1').get();
  const id = f.db.prepare("SELECT id FROM xp_events WHERE event='visit_all'").get().id;
  f.db.prepare("UPDATE xp_events SET event='visit_all_pending' WHERE id=?").run(id);
  assert.equal(f.context.award(1, 'visit_all', '1316', 40), true);
  assert.deepEqual(f.db.prepare('SELECT * FROM users WHERE id=1').get(), before);
  assert.equal(f.db.prepare('SELECT n FROM credits').get().n, 1);
  const event = f.db.prepare('SELECT * FROM xp_events WHERE id=?').get(id);
  assert.equal(event.event, 'visit_all');
  assert.ok(event.created_at > 0);
  assert.equal(f.context.award(1, 'visit_all', '1316', 40), false);
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
 assert.equal(f.context.awardXp(1,'visit_node','job-capped',0),false);
 assert.equal(f.db.prepare('SELECT xp FROM user_job_xp WHERE user_id=1').get().xp,999);
 assert.equal(events.length,2);
 f.db.exec('UPDATE user_job_xp SET xp=998 WHERE user_id=1');
 f.db.exec("CREATE TRIGGER reject_xp BEFORE INSERT ON xp_events BEGIN SELECT RAISE(ABORT,'fail xp');END");
 assert.throws(()=>f.context.awardXp(1,'visit_node','diamond-fail',0),/fail xp/);assert.equal(events.length,2);
});

test('a new completed-run diamond reaches the normal reward hook exactly once',t=>{
  const f=fixture();t.after(()=>f.db.close());
  require('../server/db/diamonds').initializeDiamondBalances(f.db);
  f.db.exec('INSERT INTO user_job_xp VALUES(1,0)');
  const insert=f.db.prepare("INSERT INTO xp_events(user_id,event,ref) VALUES(1,'win_run',?)");
  for(let n=1;n<=99;n++)insert.run('book:'+n);
  require('../server/db/completed-run-gems').initializeCompletedRunGems(f.db);
  const events=[];f.context._appXpHook=event=>events.push(JSON.parse(JSON.stringify(event)));
  const code=fs.readFileSync(require.resolve('../server/db/xp'),'utf8');
  vm.runInContext(code.slice(code.indexOf('function awardXp('),code.indexOf('function awardIdleHeartbeatXp(')),f.context);
  assert.equal(f.context.awardXp(1,'win_run','book:100',0),true);
  assert.deepEqual(events.filter(event=>event.rubyDelta),[{userId:1,rubyDelta:1}]);
  const count=events.length;
  assert.equal(f.context.awardXp(1,'win_run','book:100',0),false);assert.equal(events.length,count);
});

test('full buffers stop XP events and hooks; each stream resumes independently when its cap rises', t => {
  const f = fixture({ xp: 2999, purchased: 0, bonus: 0, spent: 0 });
  t.after(() => f.db.close());
  require('../server/db/diamonds').initializeDiamondBalances(f.db);
  require('../server/db/job-xp').initializeJobXp(f.db);
  f.db.exec('UPDATE user_job_xp SET xp=998 WHERE user_id=1');
  f.context._liveUserCount = () => f.db.prepare('SELECT user_count FROM job_xp_policy').get().user_count;
  const hooks = [];
  f.context._appXpHook = event => hooks.push(JSON.parse(JSON.stringify(event)));
  const source = fs.readFileSync(require.resolve('../server/db/xp'), 'utf8');
  vm.runInContext(source.slice(source.indexOf('function awardXp('), source.indexOf('function awardIdleHeartbeatXp(')), f.context);
  const award = ref => f.context.awardXp(1, 'visit_node', ref, 10);
  assert.equal(award('job-only'), true);
  assert.equal(f.db.prepare('SELECT xp FROM users WHERE id=1').get().xp, 2999);
  assert.equal(f.db.prepare('SELECT xp FROM user_job_xp WHERE user_id=1').get().xp, 999);
  assert.deepEqual(hooks, [{ userId: 1, jobXpDelta: 1 }]);
  const mining = f.db.prepare('SELECT * FROM user_diamonds WHERE user_id=1').get();
  assert.equal(award('both-full'), false);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM xp_events WHERE ref='both-full'").get().n, 0);
  assert.deepEqual(f.db.prepare('SELECT * FROM user_diamonds WHERE user_id=1').get(), mining);
  assert.equal(hooks.length, 1);
  f.db.exec('INSERT INTO users(id,xp) VALUES(2,0)');
  assert.equal(award('normal-resumes'), true);
  assert.equal(f.db.prepare('SELECT xp FROM users WHERE id=1').get().xp, 3009);
  assert.equal(f.db.prepare('SELECT xp FROM user_job_xp WHERE user_id=1').get().xp, 999);
  assert.deepEqual(hooks.find(event => event.xpDelta), { userId: 1, xpDelta: 10 });
  assert.equal(hooks.filter(event => 'jobXpDelta' in event).length, 1, 'normal XP does not emit a capped Job XP update');
  assert.deepEqual(f.db.prepare('SELECT * FROM user_diamonds WHERE user_id=1').get(), mining);
  for (let id=3; id<=10; id++) f.db.prepare('INSERT INTO users(id,xp) VALUES(?,0)').run(id);
  assert.equal(award('job-resumes'), true);
  assert.equal(f.db.prepare('SELECT xp FROM user_job_xp WHERE user_id=1').get().xp, 1000);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM xp_events WHERE ref='both-full'").get().n, 0, 'discarded activity is not replayed on cap changes');
  const after = f.db.prepare('SELECT xp FROM users WHERE id=1').get().xp;
  assert.equal(award('job-resumes'), false);
  assert.equal(f.db.prepare('SELECT xp FROM users WHERE id=1').get().xp, after);
});

test('an award approaching the player cap fills only the buffer and a full heartbeat adds no event or XP hook', t => {
  const f = fixture({ xp: 998, purchased: 0, bonus: 0, spent: 0 });
  t.after(() => f.db.close());
  f.context._liveUserCount = () => 1;
  const hooks=[];
  f.context._appXpHook = event => hooks.push(JSON.parse(JSON.stringify(event)));
  assert.equal(f.award(100000), true);
  assert.equal(f.db.prepare('SELECT xp FROM users WHERE id=1').get().xp, 2999);
  const count=f.db.prepare('SELECT COUNT(*) n FROM xp_events').get().n;
  const emitted=hooks.length;
  assert.equal(f.award(1, 'full-heartbeat'), false);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM xp_events').get().n, count);
  assert.equal(hooks.length, emitted);
});

test('fully capped players still earn other activity crystals without XP records, digging or XP floaties', t => {
  const f=fixture({xp:2999,purchased:0,bonus:0,spent:0});
  t.after(()=>f.db.close());
  require('../server/db/diamonds').initializeDiamondBalances(f.db);
  require('../server/db/job-xp').initializeJobXp(f.db);
  f.db.exec(`UPDATE user_job_xp SET xp=999 WHERE user_id=1;
    ALTER TABLE xp_events ADD COLUMN created_at INTEGER DEFAULT 0;
    CREATE TABLE books(id INTEGER PRIMARY KEY,series_id INTEGER,parent_book_id INTEGER);
    CREATE TABLE user_books(user_id INTEGER,book_id INTEGER,state_data TEXT,rating REAL);
    CREATE TABLE user_series(user_id INTEGER,series_id INTEGER,rating REAL);
    CREATE TABLE series_runs(user_id INTEGER,series_id INTEGER,started_at INTEGER,is_public INTEGER);`);
  require('../server/db/completed-run-gems').initializeCompletedRunGems(f.db);
  require('../server/db/sim-battle-gems').initializeSimBattleGems(f.db);
  require('../server/db/shared-run-gems').initializeSharedRunGems(f.db);
  const votes=require('../server/db/vote-gems');votes.initializeVoteGems(f.db);
  for(let n=1;n<=49;n++) {
    f.db.prepare('INSERT INTO completed_run_gem_runs VALUES(1,?)').run('run:'+n);
    f.db.prepare("INSERT INTO sim_battle_gem_battles VALUES(1,?,'win')").run('sim1:'+n);
    f.db.prepare('INSERT INTO shared_run_gem_runs(user_id,ref) VALUES(1,?)').run('share:'+n);
    votes.awardRatingVote(f.db,1,'book',n);
  }
  f.context._liveUserCount=()=>1;
  const hooks=[];f.context._appXpHook=event=>hooks.push(JSON.parse(JSON.stringify(event)));
  const source=fs.readFileSync(require.resolve('../server/db/xp'),'utf8');
  vm.runInContext(source.slice(source.indexOf('function awardXp('),source.indexOf('function awardIdleHeartbeatXp(')),f.context);
  for(const [event,ref]of [['win_run','run:50'],['battlesim_loss','sim1:50'],['share_run','share:50']]) {
    assert.equal(f.context.awardXp(1,event,ref,20),false);
    assert.equal(f.context.awardXp(1,event,ref,20),false,'replayed activity earns nothing extra');
  }
  votes.awardRatingVote(f.db,1,'book',50);
  assert.equal(f.db.prepare('SELECT diamonds_earned FROM user_diamonds WHERE user_id=1').get().diamonds_earned,4);
  assert.equal(hooks.filter(event=>event.diamondDelta===1).length,3,'activity crystal hooks still reach admin');
  assert.equal(hooks.some(event=>event.xpDelta || 'jobXpDelta' in event),false);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM xp_events').get().n,0);
  assert.equal(f.db.prepare('SELECT qualifying_events FROM user_diamonds WHERE user_id=1').get().qualifying_events,0);
  assert.equal(f.db.prepare('SELECT xp FROM users WHERE id=1').get().xp,2999);
  assert.equal(f.db.prepare('SELECT xp FROM user_job_xp WHERE user_id=1').get().xp,999);
});
