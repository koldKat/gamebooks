import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function fixture(id, saved) {
  const source = readFileSync(new URL(`../../../public/js/battlesim/battlesim${id}.js`, import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
  const pt = saved ? { [`sim${id}`]: structuredClone(saved) } : {};
  const context = vm.createContext({ currentPlaythrough: () => pt, saveState: () => {}, structuredClone, t: k => k, escapeHtml: s => s });
  vm.runInContext(source + '\n_renderAll = () => {};', context);
  return { run: s => vm.runInContext(s, context), d: vm.runInContext('_data()', context), source };
}

for (const [id, meals, legacy] of [[243, 2, 10], [254, 12, 0], [257, 10, 0], [258, 10, 0], [263, 10, 0], [267, 10, 0]]) {
  test(`${id}: new supplies change without migrating saved characters or fights`, () => {
    const f = fixture(id);
    assert.equal(f.d.player.provisionsLeft, meals);
    const saved = JSON.parse(JSON.stringify(f.d));
    saved.player.provisionsLeft = 3;
    saved.player.stamina = 9;
    saved.enemy = { name: 'Caldwell', skill: 8, stamina: 4, staminaMax: 8 };
    saved.roundsThisBattle = 2;
    saved.pendingLuck = 'enemy-hit';
    assert.deepEqual(JSON.parse(JSON.stringify(fixture(id, saved).d)), saved);
    delete saved.player.provisionsLeft;
    assert.equal(fixture(id, saved).d.player.provisionsLeft, legacy);
  });
}

for (const [id, skill, stamina] of [[243, [1, 6], [2, 12]], [258, [8, 10], [12, 22]]]) {
  test(`${id}: corrected initial rolls stay within printed ranges`, () => {
    const f = fixture(id);
    const rolls = f.source.match(/d\.player\.skillInitial\s*=.*;\n\s*d\.player\.staminaInitial\s*=.*;/)[0];
    for (const [random, index] of [[0, 0], [0.999, 1]]) {
      f.run(`Math.random = () => ${random}; const d = _data(); ${rolls}`.replace('const d', 'var d'));
      assert.equal(f.d.player.skillInitial, skill[index]);
      assert.equal(f.d.player.staminaInitial, stamina[index]);
    }
  });
}

test('Caldwell winning doubles apply only to opted-in future fights', () => {
  for (const [enabled, dice, damage] of [[true, [0, 0, 0.999, 0.999], 4], [false, [0, 0, 0.999, 0.999], 2], [true, [0, 0, 0.999, 0.8], 2]]) {
    const f = fixture(267);
    f.d.rolled = true;
    f.d.caldwellDoubles = enabled;
    Object.assign(f.d.player, { skill: 1, stamina: 20, staminaInitial: 20 });
    Object.assign(f.d.enemy, { name: 'Caldwell', skill: 8, stamina: 8, staminaMax: 8 });
    f.run(`var rolls = ${JSON.stringify(dice)}; Math.random = () => rolls.shift(); _runRound()`);
    assert.equal(f.d.player.stamina, 20 - damage);
  }
});

test('Caldwell doubles do not damage a player who wins or ties', () => {
  for (const skill of [8, 9]) {
    const f = fixture(267);
    f.d.rolled = true;
    f.d.caldwellDoubles = true;
    Object.assign(f.d.player, { skill, stamina: 20, staminaInitial: 20 });
    Object.assign(f.d.enemy, { name: 'Caldwell', skill: 8, stamina: 8, staminaMax: 8 });
    f.run('Math.random = () => 0.5; _runRound()');
    assert.equal(f.d.player.stamina, 20);
  }
});

test('Caldwell rule recognizes the actual roster label, not unrelated zombies', () => {
  const f = fixture(267);
  for (const name of ['Caldwell', 'CALDWELL (Zombie)', ' caldwell (zombie) ']) {
    assert.equal(f.run(`_isCaldwell(${JSON.stringify(name)})`), true);
  }
  for (const name of ['ZOMBIE', 'Caldwell impostor', 'TROLL GUARD']) {
    assert.equal(f.run(`_isCaldwell(${JSON.stringify(name)})`), false);
  }
});

function bloodIslandFight(name) {
  const f = fixture(267);
  f.d.rolled = true;
  Object.assign(f.d.player, { skill: 1, stamina: 30, staminaInitial: 30, luck: 12 });
  Object.assign(f.d.enemy, { name, skill: 20, stamina: 10, staminaMax: 10 });
  f.run('_startSpecialRules(_data()); Math.random = () => 0.5');
  return f;
}

test('Ghoul counts lost rounds, including Lucky wounds, and stops without rewriting STAMINA', () => {
  const f = bloodIslandFight('GHOUL');
  f.run('_runRound(); _testLuck(); _runRound(); _testLuck(); _runRound()');
  assert.equal(f.d.specialRules.lostRounds, 3);
  assert.equal(f.d.specialRules.outcome, 'loss');
  assert.equal(f.d.player.stamina, 26);
  assert.equal(f.d.history.length, 1);
  f.run('_runRound()');
  assert.equal(f.d.history.length, 1);
});

test('Dwarf stops after first won round without killing the enemy', () => {
  const f = bloodIslandFight('DWARF');
  f.d.player.skill = 30;
  f.run('_runRound(); _runRound()');
  assert.equal(f.d.enemy.stamina, 8);
  assert.equal(f.d.specialRules.outcome, 'win');
  assert.equal(f.d.history.length, 1);
  assert.equal(f.d.pendingLuck, null);
});

test('Bronze Warrior sword and Craggen Knife have separate damage, with Luck never healing an enemy', () => {
  for (const [knife, damage] of [[false, 1], [true, 2]]) {
    const f = bloodIslandFight('BRONZE WARRIOR');
    f.d.player.skill = 30;
    f.d.player.luck = 1;
    f.d.specialRules.craggenKnife = knife;
    f.run('_runRound()');
    assert.equal(f.d.enemy.stamina, 10 - damage);
    f.run('_testLuck()');
    assert.equal(f.d.enemy.stamina, 9);
  }
});

test('Howling Demon section 283 modifier is explicit, not applied to section 118', () => {
  for (const enabled of [false, true]) {
    const f = bloodIslandFight('HOWLING DEMON');
    f.d.specialRules.demon283 = enabled;
    f.run('_runRound()');
    assert.equal(f.d.player.stamina, enabled ? 27 : 28);
  }
});

test('Legacy Blood Island fights do not acquire special rules merely on load', () => {
  for (const name of ['GHOUL', 'DWARF', 'BRONZE WARRIOR', 'HOWLING DEMON']) {
    const f = bloodIslandFight(name);
    delete f.d.specialRules;
    const saved = JSON.parse(JSON.stringify(f.d));
    const loaded = fixture(267, saved);
    assert.deepEqual(JSON.parse(JSON.stringify(loaded.d)), saved);
    loaded.run('Math.random = () => 0.5; _runRound()');
    assert.equal(loaded.d.player.stamina, 28);
    assert.equal(loaded.d.specialRules, undefined);
  }
});

function labyrinthFight() {
  const f = fixture(286);
  Object.assign(f.d.player, { life: 50, lifeMax: 50, weaponKey: 'glove', gloveBonus: 5 });
  Object.assign(f.d.enemy, { name: 'Group', hp: 5, hpMax: 5, minHit: 12, extraAttackers: 2 });
  f.d.lifeRollCount = 1;
  f.d.aeRolled = true;
  f.run('Math.random = () => 0.5');
  return f;
}

test('286: future group fight ends only when every health pool is defeated', () => {
  const f = labyrinthFight();
  f.run('_runRound()');
  assert.deepEqual(Array.from(f.d.group.hp), [0, 5, 5]);
  assert.equal(f.d.group.target, 1);
  assert.equal(f.d.history.length, 0);
  f.run('_runRound(); _runRound(); _runRound()');
  assert.deepEqual(Array.from(f.d.group.hp), [0, 0, 0]);
  assert.equal(f.d.history.length, 1);
});

test('286: defeated group members do not attack, and enemy-first attacks every living member', () => {
  const f = labyrinthFight();
  f.d.enemy.minHit = 0;
  f.run('_runRound()');
  assert.equal(f.d.player.life, 34);
  const g = labyrinthFight();
  g.d.enemy.minHit = 0;
  g.d.player.enemyFirst = true;
  g.run('_runRound()');
  assert.equal(g.d.player.life, 26);
});

test('286: charged gadgets kill individual targets, not the whole group', () => {
  const f = labyrinthFight();
  f.d.tech.blaster.activated = true;
  f.run('_activateTech("blaster")');
  assert.deepEqual(Array.from(f.d.group.hp), [0, 5, 5]);
  assert.equal(f.d.history.length, 0);
  f.run('_activateTech("blaster"); _activateTech("blaster")');
  assert.equal(f.d.history.length, 1);
});

test('286: revive restores the group snapshot, including its selected target', () => {
  const f = labyrinthFight();
  f.run('_runRound(); _activateTech("dehronator")');
  assert.deepEqual(Array.from(f.d.group.hp), [5, 5, 5]);
  assert.equal(f.d.group.target, 0);
  assert.equal(f.d.enemy.hp, 5);
});

test('286: legacy group settings are unchanged on load and retain previous resolution', () => {
  const f = labyrinthFight();
  delete f.d.groupRules;
  const saved = JSON.parse(JSON.stringify(f.d));
  const loaded = fixture(286, saved);
  assert.deepEqual(JSON.parse(JSON.stringify(loaded.d)), saved);
  loaded.run('Math.random = () => 0.5; _runRound()');
  assert.equal(loaded.d.history.length, 1);
  assert.equal(loaded.d.group, undefined);
});

test('286: dream 3 rolls one die repeatedly, succeeds at 9-12 and can stop early', () => {
  const f = labyrinthFight();
  f.d.player.life = 20;
  f.run('_resolveDream(_data(), 3); Math.random = () => 0.5; _dream3Roll(); _dream3Roll()');
  assert.equal(f.d.dream3.total, 8);
  assert.equal(f.d.player.life, 20);
  f.run('_dream3Roll()');
  assert.equal(f.d.player.life, 32);
  assert.equal(f.d.dream3, undefined);
  f.run('_resolveDream(_data(), 3); _dream3Roll(); _dream3Stop()');
  assert.equal(f.d.player.life, 28);
});

test('286: dream 3 bust deducts accumulated total, death records once and pending dreams survive reload', () => {
  const f = labyrinthFight();
  f.d.player.life = 10;
  f.run('_resolveDream(_data(), 3); Math.random = () => 0.5; _dream3Roll(); _dream3Roll()');
  const saved = JSON.parse(JSON.stringify(f.d));
  const loaded = fixture(286, saved);
  assert.deepEqual(JSON.parse(JSON.stringify(loaded.d)), saved);
  loaded.run('Math.random = () => 0.999; _dream3Roll(); _dream3Roll(); _dream3Stop()');
  assert.equal(loaded.d.player.life, 0);
  assert.equal(loaded.d.history.length, 1);
});

test('286: pending dream blocks combat and gadgets, and stopping before any roll is ignored', () => {
  const f = labyrinthFight();
  f.run('_resolveDream(_data(), 3); _dream3Stop(); _runRound(); _activateTech("laser"); _resetBattle()');
  assert.equal(f.d.dream3.total, 0);
  assert.equal(f.d.roundsThisBattle, 0);
  assert.equal(f.d.enemy.hp, 5);
  assert.equal(f.d.player.life, 50);
});
