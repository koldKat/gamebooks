'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Database = require('better-sqlite3');
const {initializeVoteGems, awardRatingVote} = require('../server/db/vote-gems');
const {initializeGemNotifications} = require('../server/db/gem-notifications');
const {runInImpersonationContext} = require('../server/impersonation-context');

function fixture(t) {
  const db = new Database(':memory:'); t.after(() => db.close());
  db.pragma('foreign_keys=ON');
  db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY);
    INSERT INTO users VALUES(1),(2);
    CREATE TABLE user_books(user_id,book_id,rating,rated_at);
    CREATE TABLE user_series(user_id,series_id,rating,rated_at);
    CREATE TABLE xp_events(user_id,event,ref);
    CREATE TABLE user_diamonds(user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      diamonds_earned INTEGER NOT NULL DEFAULT 0,diamonds_spent INTEGER NOT NULL DEFAULT 0,
      diamonds_bought INTEGER NOT NULL DEFAULT 0,dig_progress INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE user_rubies(user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      rubies_earned INTEGER NOT NULL DEFAULT 0,rubies_spent INTEGER NOT NULL DEFAULT 0,
      rubies_bought INTEGER NOT NULL DEFAULT 0,rubies_collectibles INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE notifications(user_id,type,payload);
    CREATE TABLE diamond_market(id,diamonds); INSERT INTO diamond_market VALUES(1,12);
    CREATE TABLE ruby_market(id,rubies); INSERT INTO ruby_market VALUES(1,15);`);
  initializeGemNotifications(db);
  const wallet = id => ({ruby:db.prepare('SELECT diamonds_earned n FROM user_diamonds WHERE user_id=?').get(id)?.n||0,
    diamond:db.prepare('SELECT rubies_earned n FROM user_rubies WHERE user_id=?').get(id)?.n||0});
  const count = id => db.prepare('SELECT votes FROM vote_gem_totals WHERE user_id=?').get(id)?.votes||0;
  return {db,wallet,count};
}

test('50/150 give a ruby and 100/200 a diamond, never both at a milestone',t=>{
  const f=fixture(t); initializeVoteGems(f.db);
  for(let n=1;n<=200;n++) {
    const reward=awardRatingVote(f.db,1,n%2?'book':'series',n);
    assert.deepEqual(reward,{diamondDelta:n%100===50?1:0,rubyDelta:n%100===0?1:0},'vote '+n);
    assert.deepEqual(f.wallet(1),{ruby:Math.floor((n+50)/100),diamond:Math.floor(n/100)});
  }
  assert.equal(f.count(1),200);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM notifications').get().n,4);
  assert.deepEqual(f.db.prepare('SELECT * FROM diamond_market').get(),{id:1,diamonds:12});
  assert.deepEqual(f.db.prepare('SELECT * FROM ruby_market').get(),{id:1,rubies:15});
});

test('existing ratings and first-rating events backfill once without duplicating shared references',t=>{
  const f=fixture(t);
  f.db.exec('INSERT INTO user_diamonds VALUES(1,20,7,4,123456); INSERT INTO user_rubies VALUES(1,12,3,5,2)');
  for(let n=1;n<=149;n++) {
    f.db.prepare('INSERT INTO user_books VALUES(1,?,4,1)').run(n);
    f.db.prepare("INSERT INTO xp_events VALUES(1,'rate_book',?)").run(String(n));
  }
  f.db.exec("INSERT INTO user_series VALUES(1,1,5,1); INSERT INTO xp_events VALUES(1,'rate_series','1')");
  initializeVoteGems(f.db); assert.equal(f.count(1),150); assert.deepEqual(f.wallet(1),{ruby:22,diamond:13});
  initializeVoteGems(f.db); assert.deepEqual(f.wallet(1),{ruby:22,diamond:13});
  assert.deepEqual(f.db.prepare('SELECT diamonds_spent,diamonds_bought,dig_progress FROM user_diamonds WHERE user_id=1').get(),
    {diamonds_spent:7,diamonds_bought:4,dig_progress:123456});
  assert.deepEqual(f.db.prepare('SELECT rubies_spent,rubies_bought,rubies_collectibles FROM user_rubies WHERE user_id=1').get(),
    {rubies_spent:3,rubies_bought:5,rubies_collectibles:2});
});

test('re-rating, clearing, re-adding library entries and XP ledger cleanup cannot farm milestones',t=>{
  const f=fixture(t); initializeVoteGems(f.db);
  for(let n=1;n<=50;n++) awardRatingVote(f.db,1,'book',n);
  for(let n=1;n<=50;n++) awardRatingVote(f.db,1,'book',n);
  f.db.exec('DELETE FROM user_books; DELETE FROM xp_events'); initializeVoteGems(f.db);
  for(let n=1;n<=50;n++) awardRatingVote(f.db,1,'book',n);
  assert.equal(f.count(1),50); assert.deepEqual(f.wallet(1),{ruby:1,diamond:0});
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM notifications').get().n,1);
});

test('players and book/series identifiers remain separate',t=>{
  const f=fixture(t); initializeVoteGems(f.db);
  for(let n=1;n<=49;n++) awardRatingVote(f.db,1,'book',n);
  awardRatingVote(f.db,2,'book',1); awardRatingVote(f.db,1,'series',1);
  assert.equal(f.count(1),50); assert.equal(f.count(2),1);
  assert.deepEqual(f.wallet(1),{ruby:1,diamond:0}); assert.deepEqual(f.wallet(2),{ruby:0,diamond:0});
  f.db.exec('DELETE FROM users WHERE id=1'); assert.equal(f.count(1),0);
});

test('failed gain notices roll back vote counters, permanent reference and wallet together',t=>{
  const f=fixture(t); initializeVoteGems(f.db);
  for(let n=1;n<=49;n++) awardRatingVote(f.db,1,'book',n);
  f.db.exec("CREATE TRIGGER fail_notice BEFORE INSERT ON notifications BEGIN SELECT RAISE(ABORT,'notice failed'); END");
  assert.throws(()=>awardRatingVote(f.db,1,'book',50),/notice failed/);
  assert.equal(f.count(1),49); assert.deepEqual(f.wallet(1),{ruby:0,diamond:0});
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM vote_gem_votes WHERE ref='50'").get().n,0);
  f.db.exec('DROP TRIGGER fail_notice'); awardRatingVote(f.db,1,'book',50);
  assert.deepEqual(f.wallet(1),{ruby:1,diamond:0});
});

test('impersonated votes do not create rewards or permanent credit entries',t=>{
  const f=fixture(t); initializeVoteGems(f.db);
  runInImpersonationContext(true,()=>awardRatingVote(f.db,1,'book',1));
  assert.equal(f.count(1),0); initializeVoteGems(f.db); assert.equal(f.count(1),0);
  awardRatingVote(f.db,1,'book',1); assert.equal(f.count(1),1);
});

test('actual book and series setters count valid votes, report gems, and roll back failed rating writes',t=>{
  const f=fixture(t); initializeVoteGems(f.db); const reports=[];
  for(let n=1;n<=49;n++) awardRatingVote(f.db,1,'book',n);
  f.db.exec('INSERT INTO user_books VALUES(1,50,NULL,NULL); INSERT INTO user_series VALUES(1,1,NULL,NULL)');
  const src=fs.readFileSync(require.resolve('../server/db/books'),'utf8');
  const book=src.slice(src.indexOf('function setBookRating('),src.indexOf('\nfunction _getAggregateSeriesRating('));
  const series=src.slice(src.indexOf('function setSeriesRating('),src.indexOf('\nmodule.exports ='));
  const ctx=vm.createContext({db:f.db,VALID_RATINGS:new Set([4,5]),_getUserBookId:()=>50,
    canUserRateBook:()=>true,canUserRateSeries:()=>true,_getAggregateRating:()=>({}),_getAggregateSeriesRating:()=>({}),
    awardRatingVote,reportGemReward:(id,gems)=>reports.push({id,...gems}),awardXp:()=>false});
  vm.runInContext(book+'\n'+series,ctx);
  assert.equal(ctx.setBookRating(1,50,4).gems.diamondDelta,1); assert.equal(f.count(1),50);
  ctx.setBookRating(1,50,null); ctx.setBookRating(1,50,5); assert.equal(f.count(1),50);
  ctx.setSeriesRating(1,1,4); assert.equal(f.count(1),51);
  assert.equal(reports.filter(x=>x.diamondDelta).length,1);
  assert.equal(ctx.setBookRating(1,50,9),null); assert.equal(f.count(1),51);
  f.db.exec("CREATE TRIGGER reject_vote BEFORE INSERT ON vote_gem_votes WHEN NEW.ref='2' BEGIN SELECT RAISE(ABORT,'bad vote');END; INSERT INTO user_series VALUES(1,2,NULL,NULL)");
  assert.throws(()=>ctx.setSeriesRating(1,2,4),/bad vote/);
  assert.equal(f.db.prepare('SELECT rating FROM user_series WHERE series_id=2').get().rating,null);
});
