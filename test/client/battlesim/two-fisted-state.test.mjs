import {test} from 'node:test';
import assert from 'node:assert/strict';
import {groundPlayer, startGroundFight, prepareGroundRound, advanceGroundFight} from '../../../public/js/battlesim/engines/two-fisted/ground.js';
import {emptyTwoFistedState, createTwoFistedState, rememberTwoFistedFight, cancelTwoFistedFight} from '../../../public/js/battlesim/engines/two-fisted/state.js';

const definition = {id: 1527, stateKey: 'sim1527'};
const fight = (values = {}) => startGroundFight(groundPlayer({fists: 0, ...values}), {mode: 'melee',
  opponents: [{name: 'Opponent', expertise: 0, fists: 0, health: 1}]});
const win = values => advanceGroundFight(prepareGroundRound(fight(values), {spend: 1, target: 0}));

test('outcome history survives reload and records each fight once with increasing timestamps', () => {
  const state = emptyTwoFistedState(); state.fight = win();
  rememberTwoFistedFight(state, 100);
  assert.equal(state.history.length, 1); assert.equal(state.history[0].outcome, 'win');
  const restored = JSON.parse(JSON.stringify(state)); rememberTwoFistedFight(restored, 100);
  assert.equal(restored.history.length, 1);
  restored.fight = win(); rememberTwoFistedFight(restored, 99);
  assert.equal(restored.history[1].ts, 101);
});

test('printed interruptions and cancellations preserve stats without fabricating an outcome', () => {
  for (const status of ['ended', 'cancelled']) {
    const state = emptyTwoFistedState(); state.fight = fight(); state.fight.status = status;
    state.fight.player.energy = 20; state.fight.player.injuries = 2;
    rememberTwoFistedFight(state);
    assert.equal(state.history.length, 0); assert.equal(state.player.energy, 20); assert.equal(state.player.injuries, 2);
  }
});

test('completed combat expires temporary protections while retaining casualties and consumed cards', () => {
  const state = emptyTwoFistedState(); state.fight = win({badgeActive: true, traumaActive: true,
    inventory: {'trauma-kit': 0}, copilot: {combat: 0, fists: 1, dead: true, badgeUsed: true},
    trobble: {expertise: 4, fists: 1, discardThrough: 3, inactive: true, discarded: false}});
  rememberTwoFistedFight(state);
  assert.equal(state.player.badgeActive, false); assert.equal(state.player.traumaActive, false);
  assert.equal(state.player.copilot.dead, true); assert.equal(state.player.copilot.badgeUsed, true);
  assert.equal(state.player.inventory['trauma-kit'], 0); assert.equal(state.player.trobble.inactive, false);
  assert.equal(state.fight.player.traumaActive, true, 'The historical fight retains its actual protection');
});

test('live-context tokens prevent stale confirmations from changing another playthrough or book', () => {
  let run = {}, bookId = 1527, saves = 0;
  const store = createTwoFistedState(() => ({run, bookId, definition, saveState: () => saves++}));
  const first = store.snapshot(); run = {};
  assert.equal(store.update(state => state, first), false);
  const second = store.snapshot(); bookId = 1;
  assert.equal(store.update(state => state, second), false);
  bookId = 1527; const third = store.snapshot(); run.sim1527 = emptyTwoFistedState();
  assert.equal(store.update(state => state, third), false);
  assert.equal(store.update(state => {run = {}; return state;}), false);
  assert.equal(saves, 0);
  assert.equal(store.update(state => state), true); assert.equal(saves, 1);
});

test('saving an unresolved fight preserves its action, ENERGY payment and unrelated player data', () => {
  const run = {path: [1, 200], inventory: ['Story key'], sim8: {value: 1}}, original = structuredClone(run);
  const store = createTwoFistedState(() => ({run, bookId: 1527, definition, saveState() {}}));
  store.update(state => {state.fight = prepareGroundRound(fight(), {spend: 1, target: 0}); return state;});
  const loaded = JSON.parse(JSON.stringify(run.sim1527));
  assert.equal(loaded.fight.player.energy, 59); assert.equal(loaded.fight.roundAction.spend, 1);
  assert.equal(loaded.fight.queue.length, 1);
  for (const key of Object.keys(original)) assert.deepEqual(run[key], original[key]);
});

test('cancelling a pending round preserves the paid ENERGY without recording a loss', () => {
  const state = emptyTwoFistedState();
  const pending = prepareGroundRound(fight(), {spend: 1, target: 0});
  state.fight = cancelTwoFistedFight(pending); rememberTwoFistedFight(state);
  assert.equal(state.player.energy, 59); assert.equal(state.history.length, 0);
  assert.equal(state.fight.roundAction, null); assert.deepEqual(state.fight.queue, []);
  assert.equal(pending.status, 'fighting');
});

test('editing current stats or healing after a completed fight is not overwritten by its historical snapshot', () => {
  const state = emptyTwoFistedState(); state.fight = win(); rememberTwoFistedFight(state, 100);
  state.player.energy = 60; state.player.injuries = 0;
  rememberTwoFistedFight(state, 101);
  assert.equal(state.player.energy, 60); assert.equal(state.fight.player.energy, 59);
  assert.equal(state.history.length, 1);
});
