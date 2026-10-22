'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Database = require('better-sqlite3');
const ruby = require('../server/db/rubies');

function fixture(t) {
  const db = new Database(':memory:');t.after(()=>db.close());db.pragma('foreign_keys=ON');
  db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,username TEXT,is_admin INTEGER DEFAULT 0,xp INTEGER DEFAULT 0,
    bonus_coins INTEGER DEFAULT 100,coins_spent INTEGER DEFAULT 0,bonus_gc_mint_purchased INTEGER DEFAULT 0,is_squire INTEGER NOT NULL DEFAULT 0);
    INSERT INTO users(id,username,is_admin) VALUES(1,'Admin',1),(17,'Sashii',0),(2,'Player',0);
    CREATE TABLE books(id INTEGER PRIMARY KEY,name TEXT,is_container INTEGER DEFAULT 0,parent_book_id INTEGER,
      total_sections INTEGER DEFAULT 100,discoverable_sections INTEGER,max_section_number INTEGER,is_public INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE user_books(user_id INTEGER,book_id INTEGER,state_data TEXT,PRIMARY KEY(user_id,book_id));
    CREATE TABLE book_sections(book_id INTEGER,section_id TEXT);
    CREATE TABLE book_reading_entries(book_id INTEGER,section_id TEXT,counts_as_section INTEGER);
    CREATE TABLE book_anthology_memberships(book_id INTEGER,anthology_id INTEGER);
    CREATE TABLE xp_events(user_id INTEGER,event TEXT,ref TEXT,UNIQUE(user_id,event,ref));
    CREATE TABLE coin_events(user_id INTEGER,event TEXT,ref TEXT,amount INTEGER,UNIQUE(user_id,event,ref));
    CREATE TABLE notifications(user_id INTEGER,type TEXT,payload TEXT);`);
  ruby.initializeRubies(db);
  const check=ruby.createRubyCompletionChecker(db);
  const addBook=(id,total=100,parent=null,container=0)=>db.prepare('INSERT INTO books(id,total_sections,parent_book_id,is_container) VALUES(?,?,?,?)').run(id,total,parent,container);
  const save=(user,book,paths,extra={})=>db.prepare('INSERT OR REPLACE INTO user_books VALUES(?,?,?)').run(user,book,JSON.stringify({playthroughs:paths.map(path=>({path})),...extra}));
  const wallet=id=>db.prepare('SELECT * FROM user_rubies WHERE user_id=?').get(id);
  let impersonating=false;
  const isImpersonatingContext=()=>impersonating;
  const source=fs.readFileSync(require.resolve('../server/db/xp'),'utf8');
  const xp=vm.createContext({db,isImpersonatingContext,_appXpHook:null,_insertNotif:db.prepare('INSERT INTO notifications VALUES(?,?,?)')});
  vm.runInContext(source.slice(source.indexOf('function computeLevel('),source.indexOf('function toRoman('))+
    source.slice(source.indexOf('const _awardCoinsTx'),source.indexOf('// Roll bonus GC')),xp);
  const context=vm.createContext({module:{exports:{}},require(name){
    if(name==='./connection')return{db};if(name==='./xp')return{awardCoins:xp.awardCoins,coinBalance:xp.coinBalance};
    if(name==='./rubies')return ruby;if(name==='../impersonation-context')return{isImpersonatingContext};throw Error(name);
  }});
  vm.runInContext(fs.readFileSync(require.resolve('../server/db/ruby-exchange'),'utf8'),context);
  return {db,check,addBook,save,wallet,exchange:context.module.exports.exchangeRubies,
    impersonate:()=>{impersonating=true;},gold:id=>xp.coinBalance(db.prepare('SELECT * FROM users WHERE id=?').get(id))};
}
const range=(start,end)=>Array.from({length:end-start+1},(_,i)=>start+i);

test('Squires qualify at 25 sections; other players still need 100 and current role is read on every check',t=>{
  const f=fixture(t);
  for(const total of [24,25,99,100]){
    f.addBook(total,total);
    for(const user of [2,17]) f.save(user,total,[range(1,total)]);
  }
  f.db.exec('UPDATE users SET is_squire=1 WHERE id=17');
  for(const total of [24,25,99,100]){
    assert.equal(f.check(17,total),total>=25?1:0);
    assert.equal(f.check(2,total),total>=100?1:0);
  }
  f.db.exec('UPDATE users SET is_squire=1 WHERE id=2');
  assert.equal(f.check(2,25),1);
  f.db.exec('UPDATE users SET is_squire=0 WHERE id=2');
  assert.equal(f.check(2,99),0);assert.equal(f.check(2,25),0);
  assert.equal(f.wallet(2).rubies_earned,2);
  assert.equal(f.check(999,100),0);
});

test('Squire anthologies need 25 combined sections, every member visited and public, with independent child rewards',t=>{
  const f=fixture(t);f.db.exec('UPDATE users SET is_squire=1 WHERE id=17');
  f.addBook(20,0,null,1);f.addBook(21,12,20);f.addBook(22,13);
  f.db.exec('INSERT INTO book_anthology_memberships VALUES(21,20),(22,20)');
  f.save(17,21,[range(1,12)]);f.save(17,22,[range(1,12)]);
  assert.equal(f.check(17,20),0);
  f.save(17,22,[range(1,13)]);
  for(const id of [20,21,22]){
    f.db.prepare('UPDATE books SET is_public=0 WHERE id=?').run(id);
    assert.equal(f.check(17,20),0);
    f.db.prepare('UPDATE books SET is_public=1 WHERE id=?').run(id);
  }
  assert.equal(f.check(17,22),1);assert.equal(f.check(17,20),0);
  f.addBook(30,0,null,1);f.addBook(31,24,30);f.save(17,31,[range(1,24)]);
  assert.equal(f.check(17,30),0);
  f.addBook(40,0,null,1);f.addBook(41,25,40);f.save(17,41,[range(1,25)]);
  assert.equal(f.check(17,41),2);
  assert.equal(f.wallet(17).rubies_earned,3);
});

test('Squire migration backfills existing accounts once, preserves sold rewards and player data, and counts shared stock',t=>{
  const f=fixture(t);
  f.db.exec("INSERT INTO ruby_migrations VALUES('completion-v1'); UPDATE users SET is_squire=1 WHERE id=17");
  f.addBook(100);f.save(17,100,[range(1,100)]);assert.equal(f.check(17,100),1);
  f.exchange(17,1,'existing-ruby-sale',3);
  const visits=f.db.prepare("INSERT INTO xp_events VALUES(17,'visit_node',?)");
  for(let book=1;book<=9;book++){
    f.addBook(book,25);
    // Include both saved progress and permanent visits after a library removal.
    if(book%2) f.save(17,book,[range(1,12),range(13,25)],{notes:'keep',inventory:[{id:'original'}]});
    else for(const n of range(1,25)) visits.run(`${book}:${n}`);
    f.save(2,book,[range(1,25)]);
  }
  f.addBook(200,25);f.save(17,200,[range(1,25)]);f.db.exec('UPDATE books SET is_public=0 WHERE id=200');
  const snapshot=table=>f.db.prepare('SELECT * FROM '+table+' ORDER BY rowid').all();
  const preserved=Object.fromEntries(['users','user_books','xp_events','coin_events','ruby_exchanges','notifications'].map(table=>[table,snapshot(table)]));
  ruby.backfillRubies(f.db);ruby.backfillRubies(f.db);
  assert.equal(f.wallet(17).rubies_earned,10);assert.equal(f.wallet(17).rubies_spent,1);
  assert.equal(f.wallet(2),undefined);
  assert.deepEqual(f.db.prepare('SELECT * FROM ruby_market').get(),{id:1,rubies:2,completions:10,rubies_generated:1});
  for(const [table,rows] of Object.entries(preserved)) assert.deepEqual(snapshot(table),rows,table);
  assert.equal(ruby.backfillRubiesForUser(f.db,17),0);
  f.db.exec('UPDATE books SET is_public=1 WHERE id=200');
  assert.equal(ruby.backfillRubiesForUser(f.db,17),1);
  assert.equal(ruby.backfillRubiesForUser(f.db,17),0);
});

test('Squire small-book rewards still require the canonical visited IDs and a failed backfill rolls back entirely',t=>{
  const f=fixture(t);f.db.exec('UPDATE users SET is_squire=1 WHERE id=17');
  f.addBook(1,25);f.db.exec('UPDATE books SET max_section_number=50 WHERE id=1');
  const insert=f.db.prepare('INSERT INTO book_sections VALUES(1,?)');
  for(const n of range(1,25)) insert.run(String(n*2));
  f.save(17,1,[range(1,25)]);assert.equal(f.check(17,1),0);
  f.save(17,1,[range(1,25).map(n=>n*2)]);
  f.db.exec("CREATE TRIGGER fail_stock BEFORE UPDATE ON ruby_market BEGIN SELECT RAISE(ABORT,'stock failed'); END");
  assert.throws(()=>ruby.backfillRubies(f.db),/stock failed/);
  assert.equal(f.wallet(17),undefined);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM ruby_migrations').get().n,0);
  f.db.exec('DROP TRIGGER fail_stock');ruby.backfillRubies(f.db);assert.equal(f.wallet(17).rubies_earned,1);
});

test('admin Squire assignment retroactively rewards past completions atomically, once, without revoking on removal',t=>{
  const f=fixture(t);f.addBook(25,25);f.save(17,25,[range(1,25)]);
  const context=vm.createContext({module:{exports:{}},require(name){
    if(name==='./connection')return {db:f.db};
    if(name==='./xp')return {_insertNotif:f.db.prepare('INSERT INTO notifications VALUES(?,?,?)')};
    if(name==='./squires')return require('../server/db/squires');
    if(name==='./rubies')return ruby;
    return {};
  }});
  vm.runInContext(fs.readFileSync(require.resolve('../server/db/feed'),'utf8'),context);
  f.db.exec("CREATE TRIGGER fail_reward BEFORE INSERT ON ruby_rewards BEGIN SELECT RAISE(ABORT,'reward failed'); END");
  assert.throws(()=>context.module.exports.setSquire(17,true),/reward failed/);
  assert.equal(f.db.prepare('SELECT is_squire FROM users WHERE id=17').get().is_squire,0);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM notifications').get().n,0);
  f.db.exec('DROP TRIGGER fail_reward');
  assert.equal(context.module.exports.setSquire(17,true),true);
  assert.equal(f.wallet(17).rubies_earned,1);
  assert.equal(context.module.exports.setSquire(17,true),true);
  assert.equal(f.wallet(17).rubies_earned,1);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM notifications').get().n,1);
  assert.equal(context.module.exports.setSquire(17,false),true);
  assert.equal(f.wallet(17).rubies_earned,1);
});

test('private books cannot earn rubies; publishing permits one reward and unpublishing preserves it',t=>{
  const f=fixture(t);f.addBook(10);f.save(2,10,[range(1,100)]);
  f.db.exec('UPDATE books SET is_public=0 WHERE id=10');
  assert.equal(f.check(2,10),0);assert.equal(f.wallet(2),undefined);
  ruby.backfillRubies(f.db);assert.equal(f.wallet(2),undefined);
  assert.equal(f.db.prepare('SELECT completions FROM ruby_market').get().completions,0);
  f.db.exec('UPDATE books SET is_public=1 WHERE id=10');
  assert.equal(f.check(2,10),1);
  const market=f.db.prepare('SELECT * FROM ruby_market').get();
  f.db.exec('UPDATE books SET is_public=0 WHERE id=10');
  assert.equal(f.check(2,10),0);assert.equal(f.wallet(2).rubies_earned,1);
  assert.deepEqual(f.db.prepare('SELECT * FROM ruby_market').get(),market);
});

test('an anthology and all primary and secondary members must be public for its reward',t=>{
  const f=fixture(t);f.addBook(20,0,null,1);f.addBook(21,60,20);f.addBook(22,40);
  f.db.exec('INSERT INTO book_anthology_memberships VALUES(22,20)');
  f.save(2,21,[range(1,60)]);f.save(2,22,[range(1,40)]);
  for(const id of [20,21,22]){
    f.db.prepare('UPDATE books SET is_public=0 WHERE id=?').run(id);
    assert.equal(f.check(2,20),0);assert.equal(f.check(2,21),0);assert.equal(f.check(2,22),0);
    f.db.prepare('UPDATE books SET is_public=1 WHERE id=?').run(id);
  }
  assert.equal(f.wallet(2),undefined);
  assert.equal(f.check(2,22),1);assert.equal(f.check(2,20),0);
});

test('a public child book can earn independently inside a private anthology',t=>{
  const f=fixture(t);f.addBook(20,0,null,1);f.addBook(21,100,20);
  f.db.exec('UPDATE books SET is_public=0 WHERE id=20');f.save(2,21,[range(1,100)]);
  assert.equal(f.check(2,21),1);
  assert.deepEqual(f.db.prepare('SELECT book_id,kind FROM ruby_rewards').all(),[{book_id:21,kind:'book'}]);
  f.db.exec('UPDATE books SET is_public=1 WHERE id=20');
  assert.equal(f.check(2,21),1);assert.equal(f.wallet(2).rubies_earned,2);
});

test('rewards require every visited section, combine runs, ignore mapped-only nodes, and never repeat after reset',t=>{
  const f=fixture(t);f.addBook(10);
  f.save(2,10,[range(1,50),range(52,100)],{graph:Object.fromEntries(range(1,100).map(id=>[id,{}]))});
  assert.equal(f.check(2,10),0);
  f.save(2,10,[range(1,50),range(51,100)]);
  assert.equal(f.check(2,10),1);assert.equal(f.check(2,10),0);
  f.save(2,10,[]);assert.equal(f.check(2,10),0);assert.equal(f.wallet(2).rubies_earned,1);
  assert.equal(ruby.rubyInfoForUser(f.db,2).rubiesBalance,1);
  assert.equal(ruby.rubyInfoForUser(f.db,2,true).rubiesBalance,1);
});

test('sparse and prefixed imported IDs, uncounted entries and out-of-range paths cannot fake completion',t=>{
  const f=fixture(t);f.addBook(10);f.db.exec('UPDATE books SET max_section_number=199 WHERE id=10');
  const add=f.db.prepare('INSERT INTO book_sections VALUES(10,?)');
  const ids=range(1,99).map(n=>String(n*2));ids.push('A1');
  for(const id of [...ids,'intro'])add.run(id);
  f.db.exec("INSERT INTO book_reading_entries VALUES(10,'intro',0)");
  f.save(1,10,[range(1,150)]);assert.equal(f.check(1,10),0);
  f.save(1,10,[ids.slice(0,99),['A1']]);assert.equal(f.check(1,10),1);
  f.addBook(11,99);f.save(1,11,[range(1,200)]);assert.equal(f.check(1,11),0);
  f.addBook(12);f.db.exec("INSERT INTO book_sections VALUES(12,'1')");f.save(1,12,[range(1,100)]);assert.equal(f.check(1,12),0);
});

test('anthology totals qualify together, include secondary members once, and eligible books earn separately',t=>{
  const f=fixture(t);f.addBook(20,0,null,1);f.addBook(21,60,20);f.addBook(22,40);
  f.db.exec('INSERT INTO book_anthology_memberships VALUES(21,20),(22,20)');
  f.save(17,21,[range(1,60)]);f.save(17,22,[range(1,39)]);assert.equal(f.check(17,21),0);
  f.save(17,22,[range(1,40)]);assert.equal(f.check(17,22),1);assert.equal(f.check(17,21),0);
  f.addBook(30,0,null,1);f.addBook(31,100,30);f.addBook(32,100,30);
  f.save(17,31,[range(1,100)]);assert.equal(f.check(17,31),1);
  f.save(17,32,[range(1,100)]);assert.equal(f.check(17,32),2);
  assert.equal(f.wallet(17).rubies_earned,4);
});

test('retroactive migration uses permanent visits after run deletion, preserves existing data and generates stock per ten',t=>{
  const f=fixture(t);const insert=f.db.prepare("INSERT INTO xp_events VALUES(2,'visit_node',?)");
  for(let id=1;id<=10;id++){f.addBook(id);for(let n=1;n<=100;n++)insert.run(`${id}:${n}`);}
  f.save(1,1,[range(1,50)],{notes:'keep me',inventory:[{id:'original'}]});
  const before=f.db.prepare('SELECT * FROM user_books').all();
  ruby.backfillRubies(f.db);assert.equal(f.wallet(2).rubies_earned,10);
  assert.deepEqual(f.db.prepare('SELECT * FROM ruby_market').get(),{id:1,rubies:1,completions:10,rubies_generated:1});
  ruby.initializeRubies(f.db);ruby.backfillRubies(f.db);
  assert.equal(f.wallet(2).rubies_earned,10);assert.deepEqual(f.db.prepare('SELECT * FROM user_books').all(),before);
});

test('completion transaction rolls back reward, wallet and app stock together on failure',t=>{
  const f=fixture(t);f.addBook(1);f.save(1,1,[range(1,100)]);
  f.db.exec("CREATE TRIGGER fail_stock BEFORE UPDATE ON ruby_market BEGIN SELECT RAISE(ABORT,'stock failed'); END");
  assert.throws(()=>f.check(1,1),/stock failed/);assert.equal(f.wallet(1),undefined);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM ruby_rewards').get().n,0);
});

test('same user-count rate both ways, stock conservation, idempotency and changed quotes',t=>{
  const f=fixture(t);f.addBook(1);f.save(1,1,[range(1,100)]);f.check(1,1);
  assert.equal(f.exchange(17,1,'ruby-request-0001',3,'buy').error,'insufficient_stock');
  const gold=f.gold(1);assert.equal(f.exchange(1,1,'ruby-request-0001',3).goldReceived,3);
  assert.equal(f.gold(1),gold+3);assert.equal(f.db.prepare('SELECT rubies FROM ruby_market').get().rubies,1);
  assert.equal(f.exchange(1,1,'ruby-request-0001',3).repeated,true);assert.equal(f.gold(1),gold+3);
  assert.equal(f.exchange(17,1,'ruby-request-0002',3,'buy').goldSpent,3);
  assert.equal(f.wallet(17).rubies_earned,0);assert.equal(f.wallet(17).rubies_bought,1);
  assert.equal(f.db.prepare('SELECT rubies FROM ruby_market').get().rubies,0);
  f.db.exec("INSERT INTO users(id,username) VALUES(99,'New')");
  assert.equal(f.exchange(17,1,'ruby-request-0003',3).error,'rate_changed');
  assert.equal(f.exchange(17,1,'ruby-request-0003',4).goldReceived,4);
  assert.equal(f.exchange(17,1,'ruby-request-0002',3,'buy').repeated,true);
  assert.equal(f.exchange(17,2,'ruby-request-0002',3,'buy').error,'invalid_request');
  const profile=ruby.rubyInfoForUser(f.db,17);assert.equal(profile.rubyBuyRate,4);assert.equal(profile.rubyExchangeRate,4);
});

test('invalid, nonexistent-account, insufficient-funds and impersonated trades leave every ledger untouched',t=>{
  const f=fixture(t);
  for(const value of [0,-1,1.5,Infinity,'1',Number.MAX_SAFE_INTEGER+1])assert.equal(f.exchange(1,value,'ruby-request-0001',3).error,'invalid_amount');
  assert.equal(f.exchange(999,1,'ruby-request-0001',3).error,'unavailable');
  assert.equal(f.exchange(1,1,'short',3).error,'invalid_request');
  assert.equal(f.exchange(1,1,'ruby-request-0001',3,'gift').error,'invalid_request');
  assert.equal(f.exchange(1,1,'ruby-request-0001',3).error,'insufficient_rubies');
  f.db.exec('UPDATE users SET bonus_coins=0 WHERE id=1');
  assert.equal(f.exchange(1,1,'ruby-request-0001',3,'buy').error,'insufficient_coins');
  f.impersonate();assert.equal(f.exchange(1,1,'ruby-request-0001',3).error,'unavailable');
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM ruby_exchanges').get().n,0);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM coin_events').get().n,0);
});

test('every registered account has access, and a shortened discoverable count cannot certify missing visits',t=>{
  const f=fixture(t);
  f.db.exec("UPDATE users SET username='Sashii-old' WHERE id=17; UPDATE users SET username='Sashii' WHERE id=2");
  assert.equal(ruby.hasRubyAccess(f.db,17),true);assert.equal(ruby.hasRubyAccess(f.db,2),true);
  assert.equal(ruby.rubyInfoForUser(f.db,17).rubiesBalance,0);assert.equal(ruby.rubyInfoForUser(f.db,2).rubiesBalance,0);
  assert.deepEqual(ruby.rubyInfoForUser(f.db,999),{});
  assert.equal(f.exchange(2,1,'ordinary-ruby-0001',3,'buy').error,'insufficient_stock');
  f.addBook(1);f.db.exec('UPDATE books SET discoverable_sections=99 WHERE id=1');
  f.save(17,1,[range(1,99)]);assert.equal(f.check(17,1),0);
  f.save(17,1,[range(1,100)]);assert.equal(f.check(17,1),1);
});

test('failed gold notification rolls back a sale and failed trade history rolls back a purchase',t=>{
  const f=fixture(t);f.addBook(1);f.save(1,1,[range(1,100)]);f.check(1,1);
  f.db.exec("CREATE TRIGGER fail_notice BEFORE INSERT ON notifications BEGIN SELECT RAISE(ABORT,'notice failed'); END");
  assert.throws(()=>f.exchange(1,1,'ruby-request-0001',3),/notice failed/);
  assert.equal(f.wallet(1).rubies_spent,0);assert.equal(f.db.prepare('SELECT rubies FROM ruby_market').get().rubies,0);
  f.db.exec('DROP TRIGGER fail_notice');f.exchange(1,1,'ruby-request-0001',3);
  const gold=f.gold(17);
  f.db.exec("CREATE TRIGGER fail_trade BEFORE INSERT ON ruby_exchanges BEGIN SELECT RAISE(ABORT,'trade failed'); END");
  assert.throws(()=>f.exchange(17,1,'ruby-request-0002',3,'buy'),/trade failed/);
  assert.equal(f.gold(17),gold);assert.equal(f.wallet(17),undefined);assert.equal(f.db.prepare('SELECT rubies FROM ruby_market').get().rubies,1);
});
