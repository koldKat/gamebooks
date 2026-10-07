import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function fixture(saved) {
  const pt = saved ? { sim438: structuredClone(saved) } : {};
  const source = readFileSync(new URL('../../../public/js/battlesim/battlesim438.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
  const math = Object.create(Math);
  math.random = () => .2;
  const context = vm.createContext({ Math: math, currentPlaythrough: () => pt, saveState() {}, showAlert() {}, t: key => key === 'battlesim438.ui.second_enemy' ? 'Second swordsman §274' : key, escapeHtml: value => value });
  vm.runInContext(source + '\n_renderAll = () => {}; globalThis.sim = { data: _data, potion: _usePotion, reset: _resetBattle, capture: _captureFightEffects, skill: _effectiveSkill, round: _runRound, escape: _escape, escapeRoute: _escapeRoute };', context);
  return { sim: context.sim, data: context.sim.data(), math };
}

function combat(section) {
  const result = fixture();
  Object.assign(result.data, { rolled: true, combatSkill: 20, combatSkillInitial: 20, endurance: 100, enduranceInitial: 100 });
  Object.assign(result.data.enemy, { name: 'Enemy §' + section, skill: 20, endurance: 100, enduranceMax: 100 });
  result.sim.capture(result.data);
  return result;
}

test('opening legacy fights preserves saved state and existing rules', () => {
  const saved = JSON.parse(JSON.stringify(combat(54).data));
  delete saved.printedRules; delete saved.combatEffects;
  const { sim, data } = fixture(saved);
  assert.deepEqual(JSON.parse(JSON.stringify(data)), saved);
  sim.round(); assert.equal(data.endurance, 93);
});

test('simultaneous death loses only under future rules', () => {
  for (const future of [true, false]) {
    const { sim, data } = combat(2);
    data.endurance = data.enemy.endurance = 1;
    if (!future) { delete data.printedRules; delete data.combatEffects; }
    sim.round(); assert.equal(data.history[0].outcome, future ? 'loss' : 'win');
  }
});

test('laumspur heals four, cannot revive or heal during future fights', () => {
  const { sim, data } = combat(2);
  data.endurance = 0; sim.potion(); assert.equal(data.endurance, 0);
  data.endurance = 50; data.roundsThisBattle = 1; sim.potion(); assert.equal(data.endurance, 50);
  data.enemy.endurance = 0; sim.potion(); assert.equal(data.endurance, 54);
});

test('next-fight settings do not alter the current captured fight', () => {
  const { sim, data } = combat(118);
  data.nextAnimal = true; assert.equal(sim.skill(data), 20);
  sim.capture(data); assert.equal(sim.skill(data), 22);
});

test('printed Mindblast immunity still allows Psi-surge', () => {
  for (const section of [76,113,133,148,168,180,211,252,286,311]) {
    const { sim, data } = combat(section);
    const base = sim.skill(data);
    data.nextPsychic = 'blast'; sim.capture(data); assert.equal(sim.skill(data), base);
    data.nextPsychic = 'surge'; sim.capture(data); assert.equal(sim.skill(data), base + 4);
  }
});

test('Psi-surge costs two separately and ceases at six EP', () => {
  const { sim, data } = combat(2);
  data.nextPsychic = 'surge'; sim.capture(data); sim.round(); assert.equal(data.endurance, 95);
  data.endurance = 6; assert.equal(sim.skill(data), 20);
});

test('Akataz psychic bonuses double or triple with Spirit Circle', () => {
  for (const section of [81,254]) for (const mode of ['blast','surge']) {
    const { sim, data } = combat(section);
    const bonus = mode === 'blast' ? 2 : 4;
    data.nextPsychic = mode; sim.capture(data); assert.equal(sim.skill(data), 20 + bonus * 2);
    data.nextSpirit = true; sim.capture(data); assert.equal(sim.skill(data), 20 + bonus * 3);
  }
});

test('Siqueals first-round tracking penalty and Zagganazod first-round bonus expire', () => {
  for (const [section, skill] of [[28,17],[251,22]]) {
    const { sim, data } = combat(section);
    assert.equal(sim.skill(data), skill);
    sim.round(); assert.equal(sim.skill(data), 20);
  }
  const { sim, data } = combat(28);
  data.nextTracking = true; sim.capture(data); assert.equal(sim.skill(data), 20);
});

test('Lapillibore penalties distinguish weapon, unarmed defence and forbidden shield', () => {
  const { sim, data } = combat(54);
  assert.equal(sim.skill(data), 13);
  data.nextTutelary = true; sim.capture(data); assert.equal(sim.skill(data), 15);
  data.nextWeapon = true; sim.capture(data); assert.equal(sim.skill(data), 17);
  const other = combat(304);
  other.data.attackModifier = 2; other.data.nextShield = true;
  other.sim.capture(other.data); assert.equal(other.sim.skill(other.data), 17);
});

test('wolf first-round unarmed penalty expires', () => {
  const { sim, data } = combat(336);
  assert.equal(sim.skill(data), 16); sim.round(); assert.equal(sim.skill(data), 20);
});

test('fixed bullwhip, ally and forced skill bonuses apply once', () => {
  for (const section of [168,245,288]) {
    const { sim, data } = combat(section);
    assert.equal(sim.skill(data), 22); sim.round(); assert.equal(sim.skill(data), 22);
  }
});

test('Sommerwerd doubles ghost losses, not Tagazin losses', () => {
  const ghost = combat(133); ghost.sim.round(); assert.equal(ghost.data.enemy.endurance, 92);
  const tagazin = combat(286); tagazin.sim.round(); assert.equal(tagazin.data.enemy.endurance, 96);
});

test('Jarel halves combat loss without rounding or halving Psi-surge cost', () => {
  const plain = combat(172); plain.math.random = () => .1; plain.sim.round(); assert.equal(plain.data.endurance, 97.5);
  const surge = combat(172); surge.data.nextPsychic = 'surge'; surge.sim.capture(surge.data);
  surge.sim.round(); assert.equal(surge.data.endurance, 96.5);
});

test('Roark and wolf time limits stop without another roll or false victory', () => {
  for (const [section, limit, route] of [[41,3,10],[187,4,234],[336,4,234],[349,4,234]]) {
    const { sim, data } = combat(section);
    for (let i = 0; i < limit; i++) sim.round();
    assert.equal(data.combatEffects.route, route); assert.equal(data.history.length, 0);
    const ep = data.endurance; sim.round(); assert.equal(data.endurance, ep);
    assert.equal(data.roundsThisBattle, limit);
  }
});

test('victory at the timed limit takes the victory route', () => {
  for (const [section, limit, route] of [[41,3,326],[187,4,202],[336,4,202],[349,4,202]]) {
    const { sim, data } = combat(section);
    data.roundsThisBattle = limit - 1; data.enemy.endurance = 1;
    sim.round(); assert.equal(data.combatEffects.route, route); assert.equal(data.history[0].outcome, 'win');
  }
});

test('timed victories choose the correct fast and slow outcomes', () => {
  for (const [section, limit, fast, slow] of [[28,4,169,309],[245,4,169,309],[126,4,11,321],[180,2,316,261]]) {
    for (const [rounds, route] of [[limit - 1,fast],[limit,slow]]) {
      const { sim, data } = combat(section);
      data.roundsThisBattle = rounds; data.enemy.endurance = 1;
      sim.round(); assert.equal(data.combatEffects.route, route);
    }
  }
});

test('Tagazin stops at twenty without claiming a kill or ignoring player death', () => {
  const { sim, data } = combat(286);
  data.enemy.endurance = 24; sim.round(); assert.equal(data.combatEffects.route, 20);
  assert.equal(data.history.length, 0);
  const dead = combat(286); dead.data.endurance = 1; dead.data.enemy.endurance = 24;
  dead.sim.round(); assert.equal(dead.data.history[0].outcome, 'loss');
  assert.equal(dead.data.combatEffects.route, undefined);
});

test('both swordsmen must die; reset restores the originally selected enemy', () => {
  const { sim, data } = combat(274);
  data.enemy.skill = 18; data.enemy.endurance = 1; sim.capture(data);
  sim.round(); assert.equal(data.enemy.skill, 17); assert.equal(data.enemy.endurance, 29);
  assert.equal(data.history.length, 0); assert.equal(data.endurance, 96);
  data.enemy.endurance = 1; sim.round(); assert.equal(data.combatEffects.route, 68);
  assert.equal(data.history.length, 1);
  sim.reset(); assert.equal(data.enemy.skill, 18); assert.equal(data.combatEffects.phase, 0);
});

test('selecting the second swordsman does not replay the first', () => {
  const { sim, data } = combat(274);
  data.enemy.skill = 17; data.enemy.endurance = 1; sim.capture(data);
  sim.round(); assert.equal(data.combatEffects.route, 68);
});

test('immediate escapes do not inflict damage', () => {
  for (const [section, route] of [[81,340],[132,23],[216,23]]) {
    const { sim, data } = combat(section);
    sim.escape(); assert.equal(data.combatEffects.route, route);
    assert.equal(data.roundsThisBattle, 0); assert.equal(data.endurance, 100);
    assert.equal(data.enemy.endurance, 100); assert.equal(data.history.length, 0);
  }
});

test('delayed escapes require their printed rounds and incur only player combat loss', () => {
  for (const [section, rounds, route] of [[113,3,229],[118,2,39]]) {
    const { sim, data } = combat(section);
    sim.escape(); assert.equal(data.roundsThisBattle, 0);
    data.roundsThisBattle = rounds; sim.escape();
    assert.equal(data.combatEffects.route, route); assert.equal(data.enemy.endurance, 100);
    assert.equal(data.endurance, 96);
  }
});

test('death on escape records loss without routing to safety', () => {
  const { sim, data } = combat(113);
  data.roundsThisBattle = 3; data.endurance = 1; sim.escape();
  assert.equal(data.history[0].outcome, 'loss'); assert.equal(data.combatEffects.route, undefined);
});

test('click event is not interpreted as an escape', () => {
  const { sim, data } = combat(2);
  sim.round({ type: 'click' }); assert.equal(data.enemy.endurance, 96);
});
