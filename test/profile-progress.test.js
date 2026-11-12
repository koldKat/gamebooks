'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { addBookProgress, collectedCount } = require('../server/db/profile-progress');

test('profile progress counts distinct sections across chart, current and archived runs, including manual visits', () => {
  const totals = { sectionsDiscovered: 0, sectionsVisited: 0, booksWon: 0 };
  const state = {
    graph: {
      1: { choices: [2, 0, -1, 'intro'] },
      2: { discovered: true, choices: [] },
      3: { discovered: true, choices: [4] },
      7: { choices: [] },
      epilogue: { choices: [] },
      opening_note: { choices: [] },
    },
    playthroughs: [{ path: [1, 2, 2, 5], result: 'success' }],
    preSeriesRuns: [{ path: [1, 5], result: 'success' }],
  };
  addBookProgress(totals, state, 'opening_note');
  assert.deepEqual(totals, { sectionsDiscovered: 6, sectionsVisited: 5, booksWon: 1 });
  addBookProgress(totals, { graph: { 1: { discovered: true } } });
  assert.deepEqual(totals, { sectionsDiscovered: 7, sectionsVisited: 5, booksWon: 1 });
});

test('supplemental passages, ending markers and empty histories do not inflate profile progress', () => {
  const totals = { sectionsDiscovered: 0, sectionsVisited: 0, booksWon: 0 };
  addBookProgress(totals, { playthroughs: [{ path: [0, -1, 'intro', 'epilogue', 'sleep', 'bonanza'] }] });
  addBookProgress(totals, null);
  assert.deepEqual(totals, { sectionsDiscovered: 0, sectionsVisited: 0, booksWon: 0 });
});

test('collectible count belongs to the account and is independent of repeat claims', t => {
  const db = new Database(':memory:');
  t.after(() => db.close());
  db.exec(`CREATE TABLE user_collectibles(user_id,item_id,claims,PRIMARY KEY(user_id,item_id));
    INSERT INTO user_collectibles VALUES(1,'pumpkin',4),(1,'mummy',0),(2,'pumpkin',1);`);
  assert.equal(collectedCount(db, 1), 2);
  assert.equal(collectedCount(db, 2), 1);
  assert.equal(collectedCount(db, 3), 0);
});
