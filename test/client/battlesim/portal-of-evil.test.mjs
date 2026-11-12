import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from './simulator-source.mjs';
import vm from 'node:vm';
import { createCombat } from '../../../public/js/battlesim/books/233/combat.js';
import { createState } from '../../../public/js/battlesim/books/233/state.js';

const source = readFileSync(new URL('../../../public/js/battlesim/battlesim233.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replace(/^export /gm, '');

function fixture(saved) {
  const pt = saved ? { sim233: structuredClone(saved) } : {};
  const context = vm.createContext({ currentPlaythrough: () => pt, saveState: () => {}, t: k => k,
    structuredClone, escapeHtml: value => String(value) });
  vm.runInContext(source + '\n_renderAll = () => {};', context);
  const run = s => vm.runInContext(s, context);
  return { run, d: run('_data()') };
}

test('new characters start with two meals', () => {
  const f = fixture();
  assert.equal(f.d.player.provisionsLeft, 2);
  f.run('_data()');
  assert.equal(f.d.player.provisionsLeft, 2);
});

test('existing supplies, stats and saved fights remain unchanged', () => {
  const saved = JSON.parse(JSON.stringify(fixture().d));
  Object.assign(saved.player, { skill: 9, stamina: 12, luck: 7, provisionsLeft: 7 });
  Object.assign(saved.enemy, { name: 'Koailit', skill: 6, stamina: 2, staminaMax: 3 });
  saved.rolled = true;
  saved.pendingLuckQueue = [{ kind: 'enemy-hit' }];
  saved.history = [{ enemy: 'Goblin', outcome: 'win', ts: 123 }];
  saved.log = ['Existing round'];
  assert.deepEqual(JSON.parse(JSON.stringify(fixture(saved).d)), saved);
});

test('older characters with no meal field keep the legacy default', () => {
  const saved = JSON.parse(JSON.stringify(fixture().d));
  delete saved.player.provisionsLeft;
  assert.equal(fixture(saved).d.player.provisionsLeft, 10);
});

test('new characters consume their two meals and no more', () => {
  const f = fixture();
  Object.assign(f.d.player, { stamina: 1, staminaInitial: 20 });
  f.d.rolled = true;
  f.run('_eatProvisions(); _eatProvisions()');
  assert.equal(f.d.player.provisionsLeft, 0);
  assert.equal(f.d.player.stamina, 9);
  const before = JSON.stringify(f.d);
  f.run('_eatProvisions()');
  assert.equal(JSON.stringify(f.d), before);
});

function fight(enemy, roster = [enemy]) {
  const f = fixture();
  Object.assign(f.d.player, { skill: 12, skillInitial: 12, stamina: 40, staminaInitial: 40, luck: 0 });
  f.d.rolled = true;
  f.run(`_selectEncounter(_data(), ${JSON.stringify(enemy)}, ${JSON.stringify(roster)})`);
  f.roll = values => f.run(`globalThis.rolls=${JSON.stringify(values)}; _roll2d6=()=>{if(!rolls.length)throw Error('missing roll');return rolls.shift()}; _runRound()`);
  return f;
}

const metamaggot = { id: 1, name: 'METAMAGGOT §125', attack: 6, hp: 7,
  stats: { rules: { roundLimit: 4, limitDestination: 321 } } };
const warriors = [
  { id: 2, name: 'First SLAVE WARRIOR §280', attack: 5, hp: 7,
    stats: { rules: { pairedOpponentId: 3, defeatableSide: true } } },
  { id: 3, name: 'Second SLAVE WARRIOR §280', attack: 4, hp: 7,
    stats: { rules: { pairedOpponentId: 2, defeatableSide: true } } },
];

test('Metamaggot pauses after four rounds without recording a win or loss', () => {
  const f = fight(metamaggot);
  f.d.player.skill = 6;
  for (let i = 0; i < 4; i++) f.roll([7, 7]);
  assert.equal(f.d.encounterStopped, 'paused');
  assert.equal(f.d.roundsThisBattle, 4);
  assert.equal(f.d.history.length, 0);
  const saved = JSON.stringify(f.d);
  f.roll([]);
  assert.equal(JSON.stringify(f.d), saved);
  assert.deepEqual(JSON.parse(JSON.stringify(fixture(f.d).d)), JSON.parse(saved));
  f.run('_resetBattle()');
  assert.equal(f.d.roundsThisBattle, 0);
  assert.equal(f.d.encounterStopped, undefined);
  assert.equal(f.d.enemy.stamina, 7);
});

test('fourth-round luck is resolved before interruption and can still win', () => {
  const f = fight(metamaggot);
  f.d.roundsThisBattle = 3;
  f.d.enemy.stamina = 4;
  f.d.player.luck = 10;
  f.roll([12, 2]);
  assert.equal(f.d.encounterStopped, undefined);
  assert.equal(f.d.pendingLuckQueue.length, 1);
  f.run('globalThis.rolls=[2]; _testLuck()');
  assert.equal(f.d.encounterStopped, 'win');
  assert.equal(f.d.history.length, 1);
});

test('declining fourth-round luck pauses the surviving encounter', () => {
  const f = fight(metamaggot);
  f.d.roundsThisBattle = 3;
  f.roll([12, 2]);
  f.run('_skipLuck()');
  assert.equal(f.d.encounterStopped, 'paused');
  assert.equal(f.d.history.length, 0);
});

test('both Slave Warriors attack, and the second survives the first kill', () => {
  const f = fight(warriors[0], warriors);
  f.d.enemy.stamina = 1;
  f.roll([12, 2, 2, 12]);
  assert.equal(f.d.player.stamina, 38);
  assert.equal(f.d.history.length, 0);
  f.run('_skipLuck()');
  assert.equal(f.d.enemy.name, warriors[1].name);
  assert.equal(f.d.enemy.stamina, 7);
  assert.equal(f.d.pairedFight, false);
  f.d.enemy.stamina = 1;
  f.roll([12, 2]);
  assert.equal(f.d.encounterStopped, 'win');
  assert.equal(f.d.history.length, 1);
  assert.match(f.d.history[0].enemy, /First SLAVE WARRIOR.*Second SLAVE WARRIOR/);
  f.run('_resetBattle()');
  assert.equal(f.d.enemy.name, warriors[0].name);
  assert.equal(f.d.sideEnemy.stamina, 7);
  assert.equal(f.d.pairedFight, true);
});

test('changing targets preserves both health totals and cannot bypass a luck decision', () => {
  const f = fight(warriors[0], warriors);
  f.d.enemy.stamina = 3;
  f.d.sideEnemy.stamina = 5;
  f.run('_swapTarget(_data())');
  assert.equal(f.d.enemy.name, warriors[1].name);
  assert.equal(f.d.enemy.stamina, 5);
  assert.equal(f.d.sideEnemy.stamina, 3);
  f.d.pendingLuckQueue = [{ kind: 'side-hit' }];
  const before = JSON.stringify(f.d);
  f.run('_swapTarget(_data())');
  assert.equal(JSON.stringify(f.d), before);
  assert.deepEqual(JSON.parse(JSON.stringify(fixture(f.d).d)), JSON.parse(before));
});

test('a fatal side attack takes precedence over defeating the targeted warrior', () => {
  const f = fight(warriors[0], warriors);
  f.d.player.stamina = 1;
  f.d.enemy.stamina = 1;
  f.roll([12, 2, 2, 12]);
  assert.equal(f.d.encounterStopped, 'loss');
  assert.equal(f.d.history.length, 1);
  assert.equal(f.d.history[0].outcome, 'loss');
});

test('legacy Tree Man branch combat still ends when its main opponent falls', () => {
  const f = fight({ id: 4, name: 'TREE MAN §155', attack: 5, hp: 1 });
  f.d.pairedFight = true;
  f.d.sideEnemy = { name: 'Branch', skill: 1, staminaMax: 9 };
  f.roll([12, 2, 12, 2]);
  assert.equal(f.d.encounterStopped, 'win');
  assert.equal(f.d.history.length, 1);
});

test('actual injected factories complete a pair only after both opponents fall', () => {
  const pt = {};
  let rolls = [];
  const ctx = { MAX_PROVISIONS: 10, STARTING_PROVISIONS: 2, SIDE_WOUND_DMG: 2,
    currentPlaythrough: () => pt, saveState() {}, _renderAll() {}, t: key => key,
    escapeHtml: String, SVG_TROPHY: '', SVG_SKULL: '' };
  Object.assign(ctx, createState(() => ctx), createCombat(() => ctx));
  ctx._roll2d6 = () => { assert.ok(rolls.length); return rolls.shift(); };
  const d = ctx._data();
  Object.assign(d.player, { skill: 12, skillInitial: 12, stamina: 20, staminaInitial: 20 });
  d.rolled = true;
  ctx._selectEncounter(d, warriors[0], warriors);
  d.enemy.stamina = 1;
  rolls = [12, 2, 12, 2];
  ctx._runRound();
  assert.equal(d.enemy.name, warriors[1].name);
  assert.equal(d.history.length, 0);
  d.enemy.stamina = 1;
  rolls = [12, 2];
  ctx._runRound();
  assert.equal(d.history.length, 1);
  assert.equal(d.history[0].outcome, 'win');
});
