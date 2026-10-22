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
    bonus_coins INTEGER DEFAULT 100,coins_spent INTEGER DEFAULT 0,bonus_gc_mint_purchased INTEGER DEFAULT 0);
    INSERT INTO users(id,username,is_admin) VALUES(1,'Admin',1),(17,'Sashii',0),(2,'Player',0);
    CREATE TABLE books(id INTEGER PRIMARY KEY,name TEXT,is_container INTEGER DEFAULT 0,parent_book_id INTEGER,
      total_sections INTEGER DEFAULT 100,discoverable_sections INTEGER,max_section_number INTEGER);
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

test('rewards require every visited section, combine runs, ignore mapped-only nodes, and never repeat after reset',t=>{
  const f=fixture(t);f.addBook(10);
  f.save(2,10,[range(1,50),range(52,100)],{graph:Object.fromEntries(range(1,100).map(id=>[id,{}]))});
  assert.equal(f.check(2,10),0);
  f.save(2,10,[range(1,50),range(51,100)]);
  assert.equal(f.check(2,10),1);assert.equal(f.check(2,10),0);
  f.save(2,10,[]);assert.equal(f.check(2,10),0);assert.equal(f.wallet(2).rubies_earned,1);
  assert.deepEqual(ruby.rubyInfoForUser(f.db,2),{});
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

test('invalid, hidden-account, insufficient-funds and impersonated trades leave every ledger untouched',t=>{
  const f=fixture(t);
  for(const value of [0,-1,1.5,Infinity,'1',Number.MAX_SAFE_INTEGER+1])assert.equal(f.exchange(1,value,'ruby-request-0001',3).error,'invalid_amount');
  assert.equal(f.exchange(2,1,'ruby-request-0001',3).error,'unavailable');
  assert.equal(f.exchange(1,1,'short',3).error,'invalid_request');
  assert.equal(f.exchange(1,1,'ruby-request-0001',3,'gift').error,'invalid_request');
  assert.equal(f.exchange(1,1,'ruby-request-0001',3).error,'insufficient_rubies');
  f.db.exec('UPDATE users SET bonus_coins=0 WHERE id=1');
  assert.equal(f.exchange(1,1,'ruby-request-0001',3,'buy').error,'insufficient_coins');
  f.impersonate();assert.equal(f.exchange(1,1,'ruby-request-0001',3).error,'unavailable');
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM ruby_exchanges').get().n,0);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM coin_events').get().n,0);
});

test('access follows the original account when names change, and a shortened discoverable count cannot certify missing visits',t=>{
  const f=fixture(t);
  f.db.exec("UPDATE users SET username='Sashii-old' WHERE id=17; UPDATE users SET username='Sashii' WHERE id=2");
  assert.equal(ruby.hasRubyAccess(f.db,17),true);assert.equal(ruby.hasRubyAccess(f.db,2),false);
  assert.equal(ruby.rubyInfoForUser(f.db,17).rubiesBalance,0);assert.deepEqual(ruby.rubyInfoForUser(f.db,2),{});
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
