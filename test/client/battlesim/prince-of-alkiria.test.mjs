import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function fixture(saved) {
  const pt = saved ? { sim412: structuredClone(saved) } : {};
  const strip = source => source.replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
  const engine = strip(readFileSync(new URL('../../../public/js/battlesim/engines/alkiria.js', import.meta.url), 'utf8'));
  const source = strip(readFileSync(new URL('../../../public/js/battlesim/battlesim412.js', import.meta.url), 'utf8'));
  const context = vm.createContext({ currentPlaythrough: () => pt, saveState() {}, t: key => key, escapeHtml: value => value });
  vm.runInContext(engine + '\n' + source + '\n_renderAll = () => {}; globalThis.sim = { data: _data, start: _startBattle, strike: _strikeOnce, end: _checkEnd, pick: _pickEnemy, resolve: resolveStrike };', context);
  return { sim: context.sim, data: context.sim.data() };
}

test('starting future fights preserves current LIFE instead of restoring initial LIFE', () => {
  const { sim, data } = fixture();
  data.player.lp = 17;
  data.player.startLp = 58;
  sim.start();
  assert.equal(data.player.lp, 17);
  assert.equal(data.player.startLp, 58);
  assert.equal(data.printedCombatRules, 1);
});

test('future simultaneous deaths are losses; legacy fights keep their saved resolution', () => {
  for (const future of [false, true]) {
    const { sim, data } = fixture();
    if (future) sim.start();
    data.player.lp = 0;
    data.enemy.hp = 0;
    sim.end(data);
    assert.equal(data.winner, future ? 'enemy' : 'player');
    assert.equal(data.history[0].outcome, future ? 'loss' : 'win');
  }
});

test('Alvian bonus is captured for future fights without changing character values', () => {
  const { sim, data } = fixture();
  data.nextCompanionBonus = true;
  sim.start();
  assert.equal(data.companionBonus, 5);
  assert.equal(data.player.lp, 58);
  data.nextCompanionBonus = false;
  assert.equal(data.companionBonus, 5);
  assert.equal(sim.resolve(58, 14, 4, data.companionBonus).playerStr, 12);
  sim.start();
  assert.equal(data.companionBonus, 0);
});

test('strength bonus remains independent of changing LIFE tiers', () => {
  const { sim } = fixture();
  for (const [lp, strength] of [[58,7],[40,5],[26,5],[25,3],[11,3],[10,1],[1,1]]) {
    assert.equal(sim.resolve(lp, 14, 4).playerStr, strength);
    assert.equal(sim.resolve(lp, 14, 4, 5).playerStr, strength + 5);
  }
});

test('opening legacy fights does not migrate settings or character values', () => {
  const old = fixture().data;
  old.player.lp = 13;
  old.started = true;
  old.log.push('Saved round');
  const expected = JSON.parse(JSON.stringify(old));
  const { data } = fixture(expected);
  assert.deepEqual(JSON.parse(JSON.stringify(data)), expected);
  assert.equal(data.printedCombatRules, undefined);
});

test('starting at zero LIFE cannot resurrect a character', () => {
  const { sim, data } = fixture();
  data.player.lp = 0;
  sim.start();
  assert.equal(data.player.lp, 0);
  assert.equal(data.over, true);
  assert.equal(data.winner, 'enemy');
});
