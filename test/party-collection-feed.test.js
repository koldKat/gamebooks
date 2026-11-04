'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Database = require('better-sqlite3');

test('party collection discoveries and mapping group together without merging independent achievements', t => {
  const db = new Database(':memory:');
  t.after(() => db.close());
  db.exec(`CREATE TABLE users(id,username,public_profile,avatar_path,hide_from_feed,xp,
      is_author,is_contributor,is_moderator,is_squire,display_name);
    CREATE TABLE books(id,name,is_public,cover_path,series_id,series_number,parent_book_id);
    CREATE TABLE series(id,name,is_public);
    CREATE TABLE user_books(user_id,book_id,party_id);
    CREATE TABLE xp_events(user_id,event,ref,created_at);
    INSERT INTO series VALUES(1,'Series',1),(2,'Unrelated series',1);
    INSERT INTO books VALUES(100,'Final book',1,NULL,1,2,200),(200,'Anthology',1,NULL,NULL,NULL,NULL);`);
  const now = Math.floor(Date.now() / 1000);
  for (const [id, name, party, offset, hidden] of [
    [1,'koldKat',13,0,0], [2,'sashii',13,1,0], [3,'Solo',null,0,0],
    [4,'Other party',14,0,0], [5,'Earlier',13,-120,0], [6,'Hidden',13,0,1],
  ]) {
    db.prepare('INSERT INTO users VALUES(?,?,1,NULL,?,100,0,0,0,0,NULL)').run(id,name,hidden);
    db.prepare('INSERT INTO user_books VALUES(?,100,?)').run(id,party);
    for (const prefix of ['discover','visit']) {
      for (const [event, ref] of [[prefix+'_all','100'],[prefix+'_all_series','1'],[prefix+'_all_anthology','200']]) {
        db.prepare('INSERT INTO xp_events VALUES(?,?,?,?)').run(id,event,ref,now+offset);
      }
    }
  }
  db.prepare("INSERT INTO xp_events VALUES(2,'discover_all_series','2',?)").run(now);
  const deps = {
    './connection': {db:{prepare(sql) {
      if (sql.includes('ub.state_data')) return {all:()=>[],get:()=>undefined};
      return sql.includes("WHERE e.event = 'discover_all'") || sql.includes("WHERE e.event = 'visit_all'")
        || sql.includes('JOIN series s ON s.id = CAST(e.ref AS INTEGER)')
        || (sql.includes('JOIN books b ON b.id = CAST(e.ref AS INTEGER)') && sql.includes('WHERE e.event = ?'))
        ? db.prepare(sql) : {all:()=>[],get:()=>undefined};
    }}},
    './xp': {computeLevel:()=>1,getTitleForLevel:()=>''},
    './job-xp':{}, './content':{}, './books':{}, './rating-stats':{},
  };
  const context = {module:{exports:{}},require:name=>deps[name]};
  vm.runInNewContext(fs.readFileSync(require.resolve('../server/db/feed'),'utf8'),context);
  const entries = context.module.exports.getFeed();
  for (const type of ['discover_all_series','visit_all_series','discover_all_anthology','visit_all_anthology']) {
    const matching = entries.filter(e=>e.type===type && e.seriesId!==2);
    assert.equal(matching.length,4,type);
    const together = matching.find(e=>e.usernames?.length===2);
    assert.ok(together,type+' has combined party names');
    assert.equal(together.partyId,13);
    assert.equal(together.usernames.map(u=>u.username).sort().join(','),'koldKat,sashii');
    assert.equal(matching.filter(e=>!e.usernames).length,3,'solo, other party and earlier completion stay separate');
    assert.ok(matching.every(e=>e.username!=='Hidden'));
  }
  assert.equal(entries.find(e=>e.seriesId===2).usernames,undefined,'unrelated collection stays individual');
});
