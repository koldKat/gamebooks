import test from 'node:test';
import assert from 'node:assert/strict';
import {loadFixtureRoster} from './roster-fixtures.mjs';
import {DEITY_WEAPONS} from '../../../public/js/battlesim/books/208/definition.js';
import {createCombat} from '../../../public/js/battlesim/books/208/combat.js';

await loadFixtureRoster(208);

for (let index = 0; index < 6; index++) {
  test('loaded Deity weapon ' + index + ' retains damage and armour test', () => {
    const state = {rolled: true, skill: 0, stamina: 20, staminaInitial: 20,
      armour: 0, roundsThisBattle: 0, deityMode: true, enemy: {name: 'Deity', skill: 8, stamina: 12}};
    const rolls = [12, 2, 12];
    const context = {DEITY_WEAPONS, _data: () => state, _notReady: () => false,
      _appendLog() {}, _recordOutcome() {}, _checkBattleEnd() {}, _renderAll() {}, saveState() {},
      t: key => key, escapeHtml: value => value, _roll1d6: () => 4};
    Object.assign(context, createCombat(() => context));
    context._roll1d6 = () => 4;
    context._roll2d6 = () => {assert.ok(rolls.length); return rolls.shift();};
    const random = Math.random;
    try {
      Math.random = () => (index + 0.1) / 6;
      context._runGunfireRound();
      assert.equal(state.stamina, [17, 18, 19, 18, 16, 0][index]);
      assert.equal(rolls.length, 0, 'enemy hit uses the armour test');
      assert.equal(state.enemy.stamina, 12, 'missed player shot leaves enemy intact');
    } finally {Math.random = random;}
  });
}
