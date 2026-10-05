import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function fixture(saved) {
  const source = readFileSync(new URL('../../../public/js/battlesim/battlesim375.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
  const pt = saved ? { sim375: structuredClone(saved) } : {};
  const context = vm.createContext({ currentPlaythrough: () => pt, saveState: () => {}, t: k => k, escapeHtml: s => s });
  vm.runInContext(source + '\n_renderAll = () => {};', context);
  const run = s => vm.runInContext(s, context);
  const d = run('_data()');
  return { run, d };
}

function fight() {
  const f = fixture();
  Object.assign(f.d.enemy, { name: 'Test', endurance: 50, enduranceMax: 50 });
  f.d.player.defense = 0;
  f.run('Math.random = () => 0');
  return f;
}

test('New hand and kick strikes deal only their damage die, not the attack roll', () => {
  for (const [technique, damage] of [['hand', 1], ['kick', 3]]) {
    const f = fight();
    f.d.technique = technique;
    f.run('_attack()');
    assert.equal(f.d.enemy.endurance, 50 - damage);
    assert.equal(f.d.pendingEnemyHit.dmg, 1);
    assert.equal(f.d.player.endurance, 20);
  }
});

test('Inner Force doubles corrected hand and kick damage; shuriken damage stays unchanged', () => {
  for (const [technique, damage] of [['hand', 2], ['kick', 6], ['shuriken', 6]]) {
    const f = fight();
    f.d.technique = technique;
    f.d.useInnerForce = true;
    f.run('_attack()');
    assert.equal(f.d.enemy.endurance, 50 - damage);
    assert.equal(f.d.player.innerForce, 4);
    assert.equal(f.d.player.shurikens, technique === 'shuriken' ? 4 : 5);
  }
});

test('Throw follow-ups use one damage die plus throw and kick bonuses', () => {
  for (const [technique, damage] of [['hand', 3], ['kick', 5]]) {
    const f = fight();
    f.d.pendingThrowFollowup = true;
    f.run(`_throwFollowup('${technique}')`);
    assert.equal(f.d.enemy.endurance, 50 - damage);
    assert.equal(f.d.pendingEnemyHit.dmg, 1);
    assert.equal(f.d.pendingThrowFollowup, false);
  }
});

test('Missed follow-ups counter once; counterattack ties still miss', () => {
  for (const technique of ['hand', 'kick']) {
    const f = fight();
    f.d.enemy.defHand = f.d.enemy.defKick = 12;
    f.d.pendingThrowFollowup = true;
    f.run(`_throwFollowup('${technique}')`);
    assert.equal(f.d.pendingEnemyHit.dmg, 1);
    f.run(`_throwFollowup('${technique}')`);
    assert.equal(f.d.log.length, 3);
  }
  const f = fight();
  f.d.enemy.defHand = 12;
  f.d.player.defense = 2;
  f.d.pendingThrowFollowup = true;
  f.run('_throwFollowup("hand")');
  assert.equal(f.d.pendingEnemyHit, null);
});

test('Legacy saves remain identical on load, retain old damage and reset without opting in', () => {
  const saved = JSON.parse(JSON.stringify(fight().d));
  delete saved.correctedCombatRules;
  const f = fixture(saved);
  assert.deepEqual(JSON.parse(JSON.stringify(f.d)), saved);
  f.run('Math.random = () => 0; _attack()');
  assert.equal(f.d.enemy.endurance, 47);
  f.run('_resetBattle()');
  assert.equal(f.d.correctedCombatRules, undefined);
  f.d.enemy.defHand = 12;
  f.d.pendingThrowFollowup = true;
  f.run('_throwFollowup("hand")');
  assert.equal(f.d.pendingEnemyHit, null);
});

test('New encounter selection opts in while preserving character stats; corrected saves reload', () => {
  const f = fight();
  delete f.d.correctedCombatRules;
  f.d.player.endurance = 11;
  f.d.player.innerForce = 2;
  f.d.player.hand = 3;
  f.run('_startEnemyFight(_data(), {name: "Test", hp: 50, attack: 0, pb: 1})');
  assert.equal(f.d.correctedCombatRules, true);
  assert.equal(f.d.player.endurance, 11);
  assert.equal(f.d.player.innerForce, 2);
  assert.equal(f.d.player.hand, 3);
  const loaded = fixture(JSON.parse(JSON.stringify(f.d)));
  loaded.run('Math.random = () => 0; _attack()');
  assert.equal(loaded.d.enemy.endurance, 49);
});

test('Defeated enemies cannot counter and unsuccessful attacks do not deal damage', () => {
  const defeated = fight();
  defeated.d.enemy.endurance = 1;
  defeated.run('_attack()');
  assert.equal(defeated.d.pendingEnemyHit, null);
  assert.equal(defeated.d.history.length, 1);
  const missed = fight();
  missed.d.enemy.defHand = 2;
  missed.run('_attack()');
  assert.equal(missed.d.enemy.endurance, 50);
  assert.equal(missed.d.pendingEnemyHit.dmg, 1);
});

test('Future zero-damage encounters do not wound or offer unnecessary blocks', () => {
  const f = fight();
  f.run('_startEnemyFight(_data(), {name: "Pit Horror", hp: 17, attack: 7, pb: 0, defense: 0})');
  f.run('_attack()');
  assert.equal(f.d.pendingEnemyHit, null);
  assert.equal(f.d.enemy.endurance, 17);
  assert.equal(f.d.player.endurance, 20);
  assert.equal(f.d.player.blockPenaltyPending, false);
  assert.equal(f.d.roundsThisBattle, 1);
  f.d.enemy.defHand = 0;
  f.run('_attack()');
  assert.equal(f.d.enemy.endurance, 16);
  assert.equal(f.d.pendingEnemyHit, null);
  f.d.pendingThrowFollowup = true;
  f.run('_throwFollowup("hand")');
  assert.equal(f.d.pendingEnemyHit, null);
  const loaded = fixture(JSON.parse(JSON.stringify(f.d)));
  assert.equal(loaded.d.allowZeroEnemyDamage, true);
  loaded.run('_enemyCounter(_data())');
  assert.equal(loaded.d.pendingEnemyHit, null);
});

test('Existing zero-dice fights retain legacy damage until a new encounter starts', () => {
  const saved = JSON.parse(JSON.stringify(fight().d));
  delete saved.allowZeroEnemyDamage;
  saved.enemy.dmgDice = 0;
  const f = fixture(saved);
  assert.deepEqual(JSON.parse(JSON.stringify(f.d)), saved);
  f.run('Math.random = () => 0; _enemyCounter(_data())');
  assert.equal(f.d.pendingEnemyHit.dmg, 1);
  f.run('_resetBattle()');
  assert.equal(f.d.allowZeroEnemyDamage, undefined);
  f.run('_startEnemyFight(_data(), {name: "Pit Horror", hp: 17, attack: 7, pb: 0, defense: 0})');
  assert.equal(f.d.allowZeroEnemyDamage, true);
  f.run('_enemyCounter(_data())');
  assert.equal(f.d.pendingEnemyHit, null);
});

test('Zero dice retain an explicit fixed damage bonus, and ordinary damage stays unchanged', () => {
  for (const [dice, bonus, expected] of [[0, 2, 2], [1, 1, 2], [2, 2, 4]]) {
    const f = fight();
    f.d.enemy.dmgDice = dice;
    f.d.enemy.dmgBonus = bonus;
    f.run('_enemyCounter(_data())');
    assert.equal(f.d.pendingEnemyHit.dmg, expected);
  }
});
