import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function fixture(saved) {
  const pt = saved ? { sim435: structuredClone(saved) } : {};
  const source = readFileSync(new URL('../../../public/js/battlesim/battlesim435.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
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

test('opening a legacy fight preserves its saved values and round rules', () => {
  const saved = JSON.parse(JSON.stringify(combat(76).data));
  delete saved.printedRules; delete saved.combatEffects;
  const { sim, data } = fixture(saved);
  assert.deepEqual(JSON.parse(JSON.stringify(data)), saved);
  sim.round();
  assert.equal(data.endurance, 96);
});

test('simultaneous death loses future fights without changing legacy outcomes', () => {
  for (const future of [true, false]) {
    const { sim, data } = combat(62);
    data.endurance = data.enemy.endurance = 1;
    if (!future) { delete data.printedRules; delete data.combatEffects; }
    sim.round();
    assert.equal(data.history[0].outcome, future ? 'loss' : 'win');
  }
});

test('potions cannot revive a dead future character or heal mid-fight', () => {
  const { sim, data } = combat(62);
  data.endurance = 0; sim.potion();
  assert.equal(data.endurance, 0); assert.equal(data.healingPotionUsed, false);
  data.endurance = 50; data.roundsThisBattle = 1; sim.potion();
  assert.equal(data.endurance, 50); assert.equal(data.healingPotionUsed, false);
  data.enemy.endurance = 0; sim.potion();
  assert.equal(data.endurance, 54);
});

test('surprise penalties expire after the printed two or three rounds', () => {
  for (const [section, rounds] of [[19,2],[27,3]]) {
    const { sim, data } = combat(section);
    assert.equal(sim.skill(data), 17);
    data.roundsThisBattle = rounds - 1; assert.equal(sim.skill(data), 17);
    data.roundsThisBattle = rounds; assert.equal(sim.skill(data), 20);
    data.nextTracking = true; sim.capture(data); data.roundsThisBattle = 0;
    assert.equal(sim.skill(data), 20);
  }
});

test('unarmed snake penalties expire after two rounds regardless of tracking', () => {
  const { sim, data } = combat(219);
  data.nextTracking = true; sim.capture(data);
  assert.equal(sim.skill(data), 16);
  data.roundsThisBattle = 2; assert.equal(sim.skill(data), 20);
});

test('webs and door apply their printed movement/unarmed penalties', () => {
  for (const section of [93,214]) {
    const { sim, data } = combat(section);
    assert.equal(sim.skill(data), 16);
    data.nextNexus = true; sim.capture(data);
    assert.equal(sim.skill(data), section === 214 ? 20 : 16);
  }
});

test('encounter bonuses apply only where printed', () => {
  for (const [section, options, expected] of [[27,{nextMace:true,nextTracking:true},25],[45,{nextCircleLight:true},22],[118,{nextTracking:true},22],[257,{nextCloth:true},19],[257,{nextCloth:true,nextTracking:true},21],[62,{nextMace:true,nextCircleLight:true,nextCloth:true},20]]) {
    const { sim, data } = combat(section);
    Object.assign(data, options); sim.capture(data);
    assert.equal(sim.skill(data), expected);
  }
});

test('Mindblast immunity does not wrongly suppress Psi-surge', () => {
  for (const section of [8,78,118,126,198,202,235,245]) {
    const { sim, data } = combat(section);
    data.nextPsychic = 'blast'; sim.capture(data); assert.equal(sim.skill(data), 20);
    data.nextPsychic = 'surge'; sim.capture(data); assert.equal(sim.skill(data), 24);
  }
});

test('webs and staff Zahda resist both psychic attacks without charging EP', () => {
  for (const section of [93,174]) {
    for (const psychic of ['blast','surge']) {
      const { sim, data } = combat(section);
      data.nextPsychic = psychic; sim.capture(data);
      assert.equal(sim.skill(data), section === 93 ? 16 : 20);
      sim.round(); assert.equal(data.endurance, section === 93 ? 95 : 96);
    }
  }
});

test('Psi-surge costs two separately and stops at six EP', () => {
  const { sim, data } = combat(62);
  data.nextPsychic = 'surge'; sim.capture(data);
  sim.round(); assert.equal(data.endurance, 95);
  data.endurance = 6; assert.equal(sim.skill(data), 20);
  sim.round(); assert.equal(data.endurance, 2);
});

test('poison and burning multiply only combat-table loss', () => {
  for (const [section, option, multiplier] of [[76,null,3],[126,'nextNexus',2],[178,'nextCuring',2],[219,'nextCuring',2],[285,'nextCuring',2],[301,'nextCuring',2]]) {
    const { sim, data } = combat(section);
    data.roundsThisBattle = 2;
    sim.round(); assert.equal(data.endurance, 100 - 4 * multiplier);
    if (option) {
      data.endurance = 100; data[option] = true; sim.capture(data);
      sim.round(); assert.equal(data.endurance, 96);
    }
  }
  const { sim, data } = combat(76);
  data.nextPsychic = 'surge'; sim.capture(data);
  sim.round(); assert.equal(data.endurance, 89);
});

test('weed suffocation adds two every round including zero-loss rounds', () => {
  const { sim, data, math } = combat(325);
  math.random = () => 0;
  sim.round(); assert.equal(data.endurance, 98);
});

test('psychic worm vulnerability doubles damage only while psychic attack is active', () => {
  for (const [psychic, hp] of [['none',96],['blast',90],['surge',88]]) {
    const { sim, data } = combat(233);
    data.nextPsychic = psychic; sim.capture(data); sim.round();
    assert.equal(data.enemy.endurance, hp);
  }
  const { sim, data } = combat(233);
  data.nextPsychic = 'surge'; sim.capture(data); data.endurance = 6;
  sim.round(); assert.equal(data.enemy.endurance, 96);
});

test('companion jailer damage doubles without healing the player', () => {
  const { sim, data } = combat(290);
  sim.round(); assert.equal(data.enemy.endurance, 92); assert.equal(data.endurance, 96);
});

test('pending options do not change an active fight', () => {
  const { sim, data } = combat(45);
  data.nextCircleLight = true; data.nextPsychic = 'surge';
  assert.equal(sim.skill(data), 20);
  sim.capture(data); assert.equal(sim.skill(data), 26);
});

test('escape windows and no-escape encounters match the printed choices', () => {
  for (const [section, rounds, route] of [[19,3,241],[45,3,336],[249,3,241],[221,2,229],[257,3,64],[301,4,91],[253,0,277],[314,0,277],[214,0,277]]) {
    const { sim, data } = combat(section);
    data.roundsThisBattle = rounds; assert.equal(sim.escapeRoute(data), route);
    if (rounds) { data.roundsThisBattle--; assert.equal(sim.escapeRoute(data), 0); }
  }
  for (const section of [40,75,93,174,299,319]) {
    const { sim, data } = combat(section);
    assert.equal(sim.escapeRoute(data), 0);
  }
});

test('escaping inflicts only player damage and cannot record a victory', () => {
  const { sim, data } = combat(253);
  sim.escape();
  assert.equal(data.endurance, 96); assert.equal(data.enemy.endurance, 100);
  assert.equal(data.combatEffects.route, 277); assert.equal(data.history.length, 0);
});

test('door stopping and invisible Zagothal escape cost no round or EP', () => {
  for (const [section, route] of [[214,277],[221,70]]) {
    const { sim, data } = combat(section);
    data.nextInvisibility = true; sim.capture(data); sim.escape();
    assert.equal(data.endurance, 100); assert.equal(data.roundsThisBattle, 0);
    assert.equal(data.combatEffects.route, route);
  }
});

test('timed victories choose the correct three-round boundary and stop further rolls', () => {
  for (const [section, fast, slow] of [[40,248,160],[50,248,160],[75,248,160],[142,238,212],[206,17,160],[280,291,156],[316,248,160]]) {
    for (const rounds of [2,3]) {
      const { sim, data } = combat(section);
      data.roundsThisBattle = rounds; data.enemy.endurance = 1;
      sim.round(); assert.equal(data.combatEffects.route, rounds === 2 ? fast : slow);
      const before = data.endurance; sim.round(); assert.equal(data.endurance, before);
    }
  }
});

test('two jailers must both die before victory with no free player healing', () => {
  const { sim, data } = combat(212);
  data.enemy.name = 'First jailer 1 §212'; sim.capture(data);
  data.enemy.endurance = 1; sim.round();
  assert.equal(data.history.length, 0); assert.equal(data.enemy.skill, 16); assert.equal(data.enemy.endurance, 21);
  assert.equal(data.endurance, 96); assert.equal(data.roundsThisBattle, 1);
  data.enemy.endurance = 1; sim.round();
  assert.equal(data.history.length, 1); assert.equal(data.history[0].outcome, 'win');
  assert.equal(data.combatEffects.route, 80); assert.equal(data.endurance, 93);
});

test('click events do not activate the escape flag', () => {
  const { sim, data } = combat(62);
  sim.round({ type: 'click' }); assert.equal(data.enemy.endurance, 96);
});
