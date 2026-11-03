import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startSagardForces, resolveSagardForces, validateSagardForcesFight,
  canFleeSagardForces} from '../../../public/js/battlesim/engines/sagard/forces.js';
import {healSagardEncounter, useSagardEncounterDagger} from '../../../public/js/battlesim/engines/sagard/actions.js';
import {emptySagardState, rememberSagardFight} from '../../../public/js/battlesim/engines/sagard/state.js';

const rules = {maxHeroHp: 20, damageByLevel: Object.fromEntries(Array.from({length: 6}, (_, n) => [n, [0, 1, 2, 3]]))};
const start = (options = {}, hero = {}, foe = {}, ruleOptions = {}) => {
  const opponent = {name: 'Synthetic champion', level: 3, hp: 8, ...foe};
  return startSagardForces({level: 2, hp: 20, ...hero}, {name: 'Synthetic swarm', escape: 'even', escapeTarget: 'escaped',
    winWithAlliesTarget: 'with-allies', winWithoutAlliesTarget: 'alone', opponents: [opponent],
    forces: {allies: 2, enemies: 3, initiative: 'enemy', duelTiming: 'after', duelMode: 'round',
      allyKillFaces: [3, 4], enemyKillFaces: [4], enemyDiesOnSuccessfulKill: true,
      escapeOnlyWithoutAllies: true, duelEncounter: {opponents: [opponent]}}}, {...rules, ...ruleOptions}, options);
};
const reload = value => JSON.parse(JSON.stringify(value));
const step = (fight, die) => resolveSagardForces(reload(fight), die);
const reachDuel = fight => {while (fight.phase !== 'duel') fight = step(fight, 1); return fight;};

test('a force member dies when its successful attack kills an ally, before survivors reply', () => {
  let fight = start();
  fight = step(fight, 4);
  assert.equal(fight.enemiesRemaining, 2); assert.equal(fight.alliesRemaining, 1);
  fight = step(fight, 1); fight = step(fight, 1);
  assert.equal(fight.phase, 'allyVolley'); assert.equal(fight.shots, 1);
  fight = step(fight, 1);
  assert.equal(fight.phase, 'duel'); assert.equal(fight.duel.opponents[0].hp, 8);
});

test('one complete individual exchange follows the volleys and preserves champion wounds', () => {
  let fight = reachDuel(start());
  fight = step(fight, 4);
  assert.equal(fight.phase, 'duel'); assert.equal(fight.duel.opponents[0].hp, 5);
  fight = step(fight, 4);
  assert.equal(fight.round, 2); assert.equal(fight.phase, 'enemyVolley');
  assert.equal(fight.hero.hp, 17);
  fight = reachDuel(fight);
  assert.equal(fight.duel.opponents[0].hp, 5); assert.equal(fight.duel.hero.hp, 17);
  fight = step(fight, 2);
  assert.equal(fight.duel.opponents[0].hp, 4);
});

test('losing the last ally ends group volleys while leaving the hero fighting', () => {
  let fight = start({alliesRemaining: 1});
  fight = step(fight, 4);
  assert.equal(fight.alliesRemaining, 0); assert.equal(fight.enemiesRemaining, 2);
  assert.equal(fight.status, 'fighting'); assert.equal(fight.phase, 'duel');
  assert.equal(canFleeSagardForces(fight), true);
  fight = step(fight, 1); fight = step(fight, 1);
  assert.equal(fight.round, 2); assert.equal(fight.phase, 'duel');
  assert.equal(fight.enemiesRemaining, 2);
});

test('destroying the last group opponent does not prematurely defeat its champion', () => {
  let fight = start({enemiesRemaining: 1});
  fight = step(fight, 1);
  assert.equal(fight.phase, 'allyVolley');
  fight = step(fight, 4);
  assert.equal(fight.enemiesRemaining, 0); assert.equal(fight.status, 'fighting');
  assert.equal(fight.phase, 'duel'); assert.equal(fight.duel.opponents[0].hp, 8);
  fight = step(fight, 1); fight = step(fight, 1);
  assert.equal(fight.phase, 'duel'); assert.equal(fight.round, 2);
});

test('champion defeat ends all combat and selects the surviving-allies destination', () => {
  for (const count of [0, 2]) {
    let fight = reachDuel(start({alliesRemaining: count}, {}, {hp: 1}));
    const survivingEnemies = fight.enemiesRemaining;
    fight = step(fight, 2);
    assert.equal(fight.status, 'win'); assert.equal(fight.enemiesRemaining, survivingEnemies);
    assert.equal(fight.destination, count ? 'with-allies' : 'alone');
    validateSagardForcesFight(reload(fight));
    const state = emptySagardState(); state.fight = reload(fight);
    rememberSagardFight(state, 100); rememberSagardFight(state, 101);
    assert.equal(state.history.length, 1);
  }
});

test('hero defeat ends combat without inventing group casualties', () => {
  let fight = reachDuel(start({}, {hp: 1}));
  fight = step(fight, 1); fight = step(fight, 2);
  assert.equal(fight.status, 'loss'); assert.equal(fight.hero.hp, 0);
  assert.equal(fight.alliesRemaining, 2); assert.equal(fight.enemiesRemaining, 3);
});

test('recovery during a volley remains available to the subsequent individual exchange', () => {
  let fight = start({fang: true}, {hp: 7}, {}, {healingAmounts: {fang: 4}});
  fight = healSagardEncounter(reload(fight), 'fang');
  fight = reachDuel(fight);
  assert.equal(fight.hero.hp, 11); assert.equal(fight.duel.hero.hp, 11);
  assert.equal(fight.duel.healing.fang, false);
});

test('a special weapon can end the champion fight without subtracting a swarm member', () => {
  let fight = reachDuel(start({magicDaggerPower: 4}, {}, {level: 1},
    {magicDagger: {maximumPower: 4, defeatsLevelAtMost: 1}}));
  fight = useSagardEncounterDagger(reload(fight), {mode: 'destroy'});
  assert.equal(fight.status, 'win'); assert.equal(fight.enemiesRemaining, 3);
  assert.equal(fight.magicDaggerPower, 0);
});
