'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Database = require('better-sqlite3');

function setup() {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, pending_bonus_gc INTEGER DEFAULT 0,
    bonus_gc_generated INTEGER DEFAULT 0, bonus_coins INTEGER DEFAULT 0);
    INSERT INTO users(id) VALUES (1);`);
  let random = 0;
  const math = Object.create(Math); math.random = () => random;
  const context = vm.createContext({ db, Math: math, isImpersonatingContext: () => false,
    awardCoins: (id, event, ref, amount) => {
      assert.equal(event, 'bonus_gc_claim');
      db.prepare('UPDATE users SET bonus_coins = bonus_coins + ? WHERE id = ?').run(amount, id);
    },
  });
  const source = fs.readFileSync(require.resolve('../server/db/xp'), 'utf8');
  vm.runInContext(source.slice(source.indexOf('function computeLevel('), source.indexOf('// Dynamic level cap')), context);
  vm.runInContext(source.slice(source.indexOf('function _rollBonusGc('), source.indexOf('const _awardXpTx')), context);
  return { db, context, random: value => { random = value; }, row: () => db.prepare('SELECT * FROM users WHERE id = 1').get() };
}

test('lucky coins generate, wait for a claim, and can generate again after claiming', t => {
  const h = setup(); t.after(() => h.db.close());
  h.context._rollBonusGc(1, 465000, 0, 0); // Level 30, forced successful roll.
  assert.equal(h.row().pending_bonus_gc, 1); assert.equal(h.row().bonus_gc_generated, 1);
  h.context._rollBonusGc(1, 465000, h.row().pending_bonus_gc, 0);
  assert.equal(h.row().bonus_gc_generated, 1, 'only one coin can wait at a time');
  assert.equal(h.context.claimBonusGc(1).ok, true);
  assert.equal(h.row().pending_bonus_gc, 0); assert.equal(h.row().bonus_coins, 1);
  assert.equal(h.context.claimBonusGc(1).error, 'nothing_to_claim');
  assert.equal(h.row().bonus_coins, 1, 'repeated claim cannot award another coin');
  h.context._rollBonusGc(1, 465000, h.row().pending_bonus_gc, 0);
  assert.equal(h.row().pending_bonus_gc, 1); assert.equal(h.row().bonus_gc_generated, 2);
});

test('lucky coin rolls use level and purchased chance, capped at the level', t => {
  const h = setup(); t.after(() => h.db.close());
  h.random(0.004);
  h.context._rollBonusGc(1, 465000, 0, 0);
  assert.equal(h.row().pending_bonus_gc, 0, '0.4% roll misses a level-30 base chance of 0.3%');
  h.context._rollBonusGc(1, 465000, 0, 30);
  assert.equal(h.row().pending_bonus_gc, 1, 'purchased chance raises the chance to 0.6%');
  h.db.prepare('UPDATE users SET pending_bonus_gc = 0 WHERE id = 1').run();
  h.random(0.007);
  h.context._rollBonusGc(1, 465000, 0, 1000);
  assert.equal(h.row().pending_bonus_gc, 0, 'excess purchases cannot raise chance beyond the cap');
});
