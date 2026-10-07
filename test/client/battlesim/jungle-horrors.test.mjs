import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function fixture(saved) {
  const pt = saved ? { sim436: structuredClone(saved) } : {};
  const source = readFileSync(new URL('../../../public/js/battlesim/battlesim436.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
  const math = Object.create(Math);
  math.random = () => .2;
  const context = vm.createContext({ Math: math, currentPlaythrough: () => pt, saveState() {}, showAlert() {}, t: (key, args) => key === 'battlesim436.ui.second_vordak' ? 'Вордак 2 §' + args.section : key, escapeHtml: value => value });
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

test('opening a legacy fight preserves all saved values and its original rules', () => {
  const saved = JSON.parse(JSON.stringify(combat(52).data));
  delete saved.printedRules; delete saved.combatEffects;
  const { sim, data } = fixture(saved);
  assert.deepEqual(JSON.parse(JSON.stringify(data)), saved);
  sim.round(); assert.equal(data.endurance, 96);
});

test('future simultaneous death loses without changing legacy outcomes', () => {
  for (const future of [true, false]) {
    const { sim, data } = combat(233);
    data.endurance = data.enemy.endurance = 1;
    if (!future) { delete data.printedRules; delete data.combatEffects; }
    sim.round(); assert.equal(data.history[0].outcome, future ? 'loss' : 'win');
  }
});

test('potions cannot resurrect or heal during a future fight', () => {
  const { sim, data } = combat(233);
  data.endurance = 0; sim.potion(); assert.equal(data.endurance, 0);
  assert.equal(data.healingPotionUsed, false);
  data.endurance = 50; data.roundsThisBattle = 1; sim.potion();
  assert.equal(data.endurance, 50); assert.equal(data.healingPotionUsed, false);
  data.enemy.endurance = 0; sim.potion(); assert.equal(data.endurance, 54);
});

test('captured options do not change when next-fight options are edited', () => {
  const { sim, data } = combat(30);
  data.nextShield = data.nextSpirit = true;
  assert.equal(sim.skill(data), 20);
  sim.round(); assert.equal(data.endurance, 94);
  data.endurance = 100; sim.capture(data);
  assert.equal(sim.skill(data), 22);
  sim.round(); assert.equal(data.endurance, 96);
});

test('Mindblast immunity preserves allowed Psi-surge', () => {
  for (const section of [8,13,30,47,101,110,169,183,257,287,308,323,333]) {
    const { sim, data } = combat(section);
    data.nextPsychic = 'blast'; sim.capture(data); const base = sim.skill(data);
    data.nextPsychic = 'surge'; sim.capture(data); assert.equal(sim.skill(data), base + 4);
  }
});

test('Kezoor and Rahgu resist both psychic attacks without an EP charge', () => {
  for (const section of [159,199,339]) {
    const { sim, data } = combat(section);
    const base = sim.skill(data);
    for (const psychic of ['blast','surge']) {
      data.nextPsychic = psychic; sim.capture(data); assert.equal(sim.skill(data), base);
    }
  }
});

test('Psi-surge costs two separately and stops at six EP', () => {
  const { sim, data } = combat(233);
  data.nextPsychic = 'surge'; sim.capture(data); sim.round(); assert.equal(data.endurance, 95);
  data.endurance = 6; assert.equal(sim.skill(data), 20);
  sim.round(); assert.equal(data.endurance, 2);
});

test('Helghast psychic damage happens before attacks and can kill first', () => {
  for (const section of [30,47,183,308]) {
    const { sim, data } = combat(section);
    data.endurance = 2; const enemy = data.enemy.endurance;
    sim.round(); assert.equal(data.endurance, 0); assert.equal(data.enemy.endurance, enemy);
    assert.equal(data.roundsThisBattle, 0); assert.equal(data.history[0].outcome, 'loss');
    const shielded = combat(section);
    shielded.data.nextShield = true; shielded.sim.capture(shielded.data);
    shielded.sim.round(); assert.equal(shielded.data.endurance, 96);
  }
});

test('Spirit Circle bonuses apply only to Helghast encounters', () => {
  for (const section of [30,47,183,308,233]) {
    const { sim, data } = combat(section);
    data.nextSpirit = true; sim.capture(data);
    assert.equal(sim.skill(data), section === 233 ? 20 : 22);
  }
});

test('animal discipline removes crowd penalties and adds mounted bonuses', () => {
  for (const section of [8,101,88,106,162]) {
    const { sim, data } = combat(section);
    assert.equal(sim.skill(data), [8,101].includes(section) ? 17 : 20);
    data.nextAnimal = true; sim.capture(data);
    assert.equal(sim.skill(data), [8,101].includes(section) ? 20 : 22);
  }
});

test('Psi-shield removes printed skill penalties only where specified', () => {
  for (const section of [13,287,333]) {
    const { sim, data } = combat(section);
    assert.equal(sim.skill(data), 18);
    data.nextShield = true; sim.capture(data); assert.equal(sim.skill(data), 20);
  }
});

test('Paido contributes five skill against the first monastery monks', () => {
  const { sim, data } = combat(41);
  assert.equal(sim.skill(data), 25);
});

test('unarmed penalties expire after two rounds and honor Tutelary weapon skill', () => {
  for (const section of [252,323]) {
    const { sim, data } = combat(section);
    assert.equal(sim.skill(data), 16);
    data.nextTutelary = true; sim.capture(data); assert.equal(sim.skill(data), 18);
    data.roundsThisBattle = 2; assert.equal(sim.skill(data), 20);
  }
  const { sim, data } = combat(169);
  assert.equal(sim.skill(data), 14);
  data.nextShield = data.nextTutelary = true; sim.capture(data);
  assert.equal(sim.skill(data), 18);
  data.roundsThisBattle = 10; assert.equal(sim.skill(data), 18);
});

test('tracking removes only the specified surprise penalties', () => {
  for (const [section, base] of [[298,17],[313,16]]) {
    const { sim, data } = combat(section);
    assert.equal(sim.skill(data), base);
    data.nextTracking = true; sim.capture(data); assert.equal(sim.skill(data), 20);
  }
  const { sim, data } = combat(298);
  data.roundsThisBattle = 2; assert.equal(sim.skill(data), 20);
});

test('swamp-gas protection requires both Nexus and Primate rank', () => {
  const { sim, data } = combat(339);
  assert.equal(sim.skill(data), 12);
  data.nextNexus = true; sim.capture(data); assert.equal(sim.skill(data), 12);
  data.nextPrimate = true; sim.capture(data); assert.equal(sim.skill(data), 20);
});

test('spider triples psychic skill bonuses, not damage or psychic cost', () => {
  const { sim, data } = combat(52);
  data.nextPsychic = 'blast'; sim.capture(data); assert.equal(sim.skill(data), 26);
  data.nextPsychic = 'surge'; sim.capture(data); assert.equal(sim.skill(data), 32);
  sim.round(); assert.equal(data.endurance, 94); assert.equal(data.enemy.endurance, 90);
});

test('Korkuna psychic combat uses fixed skill fifteen without equipment bonuses', () => {
  const { sim, data } = combat(74);
  data.combatSkill = 40; data.attackModifier = 20; data.nextPsychic = 'surge';
  sim.capture(data); assert.equal(sim.skill(data), 15);
  sim.round(); assert.equal(data.endurance, 94);
});

test('python venom resistance requires both Curing and Primate rank', () => {
  const { sim, data } = combat(155);
  sim.round(); assert.equal(data.endurance, 92);
  data.endurance = 100; data.nextCuring = true; sim.capture(data);
  sim.round(); assert.equal(data.endurance, 92);
  data.endurance = 100; data.nextPrimate = true; sim.capture(data);
  sim.round(); assert.equal(data.endurance, 96);
});

test('Sommerwerd doubles undead damage only in printed sword encounters', () => {
  for (const section of [8,13,30,287,308,47]) {
    const { sim, data } = combat(section);
    data.nextShield = data.nextAnimal = true; sim.capture(data);
    sim.round(); assert.equal(data.enemy.endurance, section === 47 ? 96 : 92);
  }
});

test('Paido halves combat damage without inventing a rounding rule', () => {
  for (const section of [159,199]) {
    const { sim, data, math } = combat(section);
    math.random = () => .1;
    sim.round(); assert.equal(data.endurance, 97.5);
  }
});

test('first-round immunity applies to the correct side only', () => {
  const player = combat(251);
  player.sim.round(); assert.equal(player.data.endurance, 100); assert.equal(player.data.enemy.endurance, 96);
  player.sim.round(); assert.equal(player.data.endurance, 96);
  const enemy = combat(183);
  enemy.data.nextShield = true; enemy.sim.capture(enemy.data);
  enemy.sim.round(); assert.equal(enemy.data.enemy.endurance, 100); assert.equal(enemy.data.endurance, 96);
  enemy.sim.round(); assert.equal(enemy.data.enemy.endurance, 96);
});

test('sequential Vordaks must both die, with no healing between opponents', () => {
  for (const section of [13,287]) {
    const { sim, data } = combat(section);
    data.enemy.name = 'Вордак 1 §' + section; data.nextShield = true;
    sim.capture(data); data.enemy.endurance = 1; sim.round();
    assert.equal(data.history.length, 0); assert.equal(data.enemy.skill, 21); assert.equal(data.enemy.endurance, 26);
    assert.equal(data.endurance, 96); assert.equal(data.roundsThisBattle, 1);
    data.enemy.endurance = 1; sim.round();
    assert.equal(data.history[0].outcome, 'win'); assert.equal(data.combatEffects.route, 79);
    sim.reset(); assert.equal(data.enemy.name, 'Вордак 1 §' + section);
    assert.equal(data.combatEffects.secondVordak, true); assert.equal(data.roundsThisBattle, 0);
  }
});

test('section thirteen stops before a seventh attack, but section 287 has no limit', () => {
  for (const section of [13,287]) {
    const { sim, data } = combat(section);
    data.roundsThisBattle = 6; sim.round();
    assert.equal(data.combatEffects.route, section === 13 ? 158 : undefined);
    assert.equal(data.roundsThisBattle, section === 13 ? 6 : 7);
  }
});

test('Boran fight stops after two rounds unless won sooner', () => {
  const { sim, data } = combat(257);
  sim.round(); assert.equal(data.combatEffects.finished, undefined);
  sim.round(); assert.equal(data.combatEffects.route, 163);
  const hp = data.endurance; sim.round(); assert.equal(data.endurance, hp);
  const winning = combat(257); winning.data.enemy.endurance = 1;
  winning.sim.round(); assert.equal(winning.data.combatEffects.route, 12);
});

test('escape windows require three completed rounds and apply player-only damage', () => {
  for (const [section, route] of [[38,309],[205,309],[346,309],[110,191],[323,191],[339,48]]) {
    const { sim, data } = combat(section);
    data.roundsThisBattle = 2; assert.equal(sim.escapeRoute(data), 0);
    data.roundsThisBattle = 3; assert.equal(sim.escapeRoute(data), route);
    data.nextNexus = data.nextPrimate = true; sim.capture(data);
    sim.escape(); assert.equal(data.combatEffects.route, route); assert.equal(data.enemy.endurance, 100);
    assert.equal(data.endurance, 96); assert.equal(data.history.length, 0);
  }
});

test('click event arguments do not accidentally trigger escape', () => {
  const { sim, data } = combat(233);
  sim.round({ type: 'click' }); assert.equal(data.enemy.endurance, 96);
});
