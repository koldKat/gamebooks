import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function fixture(saved) {
  const source = readFileSync(new URL('../../../public/js/battlesim/battlesim378.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
  const pt = saved ? { sim378: structuredClone(saved) } : {};
  const context = vm.createContext({ currentPlaythrough: () => pt, saveState: () => {}, t: k => k, escapeHtml: s => s });
  vm.runInContext(source + '\n_renderAll = () => {};', context);
  const run = s => vm.runInContext(s, context);
  const d = run('_data()');
  return { run, d };
}

function followup(saved) {
  const f = fixture(saved);
  Object.assign(f.d.enemy, { name: 'Test', endurance: 50, enduranceMax: 50, defHand: 12, defKick: 12 });
  f.d.player.defense = 0;
  f.d.pendingThrowFollowup = true;
  f.run('Math.random = () => 0');
  return f;
}

test('New Inferno fights counter missed hand and kick follow-ups once', () => {
  for (const tech of ['hand', 'kick']) {
    const f = followup();
    f.run(`_throwFollowup('${tech}')`);
    assert.equal(f.d.pendingThrowFollowup, false);
    assert.equal(f.d.pendingEnemyHit.dmg, 1);
    assert.equal(f.d.player.endurance, 20);
    assert.equal(f.d.enemy.endurance, 50);
    f.run('_throwFollowup("hand")');
    assert.equal(f.d.log.length, 3);
  }
});

test('Legacy Inferno load and reset retain existing behavior', () => {
  const saved = JSON.parse(JSON.stringify(followup().d));
  delete saved.counterAfterMissedFollowup;
  const f = fixture(saved);
  assert.deepEqual(JSON.parse(JSON.stringify(f.d)), saved);
  f.run('Math.random = () => 0; _throwFollowup("hand")');
  assert.equal(f.d.pendingEnemyHit, null);
  f.run('_resetBattle()');
  assert.equal(f.d.counterAfterMissedFollowup, undefined);
});

test('Corrected Inferno fights preserve the flag on reload', () => {
  const f = fixture(JSON.parse(JSON.stringify(followup().d)));
  f.run('Math.random = () => 0; _throwFollowup("hand")');
  assert.equal(f.d.pendingEnemyHit.dmg, 1);
});

test('New enemy opts in without altering endurance or Inner Force', () => {
  const f = followup();
  delete f.d.counterAfterMissedFollowup;
  f.d.player.endurance = 11;
  f.d.player.innerForce = 2;
  f.run('_startEnemyFight(_data(), {name:"Cyclops",hp:19,pb:2,defense:0,attack:6})');
  assert.equal(f.d.counterAfterMissedFollowup, true);
  assert.equal(f.d.player.endurance, 11);
  assert.equal(f.d.player.innerForce, 2);
  assert.equal(f.d.pendingEnemyHit, null);
  assert.equal(f.d.pendingThrowFollowup, false);
});

test('Tied counters miss; successful follow-ups preserve book-specific damage', () => {
  const miss = followup();
  miss.d.player.defense = 2;
  miss.run('_throwFollowup("hand")');
  assert.equal(miss.d.pendingEnemyHit, null);
  for (const [tech, remaining] of [['hand', 45], ['kick', 43]]) {
    const hit = followup();
    hit.d.enemy[tech === 'hand' ? 'defHand' : 'defKick'] = 0;
    hit.run(`_throwFollowup('${tech}')`);
    assert.equal(hit.d.enemy.endurance, remaining);
    assert.equal(hit.d.pendingEnemyHit.dmg, 1);
  }
});

test('Defeated Inferno enemies cannot counter', () => {
  const f = followup();
  f.d.enemy.defHand = 0;
  f.d.enemy.endurance = 1;
  f.run('_throwFollowup("hand")');
  assert.equal(f.d.enemy.endurance, 0);
  assert.equal(f.d.pendingEnemyHit, null);
  assert.equal(f.d.history.length, 1);
});
