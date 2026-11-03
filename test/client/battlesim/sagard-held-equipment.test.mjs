import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startSagardFight} from '../../../public/js/battlesim/engines/sagard/core.js';
import {startSagardForces, resolveSagardForces, blowSagardWhistle, validateSagardForcesFight} from '../../../public/js/battlesim/engines/sagard/forces.js';
import {rememberSagardFight, emptySagardState} from '../../../public/js/battlesim/engines/sagard/state.js';
const rules = {maxHeroHp: 25, damageByLevel: Object.fromEntries(Array.from({length: 7}, (_, n) => [n, [0, 1, 2, 3]])),
  salt: {maxHeld: 20}, monkeyWhistle: {count: 10, delayRounds: 2, killFaces: [3, 4]}, tehniteWeapons: {allyKillFaces: [2, 3, 4]}};
const enemy = {name: 'Synthetic foe', level: 1, hp: 10};
const spec = {jungle: true, escape: 'none', forces: {allies: 1, enemies: 2, initiative: 'hero',
  allyKillFaces: [3, 4], enemyKillFaces: [4], duelTiming: 'after', duelEncounter: {opponents: [enemy], initiative: 'hero', escape: 'none'}}};
const hero = {hp: 25, level: 4};
const step = (fight, die, options) => resolveSagardForces(JSON.parse(JSON.stringify(fight)), die, options);
function finishRound(fight) {
  const round = fight.round;
  while (fight.round === round && fight.status === 'fighting') fight = fight.phase === 'chooseDuel'
    ? step(fight, null, {decision: 'volley'}) : step(fight, 1, fight.monkeys?.remaining && fight.phase === 'enemyVolley' ? {target: 'crew'} : {});
  return fight;
}

test('salt consumes at most one bag per combatant and survives the next fight without refill', () => {
  let fight = startSagardFight(hero, {zombies: true, opponents: [enemy, enemy, enemy]}, rules, {saltBags: 5, useSalt: true});
  assert.equal(fight.opponents.filter(row => row.hp === 0).length, 1); assert.equal(fight.saltBags, 4);
  let state = emptySagardState(); state.fight = fight; rememberSagardFight(state);
  assert.equal(state.setup.saltBags, 4);
  fight = startSagardFight(hero, {zombies: true, opponents: [enemy], winTarget: 'next'}, rules, {saltBags: 1, useSalt: true});
  assert.equal(fight.status, 'win'); assert.equal(fight.destination, 'next'); assert.equal(fight.saltBags, 0);
  fight = startSagardFight(hero, {opponents: [enemy]}, rules, {saltBags: 3, useSalt: true});
  assert.equal(fight.opponents[0].hp, 10); assert.equal(fight.saltBags, 3);
});

test('whistle is manually held, works in jungle group combat once, and arrivals wait two rounds', () => {
  let fight = startSagardForces(hero, spec, rules, {monkeyWhistle: true});
  fight = blowSagardWhistle(fight); assert.equal(fight.monkeys.held, false);
  assert.throws(() => blowSagardWhistle(fight));
  fight = finishRound(fight); assert.equal(fight.round, 2); assert.equal(fight.monkeys.remaining, 0);
  fight = finishRound(fight); assert.equal(fight.round, 3); assert.equal(fight.monkeys.remaining, 10);
  validateSagardForcesFight(JSON.parse(JSON.stringify(fight)));
  assert.throws(() => blowSagardWhistle(startSagardForces(hero, {...spec, jungle: false}, rules, {monkeyWhistle: true})));
  assert.throws(() => blowSagardWhistle(startSagardForces(hero, spec, rules)));
});

test('Tehnite crew kills on two while monkeys retain three/four and casualties target a chosen cohort', () => {
  let fight = blowSagardWhistle(startSagardForces(hero, {...spec, forces: {...spec.forces, enemies: 10}}, rules,
    {monkeyWhistle: true, tehniteWeapons: true}));
  fight = finishRound(fight); fight = finishRound(fight);
  fight = step(fight, 2); assert.equal(fight.enemiesRemaining, 9); assert.equal(fight.phase, 'monkeyVolley');
  fight = step(fight, 2); assert.equal(fight.enemiesRemaining, 9);
  fight = step(fight, 3); assert.equal(fight.enemiesRemaining, 8);
  while (fight.phase === 'monkeyVolley') fight = step(fight, 1);
  assert.equal(fight.phase, 'enemyVolley');
  assert.throws(() => step(fight, 4));
  fight = step(fight, 4, {target: 'monkeys'}); assert.equal(fight.monkeys.remaining, 9); assert.equal(fight.alliesRemaining, 1);
  fight = step(fight, 4, {target: 'crew'}); assert.equal(fight.alliesRemaining, 0);
  fight = step(fight, 4); assert.equal(fight.monkeys.remaining, 8);
});

test('spent whistle persists but temporary helpers never follow the player into another encounter', () => {
  let fight = blowSagardWhistle(startSagardForces(hero, spec, rules, {monkeyWhistle: true}));
  fight = finishRound(fight); fight = finishRound(fight);
  const state = emptySagardState(); state.fight = fight; rememberSagardFight(state);
  assert.equal(state.setup.monkeyWhistle, false);
  const next = startSagardForces(hero, spec, rules, state.setup);
  assert.equal(next.monkeys.remaining, 0); assert.equal(next.monkeys.held, false);
});
