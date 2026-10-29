'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { getRatingStats, getPlayerRatingStats } = require('../server/db/rating-stats');

test('player rating count and average combine books, anthology children, anthologies and series without other players or cleared votes', () => {
  const db = new Database(':memory:');
  try {
    db.exec(`CREATE TABLE user_books (user_id INTEGER, book_id INTEGER, rating REAL);
      CREATE TABLE user_series (user_id INTEGER, series_id INTEGER, rating REAL);
      INSERT INTO user_books VALUES (1,10,5),(1,11,3.5),(1,12,1),(1,13,NULL),(2,10,0.5);
      INSERT INTO user_series VALUES (1,20,4.5),(1,21,NULL),(2,20,1);`);
    assert.deepEqual(getPlayerRatingStats(db, 1), { ratingsGiven: 4, averageRating: 3.5 });
    assert.deepEqual(getPlayerRatingStats(db, 2), { ratingsGiven: 2, averageRating: 0.75 });
    assert.deepEqual(getPlayerRatingStats(db, 3), { ratingsGiven: 0, averageRating: null });
    db.exec('UPDATE user_books SET rating=NULL WHERE user_id=1 AND book_id=10');
    assert.deepEqual(getPlayerRatingStats(db, 1), { ratingsGiven: 3, averageRating: 3 });
  } finally { db.close(); }
});

test('rating breakdowns retain half stars and agree with all category totals', () => {
  const db = new Database(':memory:');
  try {
    db.exec(`CREATE TABLE books (id INTEGER PRIMARY KEY, is_container INTEGER, parent_book_id INTEGER);
      CREATE TABLE user_books (book_id INTEGER, rating REAL);
      CREATE TABLE user_series (rating REAL);
      INSERT INTO books VALUES (1,0,NULL),(2,0,3),(3,1,NULL),(4,1,3);
      INSERT INTO user_books VALUES (1,4.5),(1,5),(2,0.5),(3,3.5),(4,1),(1,NULL);
      INSERT INTO user_series VALUES (2),(2.5),(NULL);`);
    const s = getRatingStats(db);
    assert.equal(s.ratingsTotal, 6);
    assert.equal(s.bookRatingsCount, 3, 'individual anthology children are still books');
    assert.equal(s.anthologyRatingsCount, 1, 'nested containers are not counted as root anthologies');
    assert.equal(s.seriesRatingsCount, 2);
    assert.equal(s.bookRatingsAvg, 10 / 3);
    assert.equal(s.anthologyRatingsAvg, 3.5);
    assert.equal(s.seriesRatingsAvg, 2.25);
    for (const group of Object.values(s.ratingBreakdown)) {
      assert.equal(group.distribution.length, 10);
      assert.equal(group.distribution.reduce((sum, row) => sum + row.n, 0), group.count);
    }
    assert.equal(s.ratingBreakdown.books.distribution.find(row => row.star === 4.5).n, 1);
    assert.equal(s.ratingDist.reduce((sum, row) => sum + row.n, 0), s.ratingsTotal);
    assert.equal(s.ratingDist.find(row => row.star === 2.5).n, 1, 'series votes appear in the aggregate');
    db.exec('DELETE FROM user_books; DELETE FROM user_series;');
    const empty = getRatingStats(db);
    assert.equal(empty.ratingsTotal, 0);
    assert.equal(empty.bookRatingsAvg, null);
    assert.ok(empty.ratingDist.every(row => row.n === 0));
  } finally {
    db.close();
  }
});
