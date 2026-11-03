import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startSagardForces, resolveSagardForces, validateSagardForcesFight} from '../../../public/js/battlesim/engines/sagard/forces.js';
import {emptySagardState, rememberSagardFight} from '../../../public/js/battlesim/engines/sagard/state.js';

const rules = {maxHeroHp: 20, damageByLevel: Object.fromEntries(Array.from({length: 6}, (_, n) => [n, [0, 1, 2, 3]]))};
const opponent = {name: 'Synthetic duelist', hp: 1, level: 1};
const start = (forces = {}, count = {}) => startSagardForces({level: 2, hp: 20},
  {name: 'Synthetic force', winTarget: 'won', allAlliesKilledTarget: 'outnumbered', opponents: [opponent],
    forces: {allies: 2, enemies: 3, allyKillFaces: [3, 4], enemyKillFaces: [4],
      duelEncounter: {opponents: [opponent]}, ...forces}}, rules, count);
const step = (fight, die, decision) => resolveSagardForces(JSON.parse(JSON.stringify(fight)), die, {decision});

test('allied-first volleys use the surviving enemy count for the reply', () => {
  let fight = start({initiative: 'hero', duelTiming: 'before'}, {alliesRemaining: 3, enemiesRemaining: 2});
  fight = step(fight, null, 'volley');
  assert.equal(fight.phase, 'allyVolley'); assert.equal(fight.shots, 3);
  for (const die of [4, 1, 1]) fight = step(fight, die);
  assert.equal(fight.enemiesRemaining, 1);
  assert.equal(fight.phase, 'enemyVolley'); assert.equal(fight.shots, 1);
  fight = step(fight, 4);
  assert.equal(fight.alliesRemaining, 2);
  assert.equal(fight.round, 2); assert.equal(fight.phase, 'chooseDuel');
});

test('an after-volley duel cannot start before both sides have attacked', () => {
  let fight = start({initiative: 'hero', duelTiming: 'after'});
  assert.equal(fight.phase, 'allyVolley');
  assert.throws(() => step(fight, null, 'duel'));
  fight = step(fight, 4); fight = step(fight, 1);
  assert.equal(fight.phase, 'enemyVolley'); assert.equal(fight.shots, 2);
  fight = step(fight, 4); fight = step(fight, 1);
  assert.equal(fight.alliesRemaining, 1); assert.equal(fight.phase, 'chooseDuel');
  fight = step(fight, null, 'duel'); fight = step(fight, 2);
  assert.equal(fight.enemiesRemaining, 1);
  assert.equal(fight.round, 2); assert.equal(fight.phase, 'allyVolley');
  assert.equal(fight.duelsThisRound, 0);
});

test('skipping an after-volley duel advances exactly one group round', () => {
  let fight = start({initiative: 'hero', duelTiming: 'after'});
  for (let n = 0; n < 5; n++) fight = step(fight, 1);
  assert.equal(fight.phase, 'chooseDuel');
  fight = step(fight, null, 'volley');
  assert.equal(fight.round, 2); assert.equal(fight.phase, 'allyVolley'); assert.equal(fight.shots, 2);
});

test('unlimited optional duels remain before the volley without advancing the group round', () => {
  let fight = start({initiative: 'hero', duelTiming: 'before', duelsPerRound: 'unlimited'});
  for (let n = 1; n <= 2; n++) {
    fight = step(fight, null, 'duel'); fight = step(fight, 2);
    assert.equal(fight.phase, 'chooseDuel'); assert.equal(fight.round, 1);
    assert.equal(fight.duelsThisRound, n); assert.equal(fight.enemiesRemaining, 3 - n);
  }
  fight = step(fight, null, 'volley');
  assert.equal(fight.phase, 'allyVolley'); assert.equal(fight.shots, 2);
});

test('the one-duel option moves directly to the declared first volley', () => {
  let fight = start({initiative: 'hero', duelTiming: 'before', duelsPerRound: 1});
  fight = step(fight, null, 'duel'); fight = step(fight, 2);
  assert.equal(fight.phase, 'allyVolley'); assert.equal(fight.duelsThisRound, 1);
  assert.equal(fight.enemiesRemaining, 2);
  assert.throws(() => step(fight, null, 'duel'));
});

test('a declared force defeat ends on the last allied casualty while leaving the hero alive', () => {
  let fight = start({initiative: 'enemy', duelTiming: 'before', lossOnAlliesKilled: true}, {alliesRemaining: 1});
  fight = step(fight, null, 'volley'); fight = step(fight, 4);
  assert.equal(fight.status, 'loss'); assert.equal(fight.destination, 'outnumbered');
  assert.equal(fight.hero.hp, 20);
  const state = emptySagardState(); state.fight = fight;
  rememberSagardFight(state, 100); rememberSagardFight(state, 101);
  assert.equal(state.history.length, 1);
  assert.throws(() => start({lossOnAlliesKilled: true}, {alliesRemaining: 0}));
});

test('without a declared force defeat a lone hero continues after group volleys', () => {
  let fight = start({initiative: 'hero', duelTiming: 'after'}, {alliesRemaining: 1, enemiesRemaining: 2});
  fight = step(fight, 1); fight = step(fight, 4);
  assert.equal(fight.alliesRemaining, 0); assert.equal(fight.phase, 'chooseDuel');
  assert.equal(fight.status, 'fighting');
  fight = step(fight, null, 'duel'); fight = step(fight, 2);
  assert.equal(fight.phase, 'chooseDuel'); assert.equal(fight.enemiesRemaining, 1);
  fight = step(fight, null, 'duel'); fight = step(fight, 2);
  assert.equal(fight.status, 'win');
});

test('legacy saved force fights without new counters retain enemy-first behavior', () => {
  const original = start(); delete original.duelsThisRound;
  const serialized = JSON.stringify(original);
  validateSagardForcesFight(original);
  assert.equal(JSON.stringify(original), serialized);
  const next = step(original, null, 'volley');
  assert.equal(next.phase, 'enemyVolley'); assert.equal(next.shots, 3);
  for (const invalid of [{initiative: 'random'}, {duelTiming: 'during'}, {duelsPerRound: 2}, {lossOnAlliesKilled: 'yes'}]) {
    assert.throws(() => start(invalid));
  }
});
