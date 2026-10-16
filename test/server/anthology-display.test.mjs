import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import Database from 'better-sqlite3';

const source = readFileSync(new URL('../../server/db/feed.js', import.meta.url), 'utf8');

function fixture(parentPublic = 1, own = false) {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE books(id INTEGER PRIMARY KEY,name,description,authors,cover_path,total_sections,max_section_number,isbn,issn,asin,pages,is_container,is_public,created_by,parent_book_id,book_order,has_battle_sim,has_live_reading,series_number,series_id);
    CREATE TABLE series(id INTEGER PRIMARY KEY,name,is_public);
    CREATE TABLE user_books(book_id,user_id,state_data);
    CREATE TABLE users(id INTEGER PRIMARY KEY,username,avatar_path,public_profile);
    CREATE TABLE book_anthology_memberships(book_id,anthology_id);`);
  db.prepare('INSERT INTO books(id,name,description,cover_path,is_container,is_public) VALUES(7,?,?,?,1,?)').run('Anthology','Parent description','parent.jpg',parentPublic);
  db.prepare('INSERT INTO books(id,name,parent_book_id,is_container,is_public,total_sections,description,cover_path) VALUES(42,?,7,0,1,200,?,?)').run('Child',own ? 'Child description' : null,own ? 'child.jpg' : null);
  const context = {db, _getAggregateRating: () => ({avgRating:null,voteCount:0}), _getAuthorRatings: () => [], getAnthologyExtraMembers: () => []};
  runInNewContext(source.slice(source.indexOf('function getPublicBookMeta('), source.indexOf('function getAllPublicBooks(')), context);
  runInNewContext(source.slice(source.indexOf('function getBookActivity('), source.indexOf('// Use the single-graph viewer')), context);
  return {db, context};
}

test('public anthology metadata is a fallback, never a substitute for child-specific fields', () => {
  for (const own of [false,true]) {
    const {db,context} = fixture(1,own);
    try {
      const meta = context.getPublicBookMeta(42), activity = context.getBookActivity(42).book;
      assert.equal(meta.coverUrl,own ? '/covers/child.jpg' : '/covers/parent.jpg');
      assert.equal(meta.description,own ? 'Child description' : 'Parent description');
      assert.equal(activity.coverUrl,own ? '/covers/child.jpg' : null);
      assert.equal(activity.description,own ? 'Child description' : null);
      assert.equal(activity.parentCoverUrl,'/covers/parent.jpg');
      assert.equal(activity.parentDescription,'Parent description');
    } finally {db.close();}
  }
});

test('private anthology metadata does not leak through its public child', () => {
  const {db,context} = fixture(0);
  try {
    const meta=context.getPublicBookMeta(42),activity=context.getBookActivity(42).book;
    assert.equal(meta.coverUrl,null);assert.equal(meta.description,null);
    assert.equal(activity.parentCoverUrl,null);assert.equal(activity.parentDescription,null);assert.equal(activity.parentId,null);
  } finally {db.close();}
});
