import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function fixture(saved) {
  const pt = saved ? { sim439: structuredClone(saved) } : {};
  const source = readFileSync(new URL('../../../public/js/battlesim/battlesim439.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
  const math = Object.create(Math); math.random = () => .2;
  const context = vm.createContext({ Math: math, currentPlaythrough: () => pt, saveState() {}, showAlert() {}, escapeHtml: value => value, t: (key, values) => key === 'battlesim439.ui.neijjin' ? `Нейджин ${values.n} §101` : key });
  vm.runInContext(source + '\n_renderAll = () => {}; globalThis.sim = { data: _data, capture: _captureFightEffects, skill: _effectiveSkill, round: _runRound, reset: _resetBattle, potion: _usePotion, escapeRoute: _escapeRoute };', context);
  return { sim: context.sim, data: context.sim.data(), math };
}

function combat(section = 0) {
  const result = fixture();
  Object.assign(result.data, { rolled: true, combatSkill: 20, combatSkillInitial: 20, endurance: 100, enduranceInitial: 100, willpower: 30, willpowerInitial: 30 });
  Object.assign(result.data.enemy, { name: 'Enemy §' + section, skill: 20, endurance: 100, enduranceMax: 100 });
  result.sim.capture(result.data);
  return result;
}

test('legacy opening and rounds keep saved fields and former combat behaviour', () => {
  const saved = JSON.parse(JSON.stringify(combat().data));
  delete saved.printedRules; delete saved.combatEffects;
  delete saved.willpower; delete saved.willpowerInitial;
  delete saved.nextWeapon; delete saved.nextWillSpend;
  const { sim, data } = fixture(saved);
  assert.deepEqual(JSON.parse(JSON.stringify(data)), saved);
  sim.round(); assert.equal(data.endurance, 96); assert.equal(data.enemy.endurance, 96);
  assert.equal(data.willpower, undefined);
});

test('new characters do not assume the optional starting potion', () => {
  assert.equal(fixture().data.hasHealingPotion, false);
});

test('staff spends WILLPOWER each round and multiplies enemy loss only', () => {
  const { sim, data } = combat(); data.nextWillSpend = 3; sim.capture(data);
  sim.round(); assert.equal(data.enemy.endurance, 88); assert.equal(data.endurance, 96); assert.equal(data.willpower, 27);
});

test('spending is capped by remaining WILLPOWER; exhausted staff incurs minus six', () => {
  const { sim, data } = combat(); data.nextWillSpend = 3; data.willpower = 1; sim.capture(data);
  sim.round(); assert.equal(data.willpower, 0); assert.equal(data.enemy.endurance, 96);
  assert.equal(sim.skill(data), 14); sim.round(); assert.equal(data.willpower, 0);
});

test('ordinary weapons and unarmed combat do not consume WILLPOWER', () => {
  for (const [weapon, skill] of [['other',14], ['none',12]]) {
    const { sim, data } = combat(); data.nextWeapon = weapon; sim.capture(data);
    assert.equal(sim.skill(data), skill); sim.round(); assert.equal(data.willpower, 30);
  }
});

test('next-fight settings leave an already captured fight unchanged', () => {
  const { sim, data } = combat(); data.nextWeapon = 'none'; data.nextWillSpend = 3; data.nextDagger = true;
  assert.equal(sim.skill(data), 20); sim.round(); assert.equal(data.willpower, 29);
});

test('source fixed skill effects apply once', () => {
  for (const [section, bonus] of [[99,4],[120,3],[189,3],[203,4],[205,5],[231,-2],[243,4],[281,-1],[308,4]]) {
    const { sim, data } = combat(section); assert.equal(sim.skill(data), 20 + bonus);
  }
});

test('guard surprise bonus expires after exactly two rounds', () => {
  const { sim, data } = combat(309);
  assert.equal(sim.skill(data), 24); sim.round(); assert.equal(sim.skill(data), 24);
  sim.round(); assert.equal(sim.skill(data), 20);
});

test('optional dagger and spare weapon bonuses are captured independently', () => {
  const { sim, data } = combat(101); data.nextDagger = data.nextSpareWeapon = true; sim.capture(data);
  assert.equal(sim.skill(data), 23); data.nextDagger = data.nextSpareWeapon = false;
  assert.equal(sim.skill(data), 23);
});

test('Neijjin advance sequentially, do not heal, and preserve total round count', () => {
  const { sim, data } = combat(101); data.enemy.endurance = 1; sim.round();
  assert.equal(data.combatEffects.sequence, 1); assert.equal(data.enemy.skill, 9); assert.equal(data.enemy.endurance, 10);
  assert.equal(data.roundsThisBattle, 1); assert.equal(data.history.length, 0); assert.equal(data.endurance, 96);
  data.combatEffects.sequence = 7; data.enemy.endurance = 1; sim.round();
  assert.equal(data.enemy.skill, 10); assert.equal(data.enemy.endurance, 9);
});

test('Neijjin reset restores selected opponent without restoring player resources', () => {
  const { sim, data } = combat(101); data.enemy.endurance = 1; sim.round();
  const ep = data.endurance, wp = data.willpower;
  sim.reset(); assert.equal(data.enemy.name, 'Enemy §101'); assert.equal(data.enemy.endurance, 100);
  assert.equal(data.combatEffects.sequence, 0); assert.equal(data.endurance, ep); assert.equal(data.willpower, wp);
});

test('round deadlines stop without a false kill or additional rolls', () => {
  for (const [section, rounds, route] of [[101,5,130],[120,3,189],[149,4,165],[272,3,315],[281,1,331]]) {
    const { sim, data } = combat(section);
    for (let i = 0; i < rounds; i++) sim.round();
    assert.equal(data.combatEffects.routes[0], route); assert.equal(data.roundsThisBattle, rounds); assert.equal(data.history.length, 0);
    const snapshot = JSON.stringify(data); sim.round(); assert.equal(JSON.stringify(data), snapshot);
  }
});

test('winning on the third round beats the mantiz deadline', () => {
  const { sim, data } = combat(272); data.roundsThisBattle = 2; data.enemy.endurance = 1; sim.round();
  assert.equal(data.history[0].outcome, 'win'); assert.equal(data.combatEffects.routes[0], 322);
});

test('one-round kuoku continuation checks WILLPOWER after staff expenditure', () => {
  const { sim, data } = combat(281); data.willpower = 10; sim.round();
  assert.equal(data.combatEffects.routes[0], 32); assert.equal(data.history.length, 0);
});

test('Kleasa drains WILLPOWER and ENDURANCE in addition to ordinary combat', () => {
  for (const shield of [false,true]) {
    const { sim, data } = combat(149); data.nextShield = shield; sim.capture(data); sim.round();
    assert.equal(data.willpower, 28); assert.equal(data.endurance, shield ? 95 : 94);
  }
});

test('mental combat uses the disclosed static convention without staff costs', () => {
  const { sim, data } = combat(259);
  assert.equal(sim.skill(data), 130); data.endurance = 50; assert.equal(sim.skill(data), 130);
  sim.round(); assert.equal(data.willpower, 30);
});

test('simultaneous death loses under future rules and retains legacy outcome', () => {
  for (const future of [true,false]) {
    const { sim, data } = combat(); data.endurance = data.enemy.endurance = 1;
    if (!future) { delete data.combatEffects; delete data.printedRules; }
    sim.round(); assert.equal(data.history[0].outcome, future ? 'loss' : 'win');
  }
});

test('escape honours source restrictions and ignores enemy damage', () => {
  const { sim, data } = combat(205); assert.equal(sim.escapeRoute(data), 163);
  const enemy = data.enemy.endurance; sim.round(true); assert.equal(data.enemy.endurance, enemy);
  assert.equal(data.combatEffects.routes[0], 163); assert.equal(data.history.length, 0);
  const barred = combat(224); const saved = JSON.stringify(barred.data); barred.sim.round(true);
  assert.equal(JSON.stringify(barred.data), saved);
});

test('delayed escapes require printed rounds and normal click events are not escapes', () => {
  for (const [section, rounds, route] of [[133,2,27],[154,1,4]]) {
    const { sim, data } = combat(section); assert.equal(sim.escapeRoute(data), null);
    for (let i = 0; i < rounds; i++) sim.round({ type: 'click' });
    assert.equal(sim.escapeRoute(data), route); sim.round(true); assert.equal(data.combatEffects.routes[0], route);
  }
});

test('potion cannot revive or heal midfight, and heals four after completion', () => {
  const { sim, data } = combat(); data.hasHealingPotion = true;
  data.endurance = 0; sim.potion(); assert.equal(data.endurance, 0); assert.equal(data.healingPotionUsed, false);
  data.endurance = 50; data.roundsThisBattle = 1; sim.potion(); assert.equal(data.endurance, 50);
  data.combatEffects.finished = true; sim.potion(); assert.equal(data.endurance, 54); assert.equal(data.healingPotionUsed, true);
});

test('victory destinations include both choices and do not invent single routes', () => {
  for (const [section, routes] of [[99,[88,94]], [243,[125,338,333]], [337,[44]]]) {
    const { sim, data } = combat(section); data.enemy.endurance = 1; sim.round();
    assert.deepEqual(Array.from(data.combatEffects.routes), routes);
  }
});
