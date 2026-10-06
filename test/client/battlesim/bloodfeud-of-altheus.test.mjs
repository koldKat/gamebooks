import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function fixture(bookId = 400, saved) {
  const key = `sim${bookId}`;
  const pt = saved ? { [key]: structuredClone(saved) } : {};
  const source = readFileSync(new URL('../../../public/js/battlesim/engines/cretan.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '').replace(/^export /gm, '')
    .replace('return { init, render, setVisible };', '_renderAll = () => {}; return { data: _data, win: _finishWin, reset: _resetBattle, select: _applyEnemy };');
  const context = vm.createContext({ currentPlaythrough: () => pt, saveState() {}, t: k => k, escapeHtml: s => s });
  vm.runInContext(source, context);
  const sim = vm.runInContext(`createCretanSim({bookId:${bookId},idPrefix:'${key}',stateKey:'${key}',i18nPrefix:'${key}',defaultHonour:7})`, context);
  return { sim, data: sim.data() };
}

test('new Altheus fights heal survivors and award Honour only above zero', () => {
  for (const honour of [0, 1, 7]) {
    const { sim, data } = fixture();
    data.player.stage = 2;
    data.player.honour = honour;
    data.player.honourReward = 5;
    sim.win(data);
    assert.equal(data.player.stage, 0);
    assert.equal(data.player.honour, honour ? honour + 5 : 0);
    assert.equal(data.history[0].playerStage, 2);
  }
});

test('opening and finishing legacy fights preserves their original rules', () => {
  const fresh = fixture().data;
  delete fresh.printedCombatRules;
  fresh.player.stage = 2;
  fresh.player.honour = 0;
  fresh.player.honourReward = 5;
  fresh.roundsThisBattle = 4;
  fresh.log.push('Saved round');
  const saved = JSON.parse(JSON.stringify(fresh));
  const { sim, data } = fixture(400, saved);
  assert.deepEqual(JSON.parse(JSON.stringify(data)), saved);
  sim.win(data);
  assert.equal(data.player.stage, 2);
  assert.equal(data.player.honour, 5);
});

test('new enemy selection or explicit reset opts legacy state into corrected fights', () => {
  for (const start of ['select', 'reset']) {
    const old = fixture().data;
    delete old.printedCombatRules;
    const { sim, data } = fixture(400, old);
    if (start === 'select') sim.select(data, { name: 'Wolf', attack: 2, defense: 12, pb: 0 });
    else sim.reset();
    assert.equal(data.printedCombatRules, 1);
    data.player.stage = 1;
    data.player.honour = 0;
    data.player.honourReward = 3;
    sim.win(data);
    assert.equal(data.player.stage, 0);
    assert.equal(data.player.honour, 0);
  }
});

test('approved new fights in 401 and 402 heal and prohibit Honour at zero', () => {
  for (const id of [401, 402]) {
    const { sim, data } = fixture(id);
    assert.equal(data.printedCombatRules, 1);
    data.player.stage = 2;
    data.player.honour = 0;
    data.player.honourReward = 4;
    sim.win(data);
    assert.equal(data.player.stage, 0);
    assert.equal(data.player.honour, 0);
  }
});

test('legacy 401 and 402 fights retain their saved rules and character values', () => {
  for (const id of [401, 402]) {
    const saved = fixture(id).data;
    delete saved.printedCombatRules;
    saved.player.stage = 2;
    saved.player.honour = 0;
    saved.player.honourReward = 4;
    const expected = JSON.parse(JSON.stringify(saved));
    const { sim, data } = fixture(id, expected);
    assert.deepEqual(JSON.parse(JSON.stringify(data)), expected);
    sim.win(data);
    assert.equal(data.player.stage, 2);
    assert.equal(data.player.honour, 4);
  }
});

for (const id of [401, 402]) {
test(`${id} carries wounds only when captured for the next fight`, () => {
  const { sim, data } = fixture(id);
  data.nextCarryWounds = true;
  sim.select(data, { name: 'Ant', attack: 2, defense: 8, pb: 0 });
  assert.equal(data.carryWounds, true);
  data.player.stage = 2;
  data.player.honour = 0;
  data.player.honourReward = 4;
  data.nextCarryWounds = false;
  sim.win(data);
  assert.equal(data.player.stage, 2);
  assert.equal(data.player.honour, 0);
  assert.equal(data.history[0].playerStage, 2);
  sim.select(data, { name: 'Wolf', attack: 3, defense: 9, pb: 0 });
  assert.equal(data.player.stage, 2);
  assert.equal(data.carryWounds, false);
  sim.win(data);
  assert.equal(data.player.stage, 0);
});
}

test('changing next-fight options never changes the current or legacy fight', () => {
  for (const id of [400, 401, 402]) {
    const saved = fixture(id).data;
    delete saved.printedCombatRules;
    saved.player.stage = 2;
    const { sim, data } = fixture(id, saved);
    data.nextCarryWounds = true;
    sim.win(data);
    assert.equal(data.player.stage, 2);
    assert.equal(data.carryWounds, undefined);
  }
});
