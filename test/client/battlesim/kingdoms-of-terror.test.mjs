import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function fixture(saved) {
  const pt = saved ? { sim434: structuredClone(saved) } : {};
  const source = readFileSync(new URL('../../../public/js/battlesim/battlesim434.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
  const math = Object.create(Math);
  math.random = () => .2;
  const context = vm.createContext({ Math: math, currentPlaythrough: () => pt, saveState() {}, showAlert() {}, t: key => key, escapeHtml: value => value });
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

test('legacy saved fights are not migrated when opened', () => {
  const saved = JSON.parse(JSON.stringify(combat(12).data));
  delete saved.printedRules; delete saved.combatEffects;
  const { sim, data } = fixture(saved);
  assert.deepEqual(JSON.parse(JSON.stringify(data)), saved);
  sim.round();
  assert.equal(data.endurance, 96);
});

test('future simultaneous death is a loss, legacy outcome is preserved', () => {
  for (const future of [true, false]) {
    const { sim, data } = combat(42);
    data.endurance = data.enemy.endurance = 1;
    if (!future) { delete data.printedRules; delete data.combatEffects; }
    sim.round();
    assert.equal(data.history[0].outcome, future ? 'loss' : 'win');
  }
});

test('future fights cannot revive dead characters using a potion', () => {
  const { sim, data } = combat(42);
  data.endurance = 0;
  sim.potion();
  assert.equal(data.endurance, 0);
  assert.equal(data.healingPotionUsed, false);
});

test('living characters can heal after a fight', () => {
  const { sim, data } = combat(42);
  data.endurance = 50; data.enemy.endurance = 0;
  sim.potion();
  assert.equal(data.endurance, 54);
});

test('first two Yaushat rounds suppress combat loss only', () => {
  const { sim, data } = combat(12);
  sim.round(); sim.round();
  assert.equal(data.endurance, 100);
  sim.round(); assert.equal(data.endurance, 96);
});

test('printed first-round skill adjustments expire precisely', () => {
  for (const [section, adjustment] of [[114,2],[155,-4],[254,-2]]) {
    const { sim, data } = combat(section);
    assert.equal(sim.skill(data), 20 + adjustment);
    data.roundsThisBattle = 1;
    assert.equal(sim.skill(data), 20);
  }
});

test('tracking protects against surprise but not unarmed penalties', () => {
  for (const section of [155,254,270]) {
    const { sim, data } = combat(section);
    data.nextTracking = true; sim.capture(data);
    assert.equal(sim.skill(data), section === 155 ? 16 : 20);
  }
});

test('animal mastery applies only printed mounted bonuses', () => {
  for (const [section, bonus] of [[71,2],[194,2],[164,1],[283,1],[234,0]]) {
    const { sim, data } = combat(section);
    data.nextAnimal = true; sim.capture(data);
    assert.equal(sim.skill(data), 20 + bonus);
  }
});

test('Mindblast and Psi-surge respect distinct immunities', () => {
  for (const section of [42,77,270,344]) {
    const { sim, data } = combat(section);
    data.nextTracking = true;
    for (const psychic of ['blast', 'surge']) {
      data.nextPsychic = psychic; sim.capture(data);
      const bonus = [270,344].includes(section) || section === 77 && psychic === 'blast' ? 0 : psychic === 'blast' ? 2 : 4;
      assert.equal(sim.skill(data), 20 + bonus);
    }
  }
});

test('Psi-surge is unavailable at six ENDURANCE and costs two when active', () => {
  const { sim, data } = combat(42);
  data.nextPsychic = 'surge'; sim.capture(data);
  sim.round();
  assert.equal(data.endurance, 95);
  data.endurance = 6;
  assert.equal(sim.skill(data), 20);
  sim.round(); assert.equal(data.endurance, 2);
});

test('undead cold damage and Sommerwerd apply independently', () => {
  const { sim, data } = combat(270);
  data.nextTracking = true; data.nextSommerwerd = true; sim.capture(data);
  sim.round();
  assert.equal(data.endurance, 94);
  assert.equal(data.enemy.endurance, 92);
  data.nextNexus = true; sim.capture(data);
  sim.round(); assert.equal(data.endurance, 90);
});

test('changing pending options cannot modify an active fight', () => {
  const { sim, data } = combat(71);
  data.nextAnimal = true; data.nextPsychic = 'surge';
  assert.equal(sim.skill(data), 20);
  sim.capture(data); assert.equal(sim.skill(data), 26);
});

test('threshold encounters stop without false wins or further rounds', () => {
  for (const [section, hp, route] of [[78,12,180],[344,26,310]]) {
    const { sim, data } = combat(section);
    data.enemy.endurance = hp;
    sim.round();
    assert.equal(data.combatEffects.route, route);
    assert.equal(data.history.length, 0);
    const before = data.endurance;
    sim.round(); assert.equal(data.endurance, before);
  }
});

test('threshold instant kills still continue without recording wins', () => {
  const { sim, data, math } = combat(344);
  data.combatSkill = 40; math.random = () => 0;
  sim.round();
  assert.equal(data.combatEffects.route, 310);
  assert.equal(data.history.length, 0);
});

test('timed victory routes distinguish three rounds from four', () => {
  for (const [section, fast, slow] of [[92,77,215],[201,15,87]]) {
    for (const rounds of [2,3]) {
      const { sim, data } = combat(section);
      data.roundsThisBattle = rounds; data.enemy.endurance = 1;
      sim.round();
      assert.equal(data.combatEffects.route, rounds === 2 ? fast : slow);
    }
  }
});

test('escape windows enforce first-round and minimum-round restrictions', () => {
  for (const [section, rounds, route] of [[116,0,105],[337,0,191],[215,2,286],[155,4,305],[343,3,305]]) {
    const { sim, data } = combat(section);
    data.roundsThisBattle = rounds;
    assert.equal(sim.escapeRoute(data), route);
    data.roundsThisBattle = [116,337].includes(section) ? 1 : rounds - 1;
    assert.equal(sim.escapeRoute(data), 0);
  }
});

test('escape rolls cause player loss but no enemy damage or victory', () => {
  const { sim, data } = combat(42);
  sim.escape();
  assert.equal(data.enemy.endurance, 100);
  assert.equal(data.endurance, 96);
  assert.equal(data.combatEffects.route, 70);
  assert.equal(data.history.length, 0);
});

test('stopping work on the canal door does not roll a combat round', () => {
  const { sim, data } = combat(156);
  sim.escape();
  assert.equal(data.roundsThisBattle, 0);
  assert.equal(data.endurance, 100);
  assert.equal(data.combatEffects.route, 339);
});

test('archery uses separate target points and never harms real ENDURANCE', () => {
  const { sim, data } = combat(26);
  data.attackModifier = 99; data.nextPsychic = 'surge'; data.nextBowMastery = true;
  sim.capture(data);
  assert.equal(sim.skill(data), 23);
  sim.round();
  assert.equal(data.endurance, 100);
  assert.ok(data.combatEffects.targetPoints < 50);
});

test('Jackan raw zero breaks the bow without target or real ENDURANCE loss', () => {
  const { sim, data, math } = combat(26);
  data.nextJackan = true; sim.capture(data); math.random = () => 0;
  sim.round();
  assert.equal(data.combatEffects.route, 335);
  assert.equal(data.combatEffects.targetPoints, 50);
  assert.equal(data.endurance, 100);
  assert.equal(data.history.length, 0);
});

test('archery loss chooses its nonfatal printed destination', () => {
  const { sim, data } = combat(26);
  data.combatEffects.targetPoints = 1;
  sim.round();
  assert.equal(data.combatEffects.route, 183);
  assert.equal(data.endurance, 100);
  assert.equal(data.history[0].outcome, 'loss');
});
