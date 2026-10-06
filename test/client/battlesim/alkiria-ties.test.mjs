import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function fixture(id, saved) {
  const pt = saved ? { ['sim' + id]: structuredClone(saved) } : {};
  const source = readFileSync(new URL(`../../../public/js/battlesim/battlesim${id}.js`, import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
  const math = Object.create(Math);
  math.random = () => 0.5;
  const context = vm.createContext({ Math: math, currentPlaythrough: () => pt, saveState() {}, t: key => key, escapeHtml: value => value });
  vm.runInContext(source + '\n_renderAll = () => {}; globalThis.sim = { data: _data, exchange: _exchange, reset: _resetBattle, roll: () => _rollTable(_data()) };', context);
  return { sim: context.sim, data: context.sim.data(), setRandom: value => { math.random = () => value; } };
}

for (const id of [414, 415, 416]) {
  test(`${id}: twentieth tied exchange cannot damage either fighter in future fights`, () => {
    const { sim, data } = fixture(id);
    Object.assign(data.enemy, { skill: 10, endurance: 20, enduranceMax: 20 });
    sim.exchange();
    assert.equal(data.player.endurance, 50);
    assert.equal(data.enemy.endurance, 20);
    assert.equal(data.history.length, 0);
  });

  test(`${id}: legacy saved fights retain their existing resolution until reset`, () => {
    const old = fixture(id).data;
    delete old.printedCombatRules;
    delete old.chanceRollRange;
    Object.assign(old.enemy, { skill: 10, endurance: 20, enduranceMax: 20 });
    const expected = JSON.parse(JSON.stringify(old));
    const { sim, data } = fixture(id, expected);
    assert.deepEqual(JSON.parse(JSON.stringify(data)), expected);
    sim.exchange();
    assert.equal(data.player.endurance, 48);
    sim.reset();
    assert.equal(data.printedCombatRules, 1);
    sim.exchange();
    assert.equal(data.player.endurance, 50);
  });

  test(`${id}: new fights roll all twelve outcomes uniformly`, () => {
    const { sim, setRandom, data } = fixture(id);
    assert.equal(data.chanceRollRange, 12);
    for (let value = 0; value < 12; value++) {
      setRandom((value + 0.5) / 12);
      assert.equal(sim.roll(), value + 1);
    }
    setRandom(0);
    assert.equal(sim.roll(), 1);
    setRandom(1 - Number.EPSILON);
    assert.equal(sim.roll(), 12);
  });

  test(`${id}: existing fights keep their roll range until explicitly restarted`, () => {
    const old = fixture(id).data;
    delete old.chanceRollRange;
    const expected = JSON.parse(JSON.stringify(old));
    const { sim, data, setRandom } = fixture(id, expected);
    assert.deepEqual(JSON.parse(JSON.stringify(data)), expected);
    setRandom(0);
    assert.equal(sim.roll(), 0);
    setRandom(1 - Number.EPSILON);
    assert.equal(sim.roll(), 9);
    sim.reset();
    assert.equal(data.chanceRollRange, 12);
    assert.equal(sim.roll(), 12);
  });
}
