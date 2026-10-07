import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function fixture(saved) {
  const pt = saved ? { sim437: structuredClone(saved) } : {};
  const source = readFileSync(new URL('../../../public/js/battlesim/battlesim437.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
  const math = Object.create(Math);
  math.random = () => .2;
  const context = vm.createContext({ Math: math, currentPlaythrough: () => pt, saveState() {}, showAlert() {}, t: (key, args = {}) => key === 'battlesim437.ui.next_pair' ? `Pair ${args.pair} §${args.section}` : key, escapeHtml: value => value });
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

test('opening legacy fights changes neither saved state nor rules', () => {
  const saved = JSON.parse(JSON.stringify(combat(82).data));
  delete saved.printedRules; delete saved.combatEffects;
  const { sim, data } = fixture(saved);
  assert.deepEqual(JSON.parse(JSON.stringify(data)), saved);
  sim.round(); assert.equal(data.endurance, 95);
});

test('future simultaneous death loses, legacy outcome remains unchanged', () => {
  for (const future of [true, false]) {
    const { sim, data } = combat(3);
    data.endurance = data.enemy.endurance = 1;
    if (!future) { delete data.printedRules; delete data.combatEffects; }
    sim.round(); assert.equal(data.history[0].outcome, future ? 'loss' : 'win');
  }
});

test('potions cannot resurrect or heal midfight', () => {
  const { sim, data } = combat(3);
  data.endurance = 0; sim.potion(); assert.equal(data.endurance, 0);
  data.endurance = 50; data.roundsThisBattle = 1; sim.potion(); assert.equal(data.endurance, 50);
  data.enemy.endurance = 0; sim.potion(); assert.equal(data.endurance, 54);
});

test('next-fight edits do not change captured options', () => {
  const { sim, data } = combat(85);
  data.nextAnimal = true; assert.equal(sim.skill(data), 20);
  sim.capture(data); assert.equal(sim.skill(data), 22);
});

test('both-psychic immunity blocks bonuses and Psi cost', () => {
  for (const section of [10,32,82,128,327]) {
    const { sim, data } = combat(section);
    const skill = sim.skill(data);
    data.nextPsychic = 'surge'; sim.capture(data); assert.equal(sim.skill(data), skill);
    data.nextPsychic = 'blast'; sim.capture(data); assert.equal(sim.skill(data), skill);
  }
});

test('Mindblast-only immunity allows Psi-surge', () => {
  for (const section of [46,116,129,220,249,277,336]) {
    const { sim, data } = combat(section);
    data.nextPsychic = 'blast'; sim.capture(data); const skill = sim.skill(data);
    data.nextPsychic = 'surge'; sim.capture(data); assert.equal(sim.skill(data), skill + 4);
  }
});

test('Psi-surge costs two EP separately and stops at six EP', () => {
  const { sim, data } = combat(3);
  data.nextPsychic = 'surge'; sim.capture(data); sim.round(); assert.equal(data.endurance, 95);
  data.endurance = 6; assert.equal(sim.skill(data), 20);
  sim.round(); assert.equal(data.endurance, 2);
});

test('Krokarix and scouts ignore the first two combat losses, not Psi cost', () => {
  for (const section of [46,116,285]) {
    const { sim, data } = combat(section);
    data.nextPsychic = 'surge'; sim.capture(data);
    sim.round(); sim.round(); assert.equal(data.endurance, 96);
    sim.round(); assert.equal(data.endurance, 91);
  }
});

test('undead take doubled Sommerwerd combat losses', () => {
  for (const section of [97,104,166,191,254,301,322]) {
    const plain = combat(section); plain.sim.round();
    const sword = combat(section); sword.data.nextSommerwerd = true; sword.sim.capture(sword.data); sword.sim.round();
    assert.equal(100 - sword.data.enemy.endurance, (100 - plain.data.enemy.endurance) * 2);
  }
});

test('sky-snake doubles loss and stops after four rounds without a win', () => {
  const { sim, data } = combat(82);
  data.nextTracking = true; sim.capture(data);
  sim.round(); assert.equal(data.endurance, 92);
  for (let i = 0; i < 3; i++) sim.round();
  assert.equal(data.combatEffects.route, 151); assert.equal(data.history.length, 0);
  sim.round(); assert.equal(data.roundsThisBattle, 4);
});

test('sky-snake fourth-round victory uses the victory route', () => {
  const { sim, data } = combat(82);
  data.nextTracking = true; sim.capture(data); data.roundsThisBattle = 3; data.enemy.endurance = 1;
  sim.round(); assert.equal(data.combatEffects.route, 247);
});

test('printed skill effects match encounter prerequisites', () => {
  for (const [section, base, option, enhanced] of [[82,18,'Tracking',20],[97,17,'Tracking',20],[104,17,'Divination',20],[129,18,'Animal',20],[85,20,'Animal',22],[244,20,'Animal',22]]) {
    const { sim, data } = combat(section);
    assert.equal(sim.skill(data), base); data['next' + option] = true; sim.capture(data); assert.equal(sim.skill(data), enhanced);
  }
  assert.equal(combat(166).sim.skill(combat(166).data), 22);
  assert.equal(combat(214).sim.skill(combat(214).data), 28);
});

test('first-two-round rider skill penalty expires', () => {
  const { sim, data } = combat(148);
  assert.equal(sim.skill(data), 18); data.roundsThisBattle = 2; assert.equal(sim.skill(data), 20);
});

test('unarmed guards honor Tutelary skill and four-round limit', () => {
  for (const section of [182,316]) {
    const { sim, data } = combat(section);
    assert.equal(sim.skill(data), 16); data.nextTutelary = true; sim.capture(data); assert.equal(sim.skill(data), 18);
    data.roundsThisBattle = 4; assert.equal(sim.skill(data), section === 182 ? 20 : 18);
  }
});

test('paired guards are sequential, preserving current EP and last-two Sogh bonus', () => {
  for (const section of [238,309]) {
    const { sim, data } = combat(section);
    assert.equal(sim.skill(data), section === 238 ? 22 : 20);
    data.enemy.endurance = 1; sim.round();
    assert.equal(data.history.length, 0); assert.equal(data.enemy.skill, 18); assert.equal(data.enemy.endurance, 32);
    assert.equal(sim.skill(data), 22); const ep = data.endurance;
    data.enemy.endurance = 1; sim.round();
    assert.ok(data.endurance <= ep); assert.equal(data.history.length, 0);
    assert.equal(data.enemy.skill, section === 238 ? 17 : 20);
    data.enemy.endurance = 1; sim.round(); assert.equal(data.history.length, 1); assert.equal(data.combatEffects.route, 177);
    sim.reset(); assert.equal(data.combatEffects.phase, 0); assert.equal(data.enemy.name, 'Enemy §' + section);
  }
});

test('selecting later paired guards does not resurrect earlier pairs', () => {
  for (const [section, name, phase] of [[238,'Пазачи на кулата 3 и 4',1],[238,'Пазачи на кулата 5 и 6',2],[309,'Пазач на кулата и сержант',2]]) {
    const { sim, data } = combat(section);
    data.enemy.name = name + ' §' + section; sim.capture(data); assert.equal(data.combatEffects.phase, phase);
  }
});

test('round-dependent victory routes preserve printed thresholds', () => {
  for (const [section, early, late] of [[3,117,276],[104,228,322],[244,306,148]]) {
    for (const rounds of [2,3]) {
      const { sim, data } = combat(section); data.roundsThisBattle = rounds; data.enemy.endurance = 1;
      sim.round(); assert.equal(data.combatEffects.route, rounds === 2 ? early : late);
    }
  }
});

test('immediate escapes do not consume a combat round', () => {
  for (const [section, route] of [[36,328],[86,328],[260,328],[119,49],[217,334]]) {
    const { sim, data } = combat(section); sim.escape();
    assert.equal(data.roundsThisBattle, 0); assert.equal(data.endurance, 100); assert.equal(data.combatEffects.route, route);
  }
});

test('mercenary escape requires one round and incurs only player loss', () => {
  for (const section of [98,127,308]) {
    const { sim, data } = combat(section);
    assert.equal(sim.escapeRoute(data), 0); sim.round(); const enemy = data.enemy.endurance;
    sim.escape(); assert.equal(data.enemy.endurance, enemy); assert.equal(data.endurance, 92); assert.equal(data.combatEffects.route, 223);
  }
});

test('ordinary click events are not mistaken for escape rounds', () => {
  const { sim, data } = combat(3); sim.round({ type: 'click' }); assert.equal(data.enemy.endurance, 96);
});
