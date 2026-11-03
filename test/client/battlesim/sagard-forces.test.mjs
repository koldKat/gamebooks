import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startSagardForces, validateSagardForcesFight, sagardForcesTurn, resolveSagardForces,
  cancelSagardForces} from '../../../public/js/battlesim/engines/sagard/forces.js';
import {emptySagardState, rememberSagardFight} from '../../../public/js/battlesim/engines/sagard/state.js';

const rules = {maxHeroHp: 20, damageByLevel: Object.fromEntries(Array.from({length: 6}, (_, level) =>
  [level, [0, 1, 2, level + 1]]))};
const start = (allies = 3, enemies = 2, extra = {}, hero = {}) => startSagardForces({level: 3, hp: 20, ...hero},
  {name: 'Synthetic force battle', winTarget: 'won', lossTarget: 'lost', forces: {
    allies, enemies, enemyKillFaces: [3, 4], allyKillFaces: [4],
    duelEncounter: {initiative: 'hero', opponents: [{name: 'Synthetic duelist', level: 2, hp: 1}]}, ...extra}}, rules);
const step = (fight, die, decision) => resolveSagardForces(JSON.parse(JSON.stringify(fight)), die, {decision});

test('a duel victory does not record the whole battle as won; the final result records only once', () => {
  const state = emptySagardState();
  state.fight = step(step(start(1, 2), null, 'duel'), 2); rememberSagardFight(state, 100);
  assert.equal(state.history.length, 0);
  state.fight = step(state.fight, 1); state.fight = step(state.fight, 4);
  rememberSagardFight(state, 101); rememberSagardFight(state, 102);
  assert.equal(state.history.length, 1); assert.equal(state.history[0].outcome, 'win');
  assert.equal(state.setup.hp, 20);
});

test('enemy volleys precede surviving allies, whose casualty faces remain independent', () => {
  const original = start();
  let fight = step(original, null, 'volley');
  fight = step(fight, 3); fight = step(fight, 1);
  assert.equal(fight.alliesRemaining, 2); assert.equal(fight.phase, 'allyVolley'); assert.equal(fight.shots, 2);
  fight = step(fight, 3); assert.equal(fight.enemiesRemaining, 2);
  fight = step(fight, 4); assert.equal(fight.enemiesRemaining, 1); assert.equal(fight.round, 2);
  assert.equal(fight.phase, 'chooseDuel'); assert.equal(original.log.length, 0);
});

test('one optional duel removes one enemy before the volley without changing ally strength', () => {
  let fight = step(start(), null, 'duel');
  assert.equal(sagardForcesTurn(fight).attackerId, 'hero');
  fight = step(fight, 2); assert.equal(fight.enemiesRemaining, 1); assert.equal(fight.alliesRemaining, 3);
  assert.equal(fight.phase, 'enemyVolley'); assert.equal(fight.shots, 1);
  assert.equal(fight.duel, null); assert.throws(() => step(fight, null, 'duel'));
});

test('the last individual victory ends the force battle and reloads without a dangling duel', () => {
  let fight = step(start(3, 1), null, 'duel'); fight = step(fight, 2);
  assert.equal(fight.status, 'win'); assert.equal(fight.destination, 'won');
  validateSagardForcesFight(JSON.parse(JSON.stringify(fight)));
  assert.throws(() => step(fight, 1));
});

test('crew extinction leaves the living hero able to continue individual duels', () => {
  let fight = step(start(1, 2), null, 'volley'); fight = step(fight, 4);
  assert.equal(fight.alliesRemaining, 0); assert.equal(fight.status, 'fighting');
  assert.equal(fight.phase, 'chooseDuel'); fight = step(fight, null, 'duel');
  fight = step(fight, 2); assert.equal(fight.enemiesRemaining, 1);
});

test('surviving ally thresholds select only the printed destination, with no campaign mutation', () => {
  for (const allies of [1, 2, 3]) {
    let fight = step(start(allies, 1, {minimumAlliesForWin: 2, insufficientAlliesTarget: 'few'}), null, 'duel');
    fight = step(fight, 2); assert.equal(fight.destination, allies < 2 ? 'few' : 'won');
  }
});

test('duel HP, armor and finite shields persist; hero death ends the battle', () => {
  let fight = step(start(3, 2, {duelEncounter: {initiative: 'enemy', opponents: [
    {name: 'Synthetic duelist', level: 2, hp: 1}]}}, {hp: 2, shield: 1}), null, 'duel');
  fight = step(fight, 3); assert.equal(fight.hero.hp, 1); assert.equal(fight.hero.shield, 0);
  assert.equal(fight.status, 'fighting'); fight = step(fight, 2);
  fight = step(fight, 1);
  for (let n = 0; n < 3; n++) fight = step(fight, 1);
  fight = step(fight, null, 'duel'); fight = step(fight, 2);
  assert.equal(fight.status, 'loss'); assert.equal(fight.destination, 'lost');
});

test('cancellation and invalid input do not change the supplied force battle', () => {
  const fight = start(); assert.equal(cancelSagardForces(fight).status, 'cancelled');
  assert.equal(fight.status, 'fighting'); assert.throws(() => step(fight, null, 'skip'));
  const volley = step(fight, null, 'volley'); assert.throws(() => step(volley, 5));
  const invalid = structuredClone(volley); invalid.alliesRemaining = -1;
  assert.throws(() => validateSagardForcesFight(invalid));
});
