import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../../public/js/battlesim/battlesim464.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
function fixture(saved) {
 const pt = saved ? {sim464: structuredClone(saved)} : {}, dice = [];
 const context = vm.createContext({currentPlaythrough: () => pt, saveState: () => {}, escapeHtml: value => value, t: (key, params) => JSON.stringify({key, params}), Math: Object.assign(Object.create(Math), {random: () => {assert.ok(dice.length, 'unexpected die'); return (dice.shift() - 1) / 6;}})});
 vm.runInContext(source + '\n_renderAll = () => {};', context);
 const run = value => vm.runInContext(value, context), d = run('_data()');
 const action = (command, values) => {dice.push(...values); run(command); assert.equal(dice.length, 0);};
 return {d, run, roll: (...values) => action('_runRound()', values), luck: (...values) => action('_testLuck()', values)};
}
function ready(f = fixture()) {
 Object.assign(f.d.player, {skill: 6, skillInitial: 6, stamina: 20, staminaInitial: 20, luck: 8, luckInitial: 8});
 Object.assign(f.d.enemy, {name: 'Enemy', skill: 6, stamina: 12, staminaMax: 12}); f.d.rolled = true; return f;
}
test('normal ties miss and Lucky hits add exactly two damage', () => {
 const f = ready(); f.roll(3, 3, 3, 3); assert.equal(f.d.player.stamina, 20);
 f.d.player.playerWoundDamage = 3; f.roll(6, 6, 1, 1); f.luck(1, 1);
 assert.equal(f.d.enemy.stamina, 7); assert.equal(f.d.player.luck, 7);
});
test('verified encounter modifiers do not alter character statistics', () => {
 for (const [section, modifier] of [[116, 1], [394, -2], [39, 2], [142, 0]]) {
  const f = ready(); f.d.enemy.name = 'Enemy §' + section; f.run('_resetEncounterKnobs(_data())');
  assert.equal(f.d.player.attackModifier, modifier); assert.equal(f.d.player.stamina, 20);
 }
});
test('dog fire attacks on every round, including a fatal final round', () => {
 const f = ready(); f.d.encounter.fire = true; f.roll(3, 3, 3, 3, 2); assert.equal(f.d.player.stamina, 19);
 f.luck(1, 1); assert.equal(f.d.player.stamina, 20);
 f.d.enemy.stamina = 2; f.d.player.stamina = 1; f.roll(6, 6, 1, 1, 1);
 assert.equal(f.d.history[0].outcome, 'loss'); assert.equal(f.d.pendingLuckQueue.length, 0);
});
test('fire misses on three through six', () => {
 for (const die of [3, 4, 5, 6]) {const f = ready(); f.d.encounter.fire = true; f.roll(3, 3, 3, 3, die); assert.equal(f.d.player.stamina, 20);}
});
test('crescent shield only protects on six', () => {
 const f = ready(); f.d.encounter.shield = true; f.roll(1, 1, 6, 6, 5); assert.equal(f.d.player.stamina, 18);
 f.run('_skipLuck()'); f.roll(1, 1, 6, 6, 6); assert.equal(f.d.player.stamina, 17);
});
test('invisibility follows the printed wound distribution', () => {
 for (const [die, damage] of [[1, 2], [2, 1], [3, 2], [4, 1], [5, 2], [6, 0]]) {
  const f = ready(); f.d.encounter.invisible = true; f.roll(1, 1, 6, 6, die);
  assert.equal(f.d.player.stamina, 20 - damage); assert.equal(f.d.pendingLuckQueue.length, damage ? 1 : 0);
 }
});
test('ghoul paralyses on the fourth wound', () => {
 const f = ready(); f.d.encounter.paralyzeAfter = 4;
 for (let i = 0; i < 4; i++) {f.roll(1, 1, 6, 6); if (i < 3) f.run('_skipLuck()');}
 assert.equal(f.d.player.stamina, 0); assert.equal(f.d.history[0].outcome, 'loss');
});
test('wight ignores normal weapons and costs one skill every three wounds', () => {
 const f = ready(); f.d.encounter.wight = true; f.roll(6, 6, 1, 1); assert.equal(f.d.enemy.stamina, 12);
 for (let i = 0; i < 3; i++) {f.roll(1, 1, 6, 6); f.run('_skipLuck()');}
 assert.equal(f.d.player.skill, 5);
 f.d.encounter.silver = true; f.roll(6, 6, 1, 1); assert.equal(f.d.enemy.stamina, 10);
});
test('skeleton pair attacks independently and only the target takes damage', () => {
 const f = ready(); f.d.encounter.paired = true; Object.assign(f.d.sideEnemy, {name: 'Side', skill: 6, stamina: 8, staminaMax: 8});
 f.roll(6, 6, 1, 1, 1, 1, 6, 6); assert.equal(f.d.player.stamina, 18); assert.equal(f.d.sideEnemy.stamina, 8);
 f.run('_switchSourceTarget()'); assert.equal(f.d.enemy.name, 'Enemy');
 f.run('_skipLuck(); _skipLuck(); _switchSourceTarget()'); assert.equal(f.d.enemy.name, 'Side');
});
test('both skeletons must die and fatal side attacks take precedence', () => {
 const f = ready(); f.d.encounter.paired = true; Object.assign(f.d.sideEnemy, {name: 'Side', skill: 6, stamina: 8, staminaMax: 8});
 f.d.enemy.stamina = 2; f.roll(6, 6, 1, 1, 6, 6, 1, 1); assert.equal(f.d.history.length, 0); assert.equal(f.d.enemy.name, 'Side');
 f.d.enemy.stamina = 2; f.roll(6, 6, 1, 1); assert.equal(f.d.history[0].outcome, 'win');
 const g = ready(); g.d.encounter.paired = true; Object.assign(g.d.sideEnemy, {name: 'Side', skill: 6, stamina: 8, staminaMax: 8});
 g.d.enemy.stamina = 2; g.d.player.stamina = 2; g.roll(6, 6, 1, 1, 1, 1, 6, 6); assert.equal(g.d.history[0].outcome, 'loss');
});
test('selecting a paired roster entry initializes its actual companion', () => {
 const f = ready(); f.d.enemy.name = 'Първа двойка СКЕЛЕТ А §140';
 f.run("_enemyList = [{name:'Първа двойка СКЕЛЕТ Б §140', attack:6, hp:6}, {name:'Втора двойка СКЕЛЕТ Б §140', attack:5, hp:5}]; _resetEncounterKnobs(_data())");
 assert.equal(f.d.encounter.paired, true); assert.equal(f.d.sideEnemy.stamina, 6); assert.equal(f.d.sideEnemy.skill, 6);
});
test('loading an existing fight does not opt it into new rules', () => {
 const original = ready().d; const saved = structuredClone(original); delete saved.combatRulesVersion; delete saved.encounter; delete saved.sideEnemy;
 const f = fixture(saved); assert.deepEqual(JSON.parse(JSON.stringify(f.d)), JSON.parse(JSON.stringify(saved)));
 f.roll(6, 6, 1, 1); assert.equal(f.d.enemy.stamina, 10); assert.equal(f.d.combatRulesVersion, undefined);
});
test('legacy Luck retains configured damage and reset does not migrate fights', () => {
 const saved = structuredClone(ready().d); delete saved.combatRulesVersion; delete saved.encounter; delete saved.sideEnemy;
 saved.player.playerWoundDamage = 3;
 const f = fixture(saved); f.roll(6, 6, 1, 1); f.luck(1, 1); assert.equal(f.d.enemy.stamina, 6);
 f.run('_resetBattle()'); assert.equal(f.d.combatRulesVersion, undefined); assert.equal(f.d.player.playerWoundDamage, 3);
});
test('all static simulator keys, including new controls, have labels', () => {
 const labels = readFileSync(new URL('../../../public/js/i18n/en/battlesim/battlesim464.js', import.meta.url), 'utf8');
 for (const match of source.matchAll(/t\('([^']+)'/g)) if (match[1].startsWith('battlesim464.')) assert.ok(labels.includes("'" + match[1] + "'"), match[1]);
});
