'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { getSimulatorBattleStats } = require('../server/db/gameplay-stats');

test('profile simulator counts use only the player permanent ledger and survive library removal', t => {
  const db = new Database(':memory:');
  t.after(() => db.close());
  db.exec(`CREATE TABLE sim_battle_gem_battles(user_id,ref,outcome,PRIMARY KEY(user_id,ref));
    CREATE TABLE user_books(user_id,state_data);
    CREATE TABLE xp_events(user_id,event);
    INSERT INTO sim_battle_gem_battles VALUES(1,'a','win'),(1,'b','loss'),(1,'c',NULL),(2,'a','win');
    INSERT INTO user_books VALUES(1,'{"playthroughs":[{"result":"battle"}]}');
    INSERT INTO xp_events VALUES(1,'win_run'),(1,'battle_run');`);
  const expected = { simBattlesFought: 3, simBattlesWon: 1, simBattlesLost: 1 };
  assert.deepEqual(getSimulatorBattleStats(db, 1), expected);
  assert.deepEqual(getSimulatorBattleStats(db, 2), { simBattlesFought: 1, simBattlesWon: 1, simBattlesLost: 0 });
  assert.deepEqual(getSimulatorBattleStats(db, 3), { simBattlesFought: 0, simBattlesWon: 0, simBattlesLost: 0 });
  db.exec('DELETE FROM user_books');
  assert.deepEqual(getSimulatorBattleStats(db, 1), expected);
});
