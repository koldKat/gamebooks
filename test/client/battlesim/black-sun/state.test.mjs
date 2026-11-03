import test from 'node:test';
import assert from 'node:assert/strict';
import {blackSunPlayer, blackSunStart, blackSunRound, blackSunCancel} from '../../../../public/js/battlesim/engines/black-sun/combat.js';
import {createBlackSunState, emptyBlackSunState, rememberBlackSunFight} from '../../../../public/js/battlesim/engines/black-sun/state.js';

const definition = {id: 1525, stateKey: 'sim1525'};
const fight = (extra = {}) => blackSunStart(blackSunPlayer(), {label: 'Printed enemy', section: '161',
  attack: 10, defense: 9, opponents: [{resistance: 1}], ...extra});
const page = {base: 6, attack: 6, defense: 6, moon: 'new'};

test('history records each real result once, with increasing timestamps across reloads', () => {
  const state = emptyBlackSunState(); state.fight = blackSunRound(fight(), page);
  rememberBlackSunFight(state, 100); assert.equal(state.history.length, 1); assert.equal(state.history[0].outcome, 'win');
  const reloaded = JSON.parse(JSON.stringify(state)); rememberBlackSunFight(reloaded, 100);
  assert.equal(reloaded.history.length, 1);
  reloaded.fight = blackSunRound(fight(), page); rememberBlackSunFight(reloaded, 99);
  assert.equal(reloaded.history[1].ts, 101);
});

test('paused instructions and cancelled fights never invent XP-eligible results', () => {
  const state = emptyBlackSunState();
  state.fight = blackSunRound(fight({events: [{id: 'instruction', round: 1, phase: 'before-round', section: '901'}]}), page);
  rememberBlackSunFight(state); assert.equal(state.history.length, 0);
  state.fight = blackSunCancel(state.fight); rememberBlackSunFight(state); assert.equal(state.history.length, 0);
});

test('stale dialog callbacks cannot save over another book, playthrough or newer state', () => {
  let saves = 0, run = {}, bookId = 1525;
  const store = createBlackSunState(() => ({run, bookId, definition, saveState: () => saves++}));
  const first = store.snapshot(); run = {};
  assert.equal(store.update(s => s, first), false); assert.equal(saves, 0);
  const second = store.snapshot(); bookId = 1;
  assert.equal(store.update(s => s, second), false); assert.equal(saves, 0);
  bookId = 1525; const third = store.snapshot(); run.sim1525 = emptyBlackSunState();
  assert.equal(store.update(s => s, third), false); assert.equal(saves, 0);
  assert.equal(store.update(s => s), true); assert.equal(saves, 1);
  assert.equal(store.update(s => {run = {}; return s;}), false); assert.equal(saves, 1);
});

test('fight saves preserve unrelated story, inventory and other simulator data', () => {
  const run = {path: [1, 3], inventory: ['Key'], sim8: {test: true}}, original = structuredClone(run);
  let saves = 0;
  const store = createBlackSunState(() => ({run, bookId: 1525, definition, saveState: () => saves++}));
  assert.equal(store.update(state => {state.fight = fight(); return state;}), true);
  assert.deepEqual(run.path, original.path); assert.deepEqual(run.inventory, original.inventory); assert.deepEqual(run.sim8, original.sim8);
  assert.equal(run.sim1525.fight.round, 0); assert.equal(saves, 1);
});
