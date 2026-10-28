import test from 'node:test';
import assert from 'node:assert/strict';
import {startChase, chaseTurn} from '../../../public/js/battlesim/engines/car-wars/chase.js';

const driver = name => ({name, driving: 1, handling: 1, hp: 17, powerPlant: {boxes: 2}});
const sequence = (...values) => {
  let index = 0;
  return () => {assert.ok(index < values.length, 'Unexpected control roll'); return values[index++];};
};
const entry = chase => ({section: 'test', enemies: [driver('Pursuer')], rules: {victory: 'win', defeat: 'lose', chase}});

test('first-to-fail keeps cumulative failures and stops before the other driver rolls', () => {
  const initial = startChase(driver('Player'), entry({mode: 'first-failures', failureLimit: 2}));
  let state = chaseTurn(initial, sequence(6, 1));
  state = chaseTurn(state, sequence(1, 1));
  assert.equal(state.heroRolls.failures, 1, 'Success must not erase a prior failure');
  state = chaseTurn(state, sequence(6));
  assert.equal(state.section, 'lose');
  assert.equal(state.enemyRolls[0].successes, 2);
  assert.equal(initial.round, 0, 'Original saved state is preserved');
});

test('first-to-fail routes the opposing driver reaching the limit to victory', () => {
  let state = startChase(driver('Player'), entry({mode: 'first-failures', failureLimit: 2}));
  state = chaseTurn(state, sequence(1, 6));
  state = chaseTurn(state, sequence(1, 6));
  assert.equal(state.status, 'win');
  assert.equal(state.section, 'win');
});

test('success-lead uses cumulative successes with equal attempts and supports a printed fixed Control target', () => {
  const source = entry({mode: 'success-lead', leadRequired: 2, turnLimit: 10, timeout: 'timeout'});
  source.enemies = [{name: 'Sedan', controlRoll: 5}];
  let state = startChase(driver('Player'), source);
  for (const rolls of [[1, 6], [6, 1], [1, 6], [1, 6]]) state = chaseTurn(state, sequence(...rolls));
  assert.equal(state.status, 'win');
  assert.equal(state.heroRolls.successes, 3);
  assert.equal(state.enemyRolls[0].successes, 1);
  assert.equal(state.enemies[0].hp, undefined, 'No combat statistics are invented for a chase-only car');
});

test('success-lead uses the printed timeout when neither driver pulls ahead', () => {
  let state = startChase(driver('Player'), entry({mode: 'success-lead', leadRequired: 2, turnLimit: 2, timeout: 'timeout'}));
  state = chaseTurn(state, sequence(1, 1));
  state = chaseTurn(state, sequence(1, 1));
  assert.equal(state.status, 'branch');
  assert.equal(state.section, 'timeout');
});

test('pursuit removes only drivers reaching the failure limit and preserves damaged survivors for combat', () => {
  const source = entry({failuresToDropOut: 2, heroFailuresDestination: 'combat', preserveState: true});
  source.enemies.push({...driver('Second pursuer'), hp: 4});
  let state = startChase(driver('Player'), source);
  state = chaseTurn(state, sequence(6, 6, 1));
  state = chaseTurn(state, sequence(1, 6, 1));
  assert.equal(state.enemies[0].escaped, true);
  state = chaseTurn(state, sequence(6, 1));
  assert.equal(state.section, 'combat');
  assert.equal(state.enemies[1].hp, 4);
  assert.equal(state.enemies[1].powerPlant.boxes, 2);
  assert.equal(source.enemies[0].escaped, undefined);
});

test('pursuit ends when all pursuers drop out and rejects finished chases', () => {
  let state = startChase(driver('Player'), entry({failuresToDropOut: 2, heroFailuresDestination: 'combat'}));
  state = chaseTurn(state, sequence(1, 6));
  state = chaseTurn(state, sequence(1, 6));
  assert.equal(state.status, 'win');
  assert.throws(() => chaseTurn(state, sequence()), /No active chase/);
});
