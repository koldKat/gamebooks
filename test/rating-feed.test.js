'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Database = require('better-sqlite3');

test('rating changes and clear/re-rate cycles retain the first feed date and respect privacy', t => {
  const db = new Database(':memory:');
  t.after(() => db.close());
  db.exec(`CREATE TABLE users(id,username,public_profile,avatar_path,hide_from_feed,xp,
    is_author,is_contributor,is_moderator,is_squire,display_name);
    CREATE TABLE books(id,name,is_container,is_public,cover_path,series_id,series_number,parent_book_id);
    CREATE TABLE series(id,name,is_public);
    CREATE TABLE user_books(user_id,book_id,rating,rated_at);
    CREATE TABLE user_series(user_id,series_id,rating,rated_at);
    CREATE TABLE xp_events(user_id,event,ref,created_at);
    INSERT INTO users VALUES(17,'sashii',1,NULL,0,0,0,0,0,1,NULL);
    INSERT INTO books VALUES(868,'Book',0,1,NULL,NULL,NULL,NULL),
      (869,'Anthology',1,1,NULL,NULL,NULL,NULL);
    INSERT INTO series VALUES(1,'Series',1);`);
  const now = Math.floor(Date.now() / 1000), old = now - 90 * 86400;
  for (const id of [868,869]) {
    db.prepare('INSERT INTO user_books VALUES(17,?,4.5,?)').run(id,now);
    db.prepare("INSERT INTO xp_events VALUES(17,'rate_book',?,?)").run(String(id),old);
  }
  db.prepare('INSERT INTO user_series VALUES(17,1,4,?)').run(now);
  db.prepare("INSERT INTO xp_events VALUES(17,'rate_series','1',?)").run(old);
  const context = {module:{exports:{}},require(name) {
    return {'./connection':{db:{prepare(sql) {
      return sql.includes("WHERE xe.event = 'rate_") ? db.prepare(sql) : {all:()=>[],get:()=>undefined};
    }}},'./xp':{computeLevel:()=>0,getTitleForLevel:()=>''},
    './job-xp':{},'./content':{},'./books':{}}[name];
  }};
  vm.runInNewContext(fs.readFileSync(require.resolve('../server/db/feed'),'utf8'),context);
  const feed = () => context.module.exports.getFeed();
  assert.equal(feed().length,0,'recent re-ratings cannot revive events older than 30 days');
  db.prepare('UPDATE xp_events SET created_at=?').run(now - 86400);
  let entries = feed();
  assert.equal(entries.length,3);
  assert.ok(entries.every(e => e.completedAt === (now - 86400) * 1000 && e.isSquire));
  assert.equal(entries.filter(e => e.isContainer).length,1);
  assert.equal(entries.filter(e => e.type === 'series_rated').length,1);
  assert.equal(db.prepare('SELECT count(*) n FROM xp_events').get().n,3);
  db.exec('UPDATE users SET hide_from_feed=1');
  assert.equal(feed().length,0);
  db.exec('UPDATE users SET hide_from_feed=0; UPDATE books SET is_public=0; UPDATE series SET is_public=0');
  assert.equal(feed().length,0);
  db.exec('UPDATE books SET is_public=1; UPDATE series SET is_public=1; UPDATE user_books SET rating=NULL; UPDATE user_series SET rating=NULL');
  assert.equal(feed().length,0);
  db.prepare('UPDATE user_books SET rating=4, rated_at=?').run(now);
  db.prepare('UPDATE user_series SET rating=4, rated_at=?').run(now);
  entries=feed();
  assert.equal(entries.length,3);
  assert.ok(entries.every(e => e.completedAt === (now - 86400) * 1000),'restored ratings stay at their original position');
  db.prepare('UPDATE xp_events SET created_at=?').run(old);
  assert.equal(feed().length,0,'restored old ratings remain outside the feed window');
  // The first award date also supports legacy ratings without a timestamp.
  db.exec('UPDATE user_books SET rated_at=NULL; UPDATE user_series SET rated_at=NULL');
  db.prepare('UPDATE xp_events SET created_at=?').run(now);
  assert.equal(feed().length,3);
});
