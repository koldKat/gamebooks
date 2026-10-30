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
