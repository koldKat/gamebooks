import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function fixture(saved) {
  const pt = saved ? { sim433: structuredClone(saved) } : {};
  const source = readFileSync(new URL('../../../public/js/battlesim/battlesim433.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
  const math = Object.create(Math);
  math.random = () => .2;
  const context = vm.createContext({ Math: math, currentPlaythrough: () => pt, saveState() {}, showAlert() {}, t: key => key, escapeHtml: value => value });
  vm.runInContext(source + '\n_renderAll = () => {}; globalThis.sim = { data: _data, potion: _useLaumspur, reset: _resetBattle, capture: _captureFightEffects, skill: _playerCS, round: _runRound };', context);
  return { sim: context.sim, data: context.sim.data(), math };
}

function combat(section) {
  const result = fixture();
  Object.assign(result.data, { rolled: true });
  Object.assign(result.data.player, { csBase: 20, ep: 100, epInitial: 100 });
  Object.assign(result.data.enemy, { name: 'Enemy §' + section, cs: 20, ep: 100, epMax: 100 });
  result.sim.capture(result.data);
  return result;
}

test('legacy fights are not migrated on opening', () => {
  const saved = JSON.parse(JSON.stringify(combat(119).data));
  delete saved.printedRules;
  delete saved.combatEffects;
  const { sim, data } = fixture(saved);
  assert.deepEqual(JSON.parse(JSON.stringify(data)), saved);
  sim.round();
  assert.equal(data.player.ep, 96);
});

test('future simultaneous death is a loss while legacy behavior is preserved', () => {
  for (const current of [true, false]) {
    const { sim, data } = combat(46);
    data.player.ep = data.enemy.ep = 1;
    if (!current) { delete data.printedRules; delete data.combatEffects; }
    sim.round();
    assert.equal(data.history[0].outcome, current ? 'loss' : 'win');
  }
});

test('future fights cannot revive a dead character with Laumspur', () => {
  const { sim, data } = combat(46);
  data.player.ep = 0;
  sim.potion();
  assert.equal(data.player.ep, 0);
  assert.equal(data.player.laumspurUsed, false);
});

test('living characters can still heal after winning', () => {
  const { sim, data } = combat(46);
  data.player.ep = 50;
  data.enemy.ep = 0;
  sim.potion();
  assert.equal(data.player.ep, 54);
});

test('temporary penalties expire after precisely their printed rounds', () => {
  for (const [section, rounds] of [[106, 3], [159, 3], [316, 3], [393, 1]]) {
    const { sim, data } = combat(section);
    data.roundsThisBattle = rounds;
    assert.equal(sim.skill(data), 18);
    data.roundsThisBattle++;
    assert.equal(sim.skill(data), 20);
  }
});

test('whole-fight penalties remain active', () => {
  for (const [section, penalty] of [[12, 2], [135, 2], [190, 2], [357, 2], [91, 4]]) {
    const { sim, data } = combat(section);
    data.roundsThisBattle = 20;
    assert.equal(sim.skill(data), 20 - penalty);
  }
});

test('Mindblast respects printed immunities and amplified Kuaraz effect', () => {
  for (const section of [12, 162, 299, 355, 375, 64, 110, 46]) {
    const { sim, data } = combat(section);
    data.player.mindBlast = true;
    data.nextMindshield = true;
    sim.capture(data);
    const bonus = [12, 162, 299, 355, 375].includes(section) ? 0 : [64, 110].includes(section) ? 4 : 2;
    assert.equal(sim.skill(data), 20 + bonus - (section === 12 ? 2 : 0));
  }
});

test('Mindshield prevents only the printed psychic penalties', () => {
  for (const [section, penalty] of [[194, 3], [299, 2], [353, 2], [355, 2]]) {
    const { sim, data } = combat(section);
    assert.equal(sim.skill(data), 20 - penalty);
    data.nextMindshield = true;
    sim.capture(data);
    assert.equal(sim.skill(data), 20);
  }
});

test('pending options do not change a started fight', () => {
  const { sim, data } = combat(57);
  data.nextPreviousElix = data.player.mindBlast = data.player.weaponBonus = true;
  assert.equal(sim.skill(data), 20);
  sim.capture(data);
  assert.equal(sim.skill(data), 26);
});

test('magic mace applies only to Dhorghaan', () => {
  for (const section of [253, 46]) {
    const { sim, data } = combat(section);
    data.nextMagicMace = true;
    sim.capture(data);
    assert.equal(sim.skill(data), section === 253 ? 25 : 20);
  }
});

test('first guard counterattack leaves its endurance unchanged in round one', () => {
  const { sim, data } = combat(4);
  sim.round();
  assert.equal(data.enemy.ep, 100);
  sim.round();
  assert.equal(data.enemy.ep, 96);
});

test('protection lasts exactly the printed number of rounds', () => {
  for (const [section, rounds] of [[119, 3], [280, 1], [334, 2]]) {
    const { sim, data } = combat(section);
    data.nextProtectedEntry = true;
    sim.capture(data);
    for (let i = 0; i < rounds; i++) sim.round();
    assert.equal(data.player.ep, 100);
    sim.round();
    assert.equal(data.player.ep, 96);
  }
});

test('tower guards have no protection without the section226 entry', () => {
  const { sim, data } = combat(334);
  sim.round();
  assert.equal(data.player.ep, 96);
});

test('Itikar damage is doubled, including section370', () => {
  for (const section of [240, 370]) {
    const { sim, data } = combat(section);
    sim.round();
    assert.equal(data.player.ep, 92);
  }
});

test('platform roll1 is fatal without damaging the guard', () => {
  const { sim, data, math } = combat(357);
  math.random = () => .1;
  sim.round();
  assert.equal(data.player.ep, 0);
  assert.equal(data.enemy.ep, 100);
  assert.equal(data.history[0].outcome, 'loss');
  assert.equal(data.combatEffects.route, 293);
});

test('forced stops never roll an extra round or record a false victory', () => {
  for (const [section, rounds, route] of [[20, 3, 82], [330, 2, 394], [361, 3, 382]]) {
    const { sim, data } = combat(section);
    for (let i = 0; i < rounds; i++) sim.round();
    const ep = data.player.ep;
    sim.round();
    assert.equal(data.roundsThisBattle, rounds);
    assert.equal(data.player.ep, ep);
    assert.equal(data.combatEffects.route, route);
    assert.equal(data.history.length, 0);
  }
});

test('one-round airborne attack selects the printed loss-comparison route', () => {
  for (const [cs, route] of [[18, 347], [20, 271], [22, 327]]) {
    const { sim, data } = combat(244);
    data.player.csBase = cs;
    sim.capture(data);
    sim.round();
    sim.round();
    assert.equal(data.roundsThisBattle, 1);
    assert.equal(data.combatEffects.route, route);
  }
});

test('winning timed encounters selects the correct route', () => {
  for (const [section, rounds, route] of [[4, 4, 165], [4, 5, 180], [91, 4, 65], [91, 5, 180], [168, 3, 101], [168, 4, 46], [355, 4, 249], [355, 5, 304]]) {
    const { sim, data } = combat(section);
    data.roundsThisBattle = rounds - 1;
    data.enemy.ep = 1;
    sim.round();
    assert.equal(data.combatEffects.route, route);
    assert.equal(data.history[0].outcome, 'win');
  }
});

test('winning rider or masked-warrior combat recovers half the fight losses', () => {
  for (const section of [20, 135]) {
    const { sim, data } = combat(section);
    data.enemy.ep = 1;
    sim.round();
    assert.equal(data.player.ep, 100 - Math.ceil(data.combatEffects.lostEP / 2));
  }
});

test('rider and masked-warrior defeats follow the nonfatal source section', () => {
  for (const section of [20, 135]) {
    const { sim, data } = combat(section);
    data.player.ep = 1;
    sim.round();
    assert.equal(data.combatEffects.route, 161);
    assert.equal(data.history[0].outcome, 'loss');
  }
});

test('explicit reset captures new rules without changing saved initial stats', () => {
  const saved = JSON.parse(JSON.stringify(combat(334).data));
  delete saved.printedRules;
  delete saved.combatEffects;
  saved.nextProtectedEntry = true;
  const { sim, data } = fixture(saved);
  sim.reset();
  assert.equal(data.combatEffects.protectedEntry, true);
  assert.equal(data.player.csBase, saved.player.csBase);
  assert.equal(data.player.epInitial, saved.player.epInitial);
});

test('new controls and outcome labels have translations', () => {
  const source = readFileSync(new URL('../../../public/js/i18n/en/battlesim/battlesim433.js', import.meta.url), 'utf8');
  const labels = vm.runInNewContext(source.replace('export default', 'globalThis.labels ='));
  for (const key of ['ui.next_fight', 'ui.mindshield', 'ui.previous_elix', 'ui.magic_mace', 'ui.protected_entry', 'ui.manual_effects', 'log.continue', 'log.recovered', 'log.knocked_out']) assert.equal(typeof labels['battlesim433.' + key], 'string');
});
