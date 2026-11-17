'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Database=require('better-sqlite3');
const {initializeRubies,rubyInfoForUser}=require('../server/db/rubies');
const {initializeGemNotifications}=require('../server/db/gem-notifications');
const {initializeNotificationPolicy}=require('../server/db/notification-policy');
const {initializeCollectibles,createCollectibles,nextAnniversary}=require('../server/db/collectibles');
const {runInImpersonationContext}=require('../server/impersonation-context');
function fixture(t){
 const db=new Database(':memory:');t.after(()=>db.close());db.pragma('foreign_keys=ON');
 db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,is_admin INTEGER DEFAULT 0,ui_prefs TEXT);
 INSERT INTO users(id,is_admin)VALUES(1,0),(2,0),(3,1);
 CREATE TABLE user_diamonds(user_id INTEGER PRIMARY KEY,diamonds_earned INTEGER DEFAULT 0,diamonds_bought INTEGER DEFAULT 0,diamonds_spent INTEGER DEFAULT 0);
 CREATE TABLE notifications(id INTEGER PRIMARY KEY,user_id INTEGER,type TEXT,payload TEXT);`);
 initializeRubies(db);initializeCollectibles(db);initializeGemNotifications(db);initializeNotificationPolicy(db);
 let timestamp=Date.parse('2026-10-31T14:30:42Z');
 const store=createCollectibles(db,{now:()=>timestamp});
 return{db,store,time:value=>{timestamp=Date.parse(value);},wallet:id=>rubyInfoForUser(db,id)};
}
test('only the visible season can be discovered; previews belong to admins',t=>{
 const {db,store}=fixture(t);
 for(const id of ['pumpkin','mummy','zombie'])assert.equal(store.discover(1,id),true);
 for(const id of ['star','constructor','__proto__','missing'])assert.equal(store.discover(1,id),false);
 db.prepare('UPDATE users SET ui_prefs=? WHERE id IN(2,3)').run(JSON.stringify({seasonPreview:'christmas'}));
 assert.equal(store.discover(2,'santa'),false);assert.equal(store.discover(3,'santa'),true);
 assert.equal(store.discover(3,'pumpkin'),true);
 assert.equal(store.discover(99,'pumpkin'),false);
 assert.deepEqual(store.list(2),[]);assert.deepEqual(store.list(3),['pumpkin','santa']);
 assert.equal(store.discover(1,'pumpkin'),false);assert.equal(store.list(1).length,3);
 assert.equal(store.collectedAt(1).pumpkin,Date.parse('2026-10-31T14:30:42Z'));
});
test('one blue diamond per collected item, independent rolling anniversaries and silent gains',t=>{
 const {db,store,time,wallet}=fixture(t);
 assert.equal(store.claim(1,'pumpkin'),false);
 store.discover(1,'pumpkin');store.discover(1,'mummy');
 assert.equal(store.claim(1,'pumpkin'),true);
 for(let i=0;i<12;i++)assert.equal(store.claim(1,'pumpkin'),false);
 assert.equal(store.claim(2,'pumpkin'),false);
 assert.equal(wallet(1).rubiesBalance,1);assert.equal(wallet(1).rubiesCollectibleEarned,1);
 time('2027-01-01T00:00:00Z');assert.equal(store.claim(1,'pumpkin'),false);
 assert.equal(store.claim(1,'mummy'),true);
 time('2027-10-31T14:30:41.999Z');assert.equal(store.claim(1,'pumpkin'),false);
 time('2027-10-31T14:30:42Z');assert.equal(store.claim(1,'pumpkin'),true);
 assert.equal(wallet(1).rubiesBalance,3);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM notifications').get().n,0);
 assert.equal(db.prepare('SELECT SUM(claims) AS n FROM user_collectibles').get().n,3);
 assert.equal(db.prepare('SELECT completions FROM ruby_market').get().completions,0);
});
test('anniversaries retain UTC time and clamp leap day; no impersonation mutations',t=>{
 assert.equal(new Date(nextAnniversary(Date.parse('2024-02-29T13:59:01.123Z'))).toISOString(),'2025-02-28T13:59:01.123Z');
 const {store,wallet}=fixture(t);store.discover(1,'pumpkin');
 runInImpersonationContext(true,()=>{assert.equal(store.claim(1,'pumpkin'),false);assert.equal(store.discover(1,'mummy'),false);});
 assert.equal(wallet(1).rubiesBalance,0);assert.deepEqual(store.list(1),['pumpkin']);
});
test('wallet failure rolls the claim back and account deletion cascades',t=>{
 const {db,store,wallet}=fixture(t);store.discover(1,'pumpkin');
 db.exec("CREATE TRIGGER fail_wallet BEFORE INSERT ON user_rubies BEGIN SELECT RAISE(ABORT,'test');END;");
 assert.throws(()=>store.claim(1,'pumpkin'),/test/);
 assert.equal(db.prepare('SELECT claims FROM user_collectibles').get().claims,0);
 db.exec('DROP TRIGGER fail_wallet');assert.equal(store.claim(1,'pumpkin'),true);
 db.prepare('DELETE FROM users WHERE id=1').run();assert.deepEqual(store.list(1),[]);
 assert.equal(wallet(1).rubiesBalance,undefined);
});

test('all nine new companions register during their live event and remain account scoped',t=>{
 const {store,time}=fixture(t);
 const groups=[['2026-11-26T12:00:00Z',['turkey','acorn','harvest-pie']],['2026-12-06T12:00:00Z',['nicholas','ribbon-gift','treat-boot']],['2026-12-13T12:00:00Z',['lucia-candle','saffron-bun','candle-crown']]];
 for(const [date,items] of groups){time(date);for(const item of items)assert.equal(store.discover(1,item),true);assert.equal(store.discover(1,'pumpkin'),false);}
 assert.equal(store.list(1).length,9);assert.deepEqual(store.list(2),[]);
});

test('one copy per annual occurrence, with an independent per-type diamond anniversary',t=>{
 const {db,store,time,wallet}=fixture(t);
 assert.equal(store.discover(1,'pumpkin'),true);
 assert.equal(store.claim(1,'pumpkin'),true);
 time('2026-11-03T12:00:00Z');
 for(let i=0;i<10;i++)assert.equal(store.discover(1,'pumpkin'),false);
 assert.equal(store.quantities(1).pumpkin,1);
 time('2027-10-31T12:00:00Z');
 assert.equal(store.discover(1,'pumpkin'),true);
 assert.equal(store.quantities(1).pumpkin,2);
 assert.equal(store.collectedAt(1).pumpkin,Date.parse('2027-10-31T12:00:00Z'));
 assert.equal(store.claim(1,'pumpkin'),false,'another copy does not reset the diamond cooldown');
 assert.equal(wallet(1).rubiesBalance,1,'acquiring a copy awards no diamond');
 time('2027-10-31T14:30:42Z');
 assert.equal(store.claim(1,'pumpkin'),true);
 assert.equal(store.claim(1,'pumpkin'),false,'copies cannot each award a diamond');
 assert.equal(wallet(1).rubiesBalance,2);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM user_collectible_occurrences').get().n,2);
 assert.deepEqual(store.list(1),['pumpkin'],'the list remains grouped by companion type');
});

test('separate Friday the 13th occurrences each add a copy within the same year',t=>{
 const {store,time,wallet}=fixture(t);
 for(const [i,date]of ['2026-02-12T12:00:00Z','2026-03-12T12:00:00Z','2026-11-12T12:00:00Z'].entries()){
  time(date);
  assert.equal(store.discover(1,'black-cat'),true);
  assert.equal(store.discover(1,'black-cat'),false);
  assert.equal(store.quantities(1)['black-cat'],i+1);
  assert.equal(store.claim(1,'black-cat'),i===0);
 }
 assert.equal(wallet(1).rubiesBalance,1);
 assert.deepEqual(store.quantities(2),{});
});

test('an event spanning December and January remains one occurrence',t=>{
 const {store,time}=fixture(t);
 time('2026-12-30T12:00:00Z');assert.equal(store.discover(1,'star'),true);
 time('2027-01-03T12:00:00Z');assert.equal(store.discover(1,'star'),false);
 time('2027-12-30T12:00:00Z');assert.equal(store.discover(1,'star'),true);
 assert.equal(store.quantities(1).star,2);
});

test('legacy collections migrate once without changing previous claims or granting another current-event copy',t=>{
 const db=new Database(':memory:');t.after(()=>db.close());db.pragma('foreign_keys=ON');
 db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,is_admin INTEGER DEFAULT 0);
 INSERT INTO users VALUES(1,0);
 CREATE TABLE user_collectibles(user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 item_id TEXT NOT NULL,seen_at INTEGER NOT NULL,claimed_at INTEGER,claims INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(user_id,item_id));`);
 const timestamp=Date.parse('2026-10-31T14:30:42Z');
 db.prepare('INSERT INTO user_collectibles VALUES(1,?,?,?,4)').run('pumpkin',timestamp,timestamp);
 initializeRubies(db);initializeCollectibles(db);initializeCollectibles(db);
 const store=createCollectibles(db,{now:()=>timestamp});
 assert.equal(store.quantities(1).pumpkin,1);
 assert.equal(store.discover(1,'pumpkin'),false);
 assert.equal(store.claim(1,'pumpkin'),false);
 assert.deepEqual(db.prepare('SELECT claimed_at,claims FROM user_collectibles').get(),{claimed_at:timestamp,claims:4});
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM user_collectible_occurrences').get().n,1);
 assert.equal(rubyInfoForUser(db,1).rubiesBalance,0);
 db.prepare('DELETE FROM users WHERE id=1').run();
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM user_collectible_occurrences').get().n,0);
});

test('an acquisition failure rolls back its occurrence and quantity together',t=>{
 const {db,store}=fixture(t);
 db.exec("CREATE TRIGGER fail_quantity BEFORE UPDATE OF quantity ON user_collectibles BEGIN SELECT RAISE(ABORT,'quantity failure');END;");
 assert.throws(()=>store.discover(1,'pumpkin'),/quantity failure/);
 assert.deepEqual(store.list(1),[]);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM user_collectible_occurrences').get().n,0);
 db.exec('DROP TRIGGER fail_quantity');
 assert.equal(store.discover(1,'pumpkin'),true);
 assert.equal(store.quantities(1).pumpkin,1);
 assert.equal(store.isAdmin(1),false);assert.equal(store.isAdmin(3),true);
});
