import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../../public/js/battlesim/battlesim468.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
function fixture(saved) {
  const pt = saved ? {sim468: structuredClone(saved)} : {}, dice = [];
  const context = vm.createContext({currentPlaythrough: () => pt, saveState: () => {}, escapeHtml: value => value, t: (key, params) => JSON.stringify({key, params}), Math: Object.assign(Object.create(Math), {random: () => {assert.ok(dice.length, 'unexpected die'); return (dice.shift() - 1) / 6;}})});
  vm.runInContext(source + '\n_renderAll = () => {};', context);
  const run = value => vm.runInContext(value, context), d = run('_data()');
  const action = (command, values) => {dice.push(...values); run(command); assert.equal(dice.length, 0);};
  return {d, run, roll: (...values) => action('_runRound()', values), luck: (...values) => action('_testLuck()', values)};
}
function ready(f = fixture()) {
  Object.assign(f.d.player, {skill: 6, skillInitial: 6, stamina: 20, staminaInitial: 20, luck: 8, luckInitial: 8});
  Object.assign(f.d.enemy, {name: 'Enemy', skill: 6, stamina: 12, staminaMax: 12});
  f.d.rolled = true;
  return f;
}
test('ties miss and Lucky player hits add exactly two damage', () => {
  const f = ready(); f.roll(3, 3, 3, 3); assert.equal(f.d.player.stamina, 20);
  f.d.player.playerWoundDamage = 3; f.roll(6, 6, 1, 1); f.luck(1, 1);
  assert.equal(f.d.enemy.stamina, 7); assert.equal(f.d.player.luck, 7);
});
test('verified encounter presets leave character statistics untouched', () => {
  for (const [section, modifier] of [[37, -2], [357, -2], [188, -3], [240, -3], [332, -3], [386, -3], [17, 0], [351, 0]]) {
    const f = ready(); f.d.enemy.name = `Enemy (§${section})`; f.run('_resetEncounterKnobs(_data())');
    assert.equal(f.d.player.attackModifier, modifier); assert.equal(f.d.player.stamina, 20);
    assert.equal(f.d.player.enemyDefeatThreshold, section === 17 ? 2 : 0);
  }
});
test('ice demon breath hits on one through three without a wound Luck prompt', () => {
  for (const die of [1, 2, 3, 4, 5, 6]) {
    const f = ready(); f.d.encounter.breath = 'demon'; f.d.encounter.goldRing = true;
    f.roll(3, 3, 3, 3, die);
    assert.equal(f.d.player.stamina, die <= 3 ? 19 : 20); assert.equal(f.d.pendingLuckQueue.length, 0);
  }
});
test('dragon breath costs two on one or two and the gold ring blocks it', () => {
  for (const ring of [false, true]) for (const die of [1, 2, 3, 4, 5, 6]) {
    const f = ready(); f.d.encounter.breath = 'dragon'; f.d.encounter.goldRing = ring;
    f.roll(3, 3, 3, 3, die); assert.equal(f.d.player.stamina, !ring && die <= 2 ? 18 : 20);
  }
});
test('fatal breath still applies in the round that kills the enemy', () => {
  const f = ready(); f.d.encounter.breath = 'dragon'; f.d.enemy.stamina = 2; f.d.player.stamina = 2;
  f.roll(6, 6, 1, 1, 1); assert.equal(f.d.history[0].outcome, 'loss'); assert.equal(f.d.pendingLuckQueue.length, 0);
  f.roll(); assert.equal(f.d.history.length, 1);
});
test('Banshee fear fails above current Skill and succeeds at equality', () => {
  const f = ready(); f.d.encounter.fear = true; f.roll(4, 4);
  assert.equal(f.d.player.stamina, 18); f.run('_skipLuck()');
  f.roll(3, 3, 6, 6, 1, 1); assert.equal(f.d.enemy.stamina, 10);
});
test('fear and breath presets are specific to their printed sections', () => {
  for (const section of [108, 143, 185, 223, 313]) {
    const f = ready(); f.d.enemy.name = `Enemy (§${section})`; f.run('_resetEncounterKnobs(_data())');
    assert.equal(f.d.encounter.fear, section === 185);
    assert.equal(f.d.encounter.breath, [108, 143].includes(section) ? 'demon' : section === 223 ? 'dragon' : '');
  }
});
test('paired opponents attack independently and only the chosen target takes damage', () => {
  const f = ready(); f.d.encounter.paired = true; Object.assign(f.d.sideEnemy, {name: 'Side', skill: 6, stamina: 8, staminaMax: 8});
  f.roll(6, 6, 1, 1, 1, 1, 6, 6); assert.equal(f.d.player.stamina, 18); assert.equal(f.d.sideEnemy.stamina, 8);
  f.run('_switchSourceTarget()'); assert.equal(f.d.enemy.name, 'Enemy');
  f.run('_skipLuck(); _skipLuck(); _switchSourceTarget()'); assert.equal(f.d.enemy.name, 'Side');
});
test('the surviving paired enemy becomes the target and both must die', () => {
  const f = ready(); f.d.encounter.paired = true; Object.assign(f.d.sideEnemy, {name: 'Side', skill: 6, stamina: 8, staminaMax: 8});
  f.d.enemy.stamina = 2; f.roll(6, 6, 1, 1, 6, 6, 1, 1);
  assert.equal(f.d.history.length, 0); assert.equal(f.d.enemy.name, 'Side');
  f.d.enemy.stamina = 2; f.roll(6, 6, 1, 1); assert.equal(f.d.history[0].outcome, 'win');
});
test('fatal side attacks take precedence over killing the target', () => {
  const f = ready(); f.d.encounter.paired = true; Object.assign(f.d.sideEnemy, {name: 'Side', skill: 6, stamina: 8, staminaMax: 8});
  f.d.enemy.stamina = 2; f.d.player.stamina = 2; f.roll(6, 6, 1, 1, 1, 1, 6, 6);
  assert.equal(f.d.history[0].outcome, 'loss');
});
test('all three simultaneous pairs initialize the actual companion, not sequential fights', () => {
  for (const section of [13, 262, 296, 145, 212]) {
    const f = ready(); f.d.enemy.name = `First (§${section})`;
    f.run(`_enemyList = [{name:'Second (§${section})', attack:9, hp:7}]; _resetEncounterKnobs(_data())`);
    assert.equal(f.d.encounter.paired, [13, 262, 296].includes(section));
    assert.equal(f.d.sideEnemy.stamina, [13, 262, 296].includes(section) ? 7 : 0);
  }
});
test('reset restores both enemies without losing the gold ring preference', () => {
  const f = ready(); f.d.encounter.paired = true; f.d.encounter.goldRing = true;
  Object.assign(f.d.sideEnemy, {name: 'Side', skill: 6, stamina: 1, staminaMax: 8});
  f.run('_resetBattle()'); assert.equal(f.d.sideEnemy.stamina, 8);
  f.d.enemy.name = 'Dragon (§223)'; f.run('_resetEncounterKnobs(_data())'); assert.equal(f.d.encounter.goldRing, true);
});
test('loading an existing fight leaves saved values and rules unchanged', () => {
  const saved = structuredClone(ready().d); delete saved.combatRulesVersion; delete saved.encounter; delete saved.sideEnemy;
  const f = fixture(saved); assert.deepEqual(JSON.parse(JSON.stringify(f.d)), JSON.parse(JSON.stringify(saved)));
  f.roll(6, 6, 1, 1); assert.equal(f.d.enemy.stamina, 10); assert.equal(f.d.combatRulesVersion, undefined);
});
test('legacy Luck keeps configured damage and reset does not migrate the fight', () => {
  const saved = structuredClone(ready().d); delete saved.combatRulesVersion; delete saved.encounter; delete saved.sideEnemy;
  saved.player.playerWoundDamage = 3;
  const f = fixture(saved); f.roll(6, 6, 1, 1); f.luck(1, 1); assert.equal(f.d.enemy.stamina, 6);
  f.run('_resetBattle()'); assert.equal(f.d.combatRulesVersion, undefined); assert.equal(f.d.player.playerWoundDamage, 3);
});
test('future combat does not roll without an enemy or while Luck is pending', () => {
  const f = ready(); f.d.enemy.staminaMax = 0; f.roll(); assert.equal(f.d.roundsThisBattle, 0);
  f.d.enemy.staminaMax = 12; f.roll(6, 6, 1, 1); f.roll(); assert.equal(f.d.roundsThisBattle, 1);
});
test('all static simulator keys have translated labels', () => {
  const labels = readFileSync(new URL('../../../public/js/i18n/en/battlesim/battlesim468.js', import.meta.url), 'utf8');
  for (const match of source.matchAll(/t\('([^']+)'/g)) if (match[1].startsWith('battlesim468.')) assert.ok(labels.includes("'" + match[1] + "'"), match[1]);
});
