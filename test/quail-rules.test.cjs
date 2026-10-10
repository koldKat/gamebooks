const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../public/js/battlesim/engines/quail.js'), 'utf8');
const engine = import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const rolls = (...values) => () => { assert.ok(values.length, 'unexpected roll'); return values.shift(); };
const never = () => { throw Error('unexpected roll'); };
async function state() {
  const { quailStart } = await engine;
  const d = { player: { a: 4, d: 8, hp: 12, hpMax: 12, skills: { archery: 0, throwing: false }, ranged: { type: 'bow', attempts: 0 } }, enemy: { name: 'Enemy', a: 6, d: 5, hp: 12, hpMax: 12, pb: 2 } };
  quailStart(d);
  return d;
}
test('reset preserves current LIFE, ammunition and saved history', async () => {
  const { quailStart } = await engine, d = await state();
  d.player.hp = 3; d.ammo.bow = 2; d.history = [{ outcome: 'win' }]; d.enemy.hp = 1;
  quailStart(d);
  assert.equal(d.player.hp, 3); assert.equal(d.enemy.hp, 12); assert.equal(d.ammo.bow, 2); assert.equal(d.history.length, 1);
});
test('every surviving group enemy attacks, including when the chosen enemy dies', async () => {
  const { quailRound } = await engine, d = await state();
  d.enemy.hp = 1; d.extraEnemies.push({ name: 'Second', a: 9, d: 5, hp: 12, hpMax: 12, pb: 0 });
  const events = quailRound(d, rolls(6, 2));
  assert.equal(d.enemy.hp, 0); assert.equal(d.player.hp, 9); assert.equal(d.finished, null);
  assert.equal(events.filter(e => e.kind === 'enemy').length, 1);
});
test('companion attacks another living enemy and is never attacked', async () => {
  const { quailRound } = await engine, d = await state();
  d.enemy.hp = 1; d.options.companion = true; d.options.companionA = 10;
  d.extraEnemies.push({ name: 'Second', a: 9, d: 5, hp: 4, hpMax: 4, pb: 0 });
  quailRound(d, rolls(6, 1));
  assert.equal(d.finished, 'win'); assert.equal(d.player.hp, 12);
});
test('ranged healing spends one attempt and causes no melee counterattack', async () => {
  const { quailHeal } = await engine, d = await state();
  d.player.hp = 4; d.player.ranged.attempts = 2;
  quailHeal(d, 3, never); assert.equal(d.player.hp, 7); assert.equal(d.player.ranged.attempts, 1);
  quailHeal(d, 2, never); assert.equal(d.player.hp, 9);
  quailHeal(d, 2, rolls(6)); assert.equal(d.player.hp, 7);
});
test('flee outcomes respect the threshold and action cost', async () => {
  const { quailFlee } = await engine, d = await state();
  assert.deepEqual(quailFlee(d, never), []); d.options.escapeMin = 5;
  d.player.ranged.attempts = 1;
  quailFlee(d, rolls(2)); assert.equal(d.player.hp, 12); assert.equal(d.player.ranged.attempts, 0);
  quailFlee(d, rolls(2, 6)); assert.equal(d.player.hp, 8);
  quailFlee(d, rolls(5)); assert.equal(d.finished, 'escape');
});
test('ranged attacks consume ammunition on misses and ignore armour only for thrown weapons', async () => {
  const { quailRanged } = await engine, d = await state(), weapon = { t: 2, a: 3 };
  d.player.ranged.attempts = 3;
  assert.deepEqual(quailRanged(d, weapon, never), []);
  d.ammo.bow = 2;
  quailRanged(d, weapon, rolls(6)); assert.equal(d.enemy.hp, 12); assert.equal(d.ammo.bow, 1);
  quailRanged(d, weapon, rolls(1)); assert.equal(d.enemy.hp, 11);
  d.player.ranged.type = 'spear'; d.ammo.spear = 1;
  quailRanged(d, weapon, rolls(4)); assert.equal(d.enemy.hp, 9); assert.equal(d.ammo.spear, 0);
});
test('escape removes temporary water penalties and a reset clears old mirror damage', async () => {
  const { quailFlee, quailStart } = await engine, d = await state();
  d.originalPlayerA = 4; d.player.a = 2; d.options.escapeMin = 5; d.enemy.lastDamage = 7;
  quailFlee(d, rolls(6)); assert.equal(d.player.a, 4); assert.equal(d.originalPlayerA, undefined);
  quailStart(d); assert.equal(d.enemy.lastDamage, undefined);
});
test('bow mastery II includes the accuracy bonus from mastery I', async () => {
  const { quailRanged } = await engine, d = await state();
  d.player.ranged.attempts = 1; d.ammo.bow = 1; d.player.skills.archery = 2;
  quailRanged(d, { t: 2, a: 3 }, rolls(3)); assert.equal(d.enemy.hp, 9);
});
test('printed special die rules and harmless defence ties', async () => {
  const { quailCounter } = await engine;
  for (const [rule, values, expected] of [['sum2', [2, 3], 9], ['max2', [2, 5], 9], ['explode12', [1, 2, 3], 8], ['explode56', [5, 6, 2], 1], ['plus3six', [6], 5]]) {
    const d = await state(); d.enemy.rule = rule;
    quailCounter(d, rolls(...values)); assert.equal(d.player.hp, expected, rule);
  }
  const d = await state(); quailCounter(d, rolls(2)); assert.equal(d.player.hp, 12);
});
test('bedbug extra attack cannot trigger another secret extra attack', async () => {
  const { quailCounter } = await engine, d = await state(); d.enemy.rule = 'bedbug';
  const events = quailCounter(d, rolls(3, 6, 3)); assert.equal(events.filter(e => e.kind === 'enemy').length, 2);
});
test('aura costs one LIFE per round, not once per ghost', async () => {
  const { quailCounter } = await engine, d = await state(); d.enemy.aura = 1; d.enemy.a = 0;
  d.extraEnemies.push({ name: 'Ghost', a: 0, d: 8, hp: 12, aura: 1 });
  quailCounter(d, rolls(1, 1)); assert.equal(d.player.hp, 11);
});
test('losing nonlethal training stops the fight at one LIFE', async () => {
  const { quailCounter, quailRound } = await engine, d = await state(); d.options.nonlethal = true; d.player.hp = 1;
  quailCounter(d, rolls(6)); assert.equal(d.player.hp, 1); assert.equal(d.finished, 'loss');
  assert.deepEqual(quailRound(d, never), []);
});
test('paralysis allows exactly two consecutive attacks before the enemy resumes', async () => {
  const { quailSpell, quailRound } = await engine, d = await state();
  d.magic.value = 5; d.magic.spell = 'paralyze'; d.magic.learned.paralyze = true;
  quailSpell(d, rolls(1)); quailRound(d, rolls(1)); assert.equal(d.player.hp, 12);
  quailRound(d, rolls(1, 6)); assert.equal(d.player.hp, 8);
});
test('failed spell consumes its formula but remains available for another try', async () => {
  const { quailSpell } = await engine, d = await state();
  d.magic.value = 3; d.magic.spell = 'heal'; d.magic.formulas.heal = 2; d.player.ranged.attempts = 3; d.player.hp = 4;
  quailSpell(d, rolls(6)); assert.equal(d.magic.formulas.heal, 1); assert.equal(d.player.hp, 4); assert.equal(d.magic.used.heal, undefined);
  quailSpell(d, rolls(2)); assert.equal(d.player.hp, 12); assert.equal(d.magic.formulas.heal, 0);
  assert.deepEqual(quailSpell(d, never), []);
});
test('paralysis suppresses only the chosen enemy in group combat', async () => {
  const { quailSpell, quailRound, quailStart } = await engine, d = await state();
  d.enemy.a = 0;
  d.extraEnemies.push({ name: 'Second', a: 9, d: 8, hp: 12, hpMax: 12, pb: 0 });
  d.magic.value = 5; d.magic.spell = 'paralyze'; d.magic.learned.paralyze = true;
  quailSpell(d, rolls(1, 1)); assert.equal(d.player.hp, 10);
  quailRound(d, rolls(1, 1)); assert.equal(d.player.hp, 8);
  assert.equal(d.enemy.paralysis, 0);
  quailStart(d); assert.equal(d.enemy.paralysis, undefined);
});
test('fireball uses two dice plus magic against defence without an accuracy roll', async () => {
  const { quailSpell } = await engine, d = await state();
  d.magic.value = 4; d.magic.learned.fireball = true; d.player.ranged.attempts = 1;
  quailSpell(d, rolls(3, 4)); assert.equal(d.enemy.hp, 6);
  const empowered = await state(); empowered.magic.value = 4; empowered.magic.learned.fireball = true; empowered.magic.empower = true; empowered.player.ranged.attempts = 1;
  quailSpell(empowered, rolls(2, 2, 2)); assert.equal(empowered.enemy.hp, 7); assert.equal(empowered.player.hp, 10);
});
test('earthquake damages every foe using one shared die and ignores armour', async () => {
  const { quailSpell } = await engine, d = await state();
  d.extraEnemies.push({ name: 'Second', a: 0, d: 99, hp: 12, pb: 99 });
  d.magic.value = 5; d.magic.spell = 'earthquake'; d.magic.learned.earthquake = true; d.player.ranged.attempts = 1;
  quailSpell(d, rolls(1, 4)); assert.deepEqual([d.enemy.hp, d.extraEnemies[0].hp], [8, 8]);
});
test('control redirects the next attack and weakening lasts only this battle', async () => {
  const { quailSpell, quailStart } = await engine, d = await state();
  d.magic.value = 5; d.magic.spell = 'control'; d.magic.learned.control = true;
  quailSpell(d, rolls(1, 6)); assert.equal(d.player.hp, 12); assert.equal(d.enemy.hp, 5);
  d.magic.spell = 'weaken'; d.magic.learned.weaken = true;
  quailSpell(d, rolls(1, 1)); assert.equal(d.enemy.a, 4);
  quailStart(d); assert.equal(d.enemy.a, 6);
});
test('summons use the deceased profile minus two; wind grants two further ranged attempts', async () => {
  const { quailSpell } = await engine, d = await state();
  d.magic.value = 5; d.magic.spell = 'summon'; d.magic.learned.summon = true; d.magic.summonA = 8; d.player.ranged.attempts = 1;
  quailSpell(d, rolls(1)); assert.equal(d.options.companionA, 6); assert.equal(d.options.companion, true);
  d.magic.spell = 'wind'; d.magic.learned.wind = true; d.player.ranged.attempts = 1;
  quailSpell(d, rolls(1)); assert.equal(d.player.ranged.attempts, 2);
  assert.deepEqual(quailSpell(d, never), []);
});
test('auras remain dangerous during free attacks and paralysis', async () => {
  const { quailCounter } = await engine, d = await state(); d.enemy.aura = 1; d.freeAttacks = 2;
  quailCounter(d, never); assert.equal(d.player.hp, 11); assert.equal(d.freeAttacks, 1);
});
test('mirror restores only the selected enemy last hit, not all group damage', async () => {
  const { quailSpell } = await engine, d = await state();
  d.player.hp = 5; d.enemy.lastDamage = 3; d.lastEnemyDamage = 7;
  d.magic.value = 5; d.magic.spell = 'mirror'; d.magic.learned.mirror = true;
  quailSpell(d, rolls(1, 1)); assert.equal(d.player.hp, 8); assert.equal(d.enemy.hp, 9);
});
test('reading a saved legacy fight is inert; explicit reset opts in without healing', async () => {
  const vm = require('node:vm'), api = await engine, d = await state();
  delete d.rulesVersion; delete d.options; delete d.ammo; delete d.magic; delete d.extraEnemies;
  d.player.hp = 5; d.history = []; d.log = [];
  const pt = { sim829: d, equipment: {} };
  const controller = fs.readFileSync(path.join(__dirname, '../public/js/battlesim/battlesim829.js'), 'utf8').replace(/^import .*;$/gm, '').replace(/^export /gm, '');
  const context = vm.createContext({ ...api, currentPlaythrough: () => pt, saveState: () => {}, t: key => key, escapeHtml: x => x });
  vm.runInContext(controller + '\n_renderInputs=()=>{};_renderLog=()=>{};_renderHistory=()=>{};globalThis.subject={data:_data,reset:_resetBattle,sync:_syncStatFromEquipment};', context);
  const original = JSON.stringify(d); context.subject.data(); assert.equal(JSON.stringify(d), original);
  d.player.skills.weapon = 3; context.subject.sync(d, pt, 'a'); assert.equal(d.player.a, 3);
  context.subject.reset(); assert.equal(d.rulesVersion, 1); assert.equal(d.player.hp, 5);
  context.subject.sync(d, pt, 'a'); assert.equal(d.player.a, 0);
});
