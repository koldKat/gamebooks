'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { seasonalContributionEligible } = require('../server/db/seasonal-contributions');

function catalog(t) {
  const db=new Database(':memory:');t.after(()=>db.close());
  db.exec(`CREATE TABLE series(id INTEGER PRIMARY KEY,is_public INTEGER);
    CREATE TABLE books(id INTEGER PRIMARY KEY,is_public INTEGER,series_id INTEGER,parent_book_id INTEGER);
    INSERT INTO series VALUES(1,1),(2,0);
    INSERT INTO books VALUES(1,1,1,3),(2,0,2,4),(3,1,NULL,NULL),(4,0,NULL,NULL),(5,1,2,4);`);
  return db;
}

test('all catalog contributions resolve the correct item and require its public visibility',t=>{
  const db=catalog(t);
  for(const event of ['add_book','add_isbn','add_issn','add_asin','add_pages','add_authors',
    'add_description','make_book_public','upload_cover','book_added_by_other']) {
    assert.equal(seasonalContributionEligible(db,event,'1'),true,event);
    assert.equal(seasonalContributionEligible(db,event,'2'),false,event);
    assert.equal(seasonalContributionEligible(db,event,'999'),false,event);
  }
  for(const event of ['create_series','add_series_description','make_series_public','series_open_world','series_added_by_other']) {
    assert.equal(seasonalContributionEligible(db,event,'1'),true,event);
    assert.equal(seasonalContributionEligible(db,event,'2'),false,event);
  }
  for(const [ref,expected]of [['book:1',true],['book:2',false],['series:1',true],['series:2',false],['1',false]])
    assert.equal(seasonalContributionEligible(db,'favorite_cover',ref),expected,ref);
  assert.equal(seasonalContributionEligible(db,'book_added_by_other','1:999'),true);
  assert.equal(seasonalContributionEligible(db,'series_added_by_other','2:999'),false);
  for(const event of ['add_book_to_series','add_series_number']) {
    assert.equal(seasonalContributionEligible(db,event,'1'),true);
    assert.equal(seasonalContributionEligible(db,event,'5'),false,'private series membership');
  }
  for(const event of ['add_book_to_anthology','add_anthology_order']) {
    assert.equal(seasonalContributionEligible(db,event,'1'),true);
    assert.equal(seasonalContributionEligible(db,event,'1:3'),true);
    assert.equal(seasonalContributionEligible(db,event,'1:4'),false,'private secondary anthology');
    assert.equal(seasonalContributionEligible(db,event,'5'),false);
  }
  assert.equal(seasonalContributionEligible(db,'win_run','2:0'),true,'private reading gameplay unaffected');
  assert.equal(seasonalContributionEligible(db,'future_gameplay_action','unknown'),true);
});

