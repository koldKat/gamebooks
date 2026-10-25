import test from 'node:test';
import assert from 'node:assert/strict';
import {loadFixtureRoster} from './roster-fixtures.mjs';
import {ROSTER, PLAYER_STAT_KEYS} from '../../../public/js/battlesim/books/772/definition.js';
import {createState} from '../../../public/js/battlesim/books/772/state.js';
import {kungFuEnemy, kungFuLegacyAction} from '../../../public/js/battlesim/engines/kung-fu.js';

await loadFixtureRoster(772);

test('legacy saved fights retain their rules, partial results and altered cached opponent stats', () => {
  const run = {}, context = {PLAYER_STAT_KEYS, currentPlaythrough: () => run,
    _defaultPlayerStats: () => Object.fromEntries(PLAYER_STAT_KEYS.map(([key]) => [key, 0]))};
  const store = createState(() => context), state = store._data();
  state.rulesVersion = 1; state.roundIdx = 3; state.started = true;
  state.playerResults = ['draw', 'win']; state.enemyResults = ['draw', 'loss'];
  state._liveEnemy = {...kungFuEnemy(ROSTER.find(enemy => enemy.id === 'steve_train'), false), defHand: 17};
  state.log = ['Existing fight']; state.history = [{outcome: 'win', ts: 1}];
  const before = JSON.stringify(state);
  assert.equal(store._data(), state);
  assert.equal(JSON.stringify(state), before);
  assert.equal(state._liveEnemy.defLeg, null);
  assert.equal(state._liveEnemy.defHand, 17);
});

test('random legacy patterns use one random draw only after the opening and return independent actions', () => {
  const enemy = ROSTER.find(enemy => enemy.id === 'mac_stone');
  let calls = 0;
  const random = () => {calls++; return .999999;};
  assert.deepEqual(kungFuLegacyAction(enemy, 0, random), {type: 'defend', move: 'aggressive'});
  assert.equal(calls, 0);
  const action = kungFuLegacyAction(enemy, 1, random);
  assert.deepEqual(action, {type: 'attack', move: 'combined'});
  assert.equal(calls, 1);
  action.move = 'hand';
  assert.deepEqual(kungFuLegacyAction(enemy, 1, random), {type: 'attack', move: 'combined'});
});

test('unknown lane stats and dodge lists survive database loading and live stat copies', () => {
  const enemy = ROSTER.find(enemy => enemy.id === 'tun_tsin');
  assert.equal(enemy.atkLeg, null);
  assert.equal(enemy.defLeg, null);
  assert.deepEqual(enemy.dodge, [4]);
  const live = kungFuEnemy(enemy);
  live.atkHand = 2;
  assert.equal(enemy.atkHand, 24);
  assert.equal(Object.hasOwn(live, 'legacyPattern'), false);
  assert.equal(Object.hasOwn(live, 'revisedRules'), false);
});
