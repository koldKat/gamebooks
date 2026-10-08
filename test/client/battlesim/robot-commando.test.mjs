import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../../public/js/battlesim/battlesim734.js', import.meta.url), 'utf8');
const combat = source.slice(source.indexOf('function _notReady('), source.indexOf('// ── Render'));
const battle = version => ({
  ...(version ? { combatRulesVersion: version } : {}), mode: 'robot', rolled: true,
  player: { skill: 10, stamina: 20, staminaInitial: 20, armour: 20, armourInitial: 20, luck: 12, robotCombatBonus: 0, robotSpeed: 1, attackModifier: 0, winAfterHits: 0, enemyWoundDamage: 2, hitsLandedThisFight: 0 },
  enemy: { name: 'First', skill: 1, life: 2, lifeMax: 2, speed: 1 },
  pairedFight: true, sideEnemy: { name: 'Second', skill: 1, lifeMax: 4, speed: 1 },
  pendingLuckQueue: [], roundsThisBattle: 0, log: [], history: [],
});
function controls(data, rolls = []) {
  return new Function('_data', 'escapeHtml', 't', 'saveState', '_renderAll', 'SIDE_WOUND_DMG', 'SVG_SKULL', 'SVG_TROPHY', 'rolls', `${combat};_roll2d6=()=>{const roll=rolls.shift();if(roll===undefined)throw new Error('Missing roll');return roll;};return {round:_runRound,luck:_testLuck,skip:_skipLuck,switchTarget:_switchTarget};`)(
    () => data, value => value, key => key, () => {}, () => {}, 2, '', '', rolls,
  );
}
test('new paired fights continue against the surviving enemy', () => {
  const data = battle(2);
  const api = controls(data, [12, 2, 12, 2, 12, 2, 12, 2]);
  api.round();
  assert.equal(data.enemy.name, 'Second');
  assert.equal(data.enemy.life, 4);
  assert.equal(data.pairedFight, false);
  assert.equal(data.history.length, 0);
  api.round();
  api.skip();
  api.round();
  assert.equal(data.battleOutcome, 'win');
  assert.deepEqual(data.history.map(h => h.outcome), ['win']);
  const saved = structuredClone(data);
  api.round();
  assert.deepEqual(data, saved);
});
test('saved legacy paired fights retain their existing outcome behavior', () => {
  const data = battle();
  controls(data, [12, 2, 12, 2]).round();
  assert.equal(data.enemy.name, 'First');
  assert.equal(data.history[0].outcome, 'win');
  assert.equal(data.combatRulesVersion, undefined);
});
test('new paired fights apply the second enemy speed independently', () => {
  const data = battle(2);
  data.enemy.life = 10;
  data.sideEnemy.skill = 10;
  data.sideEnemy.speed = 3;
  controls(data, [7, 7, 7, 7]).round();
  assert.equal(data.player.armour, 18);
});
test('new paired fights cannot win when the second attacker kills the player', () => {
  const data = battle(2);
  data.player.armour = 2;
  data.sideEnemy.skill = 30;
  controls(data, [12, 2, 2, 12]).round();
  assert.equal(data.battleOutcome, 'loss');
  assert.deepEqual(data.history.map(h => h.outcome), ['loss']);
});
test('new fights defer target promotion until pending Luck is resolved', () => {
  const data = battle(2);
  data.sideEnemy.skill = 30;
  const api = controls(data, [12, 2, 2, 12]);
  api.round();
  assert.equal(data.enemy.name, 'First');
  assert.equal(data.pendingLuckQueue.length, 1);
  assert.equal(data.history.length, 0);
  api.skip();
  assert.equal(data.enemy.name, 'Second');
});
test('switching targets preserves both enemies remaining life and speed', () => {
  const data = battle(2);
  data.enemy.life = 1;
  data.sideEnemy.life = 3;
  data.sideEnemy.speed = 3;
  const api = controls(data);
  api.switchTarget();
  assert.equal(data.enemy.name, 'Second');
  assert.equal(data.enemy.life, 3);
  assert.equal(data.enemy.speed, 3);
  assert.equal(data.sideEnemy.life, 1);
  api.switchTarget();
  assert.equal(data.enemy.name, 'First');
  assert.equal(data.enemy.life, 1);
});
test('Crusher doubled damage follows the printed 2/4/6 Luck values in new fights only', () => {
  for (const [version,roll,expected] of [[2,2,18],[2,12,14],[undefined,2,17]]) {
    const data = battle(version);
    data.pairedFight = false;
    data.enemy.skill = 30;
    data.player.enemyWoundDamage = 4;
    data.player.luck = 3;
    const api = controls(data, [2,12,roll]);
    api.round();api.luck();
    assert.equal(data.player.armour, expected);
  }
});
test('reading saved state does not upgrade existing combat rules', () => {
  const dataSource = source.slice(source.indexOf('function _data()'), source.indexOf('function _notReady('));
  const saved = { sim734: battle() };
  const old = structuredClone(saved);
  new Function('currentPlaythrough', `${dataSource};return _data();`)(() => saved);
  assert.equal(saved.sim734.combatRulesVersion, undefined);
  assert.deepEqual(saved.sim734.player, old.sim734.player);
  const fresh = {};
  new Function('currentPlaythrough', `${dataSource};return _data();`)(() => fresh);
  assert.equal(fresh.sim734.combatRulesVersion, 2);
});
