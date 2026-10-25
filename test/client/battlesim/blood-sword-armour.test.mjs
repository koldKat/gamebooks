import test from 'node:test';
import assert from 'node:assert/strict';
import {loadFixtureRoster} from './roster-fixtures.mjs';

for (const id of [397, 398]) {
  await loadFixtureRoster(id);
  const {PRINTED_ENEMY_ARMOUR} = await import(`../../../public/js/battlesim/books/${id}/definition.js`);
  const {createCombat} = await import(`../../../public/js/battlesim/books/${id}/combat.js`);
  test(id + ' loaded armour preserves selection and reduces actual attack damage', () => {
    const state = {player: {fp: 20, dmgDice: 1, dmgBonus: 0}, enemy: {}, history: [{outcome: 'win'}]};
    const context = {PRINTED_ENEMY_ARMOUR, _data: () => state, _renderAll() {}, saveState() {},
      _appendLog() {}, _battleOver: () => false, _enemyNameSafe: () => state.enemy.name,
      t: key => key, escapeHtml: value => value};
    Object.assign(context, createCombat(() => context));
    Object.assign(context, {_roll2d6: () => 2, _rollNd6: () => 10,
      _applyEnemyDefeat: () => false, _enemyStrike() {}, _applyPlayerFall() {}});
    for (const [name, attack, hp, pb, defense, armour] of PRINTED_ENEMY_ARMOUR) {
      context._selectEnemy({name, attack, hp, pb, defense});
      assert.deepEqual(state.enemy, {name, fp: attack, endurance: hp, enduranceMax: hp,
        dmgDice: pb, dmgBonus: defense, armor: armour});
      context._attack();
      assert.equal(state.enemy.endurance, Math.max(0, hp - Math.max(0, 10 - armour)));
      assert.equal(state.history.length, 1);
    }
    const [name, attack, hp, pb, defense] = PRINTED_ENEMY_ARMOUR[0];
    context._selectEnemy({name, attack: attack + 1, hp, pb, defense});
    assert.equal(state.enemy.armor, 0, 'supplement requires an exact legacy match');
  });
}
