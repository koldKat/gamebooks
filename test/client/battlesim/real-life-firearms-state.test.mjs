import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createFirearmState, emptyFirearmState, rememberFirearmFight, validateFirearmState}
  from '../../../public/js/battlesim/engines/real-life-firearms/state.js';
import {startFirearmFight, resolveFirearmTurn, cancelFirearmFight} from '../../../public/js/battlesim/engines/real-life-firearms/core.js';

const definition = {id: 999, stateKey: 'syntheticFirearms'};
const fight = spec => startFirearmFight(7, {name: 'Synthetic fight', opponents: [{name: 'Foe', skill: 7}], ...spec});

test('completed firearm history records once, preserves Firearm and uses increasing timestamps', () => {
  const state = emptyFirearmState(); state.fight = resolveFirearmTurn(fight(), [3, 4]);
  rememberFirearmFight(state, 10); rememberFirearmFight(state, 10);
  assert.equal(state.history.length, 1); assert.equal(state.setup.firearm, 7);
  state.fight = resolveFirearmTurn(fight({opponentFirst: true}), [3, 4]);
  rememberFirearmFight(state, 5); assert.deepEqual(state.history.map(x => [x.outcome, x.ts]), [['win', 10], ['loss', 11]]);
  validateFirearmState(JSON.parse(JSON.stringify(state)));
});

test('unfinished, cancelled and interrupted firearm fights never become reward history', () => {
  for (const status of ['fighting', 'cancelled', 'interrupted']) {
    const state = emptyFirearmState(); state.fight = fight();
    if (status === 'cancelled') state.fight = cancelFirearmFight(state.fight);
    if (status === 'interrupted') state.fight = {...state.fight, status};
    rememberFirearmFight(state); assert.equal(state.history.length, 0);
  }
});

test('live context and snapshot tokens reject stale book, run and competing fight confirmations', () => {
  let run = {inventory: ['keep'], path: ['1']}, bookId = 999, writes = 0;
  const original = run, store = createFirearmState(() => ({run, bookId, definition, saveState: () => writes++}));
  assert.equal(store.update(s => ({...s, fight: fight()})), true);
  const token = store.snapshot(); bookId = 998;
  assert.equal(store.update(s => ({...s, fight: cancelFirearmFight(s.fight)}), token), false);
  bookId = 999; run = {inventory: ['other']};
  assert.equal(store.update(s => s, token), false); run = original;
  assert.equal(store.update(s => ({...s, setup: {...s.setup, manualDice: true}})), true);
  assert.equal(store.update(s => ({...s, fight: cancelFirearmFight(s.fight)}), token), false);
  assert.equal(writes, 2); assert.deepEqual(run.inventory, ['keep']); assert.deepEqual(run.path, ['1']);
  const snapshot = store.snapshot(); snapshot.state.fight.hero.alive = false;
  assert.equal(run.syntheticFirearms.fight.hero.alive, true);
});
