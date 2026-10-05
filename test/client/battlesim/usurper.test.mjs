import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function fixture(saved) {
  const source = readFileSync(new URL('../../../public/js/battlesim/battlesim370.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
  const pt = saved ? { sim370: structuredClone(saved) } : {};
  const context = vm.createContext({ currentPlaythrough: () => pt, saveState: () => {}, t: k => k, escapeHtml: s => s });
  vm.runInContext(source + '\n_renderAll = () => {};', context);
  const run = s => vm.runInContext(s, context);
  return { run, d: run('_data()') };
}

function followup(saved) {
  const f = fixture(saved);
  Object.assign(f.d.enemy, { name: 'Test', endurance: 50, enduranceMax: 50, defHand: 12, defKick: 12 });
  f.d.player.defense = 0;
  f.d.pendingThrowFollowup = true;
  f.run('Math.random = () => 0');
  return f;
}

test('New fights counter after a missed hand or kick follow-up, without immediately taking damage', () => {
  for (const technique of ['hand', 'kick']) {
    const f = followup();
    f.run(`_throwFollowup('${technique}')`);
    assert.equal(f.d.pendingThrowFollowup, false);
    assert.equal(f.d.pendingEnemyHit.dmg, 1);
    assert.equal(f.d.player.endurance, 20);
    assert.equal(f.d.enemy.endurance, 50);
    f.run('_throwFollowup("hand")');
    assert.equal(f.d.log.length, 3);
  }
});

test('Legacy fights remain identical on load and keep the previous missed-follow-up behavior', () => {
  const saved = JSON.parse(JSON.stringify(followup().d));
  delete saved.counterAfterMissedFollowup;
  const f = fixture(saved);
  assert.deepEqual(JSON.parse(JSON.stringify(f.d)), saved);
  f.run('Math.random = () => 0; _throwFollowup("hand")');
  assert.equal(f.d.pendingEnemyHit, null);
  assert.equal(f.d.counterAfterMissedFollowup, undefined);
});

test('Corrected flag survives reload; resetting a legacy fight does not opt it in', () => {
  const saved = JSON.parse(JSON.stringify(followup().d));
  const loaded = fixture(saved);
  loaded.run('Math.random = () => 0; _throwFollowup("hand")');
  assert.equal(loaded.d.pendingEnemyHit.dmg, 1);
  delete saved.counterAfterMissedFollowup;
  const legacy = fixture(saved);
  legacy.run('_resetBattle()');
  assert.equal(legacy.d.counterAfterMissedFollowup, undefined);
});

test('Selecting a new enemy opts in without changing saved character values', () => {
  const f = followup();
  delete f.d.counterAfterMissedFollowup;
  f.d.player.endurance = 11;
  f.d.player.innerForce = 2;
  f.run('_startEnemyFight(_data(), { name: "Golem", hp: 25, pb: 2, defense: 0, attack: 4 })');
  assert.equal(f.d.counterAfterMissedFollowup, true);
  assert.equal(f.d.player.endurance, 11);
  assert.equal(f.d.player.innerForce, 2);
  assert.equal(f.d.pendingThrowFollowup, false);
  assert.equal(f.d.pendingEnemyHit, null);
});

test('Counterattack ties still miss; successful follow-up still counters only once', () => {
  const miss = followup();
  miss.d.player.defense = 2;
  miss.run('_throwFollowup("hand")');
  assert.equal(miss.d.pendingEnemyHit, null);
  const hit = followup();
  hit.d.enemy.defHand = 0;
  hit.run('_throwFollowup("hand")');
  assert.equal(hit.d.enemy.endurance, 45);
  assert.equal(hit.d.pendingEnemyHit.dmg, 1);
  assert.equal(hit.d.log.length, 3);
});

test('Defeated enemies cannot counter after a successful follow-up', () => {
  const f = followup();
  f.d.enemy.defHand = 0;
  f.d.enemy.endurance = 1;
  f.run('_throwFollowup("hand")');
  assert.equal(f.d.enemy.endurance, 0);
  assert.equal(f.d.pendingEnemyHit, null);
  assert.equal(f.d.history.length, 1);
});
