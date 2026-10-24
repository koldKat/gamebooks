import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDestinyFight, startDestinyRound, rollDestinySpeed, resolveDestinySpeed,
  rollDestinyDamage, resolveDestinyDamage, endDestinyRound, skipDestinyDeathMove,
} from '../../../public/js/battlesim/engines/destinyquest/core.js';

const hero = () => ({ name: 'Hero', speed: 4, brawn: 7, magic: 1, armour: 5, health: 30 });
const enemy = (extra = {}) => ({ name: 'Serpent', speed: 6, brawn: 3, armour: 2, health: 12, ...extra });
const rolls = (...values) => () => {
  assert.ok(values.length, 'Unexpected die roll');
  return values.shift();
};
const speed = (fight, ...values) => resolveDestinySpeed(rollDestinySpeed(fight, rolls(...values)));
const damage = (fight, value) => resolveDestinyDamage(rollDestinyDamage(fight, rolls(value)));

test('printed combat: 2d6 plus speed, then 1d6 plus strongest hero attribute minus armour', () => {
  const setup = hero(), opponents = [enemy()];
  let fight = createDestinyFight(setup, opponents);
  const initial = structuredClone(fight);
  fight = speed(startDestinyRound(fight, 0), 6, 5, 2, 2);
  assert.equal(fight.turn.winner, 'hero');
  fight = damage(fight, 3);
  assert.equal(fight.turn.damageScore, 10);
  assert.equal(fight.turn.healthDamage, 8);
  assert.equal(fight.opponents[0].health, 4);
  assert.deepEqual(setup, hero());
  assert.deepEqual(opponents, [enemy()]);
  assert.equal(initial.phase, 'start');
  assert.deepEqual(fight.history[0].heroDice, [6, 5]);
});

test('ties have no normal damage roll but still apply end-of-round passives', () => {
  let fight = createDestinyFight(hero(), [enemy()]);
  fight = speed(startDestinyRound(fight, 0), 4, 4, 3, 3);
  assert.equal(fight.turn.winner, 'standoff');
  assert.throws(() => rollDestinyDamage(fight), /stage/);
  fight = endDestinyRound(fight, [{ target: 'hero', amount: 2, ignoreArmour: true, source: 'venom' }]);
  assert.equal(fight.hero.health, 28);
  assert.equal(fight.phase, 'start');
});

test('the selected opponent attacks on a loss; armour prevents negative damage', () => {
  let fight = createDestinyFight(hero(), [enemy(), enemy({ brawn: 8 })]);
  fight = speed(startDestinyRound(fight, 1), 1, 1, 6, 6);
  fight = damage(fight, 4);
  assert.equal(fight.hero.health, 23);
  assert.equal(fight.opponents[0].health, 12);
  fight = endDestinyRound(fight);
  fight = speed(startDestinyRound(fight, 0), 1, 1, 6, 6);
  fight = damage(fight, 1);
  assert.equal(fight.hero.health, 23);
});

test('multi-opponent fights require every opponent to be defeated and allow changing targets', () => {
  let fight = createDestinyFight(hero(), [enemy({ health: 1 }), enemy({ health: 1 })]);
  fight = damage(speed(startDestinyRound(fight, 1), 6, 6, 1, 1), 1);
  assert.equal(fight.status, 'active');
  assert.equal(fight.phase, 'death-move');
  fight = endDestinyRound(skipDestinyDeathMove(fight));
  // Declining an immediate death move must not offer it a second time at round end.
  assert.equal(fight.phase, 'start');
  assert.throws(() => startDestinyRound(fight, 1), /living/);
  fight = damage(speed(startDestinyRound(fight, 0), 6, 6, 1, 1), 1);
  assert.equal(fight.status, 'win');
});

test('victory restores normal attributes and full health; exceptional recovery can be disabled', () => {
  const player = { ...hero(), health: 10, maxHealth: 30, brawn: 2, normal: { brawn: 7 } };
  for (const restoreOnVictory of [true, false]) {
    let fight = createDestinyFight(player, [enemy({ health: 1 })], { restoreOnVictory });
    fight = damage(speed(startDestinyRound(fight, 0), 6, 6, 1, 1), 1);
    assert.equal(fight.status, 'win');
    assert.equal(fight.hero.health, restoreOnVictory ? 30 : 10);
    assert.equal(fight.hero.brawn, restoreOnVictory ? 7 : 2);
  }
});

test('passive deaths are evaluated together before offering a death move', () => {
  let fight = createDestinyFight(hero(), [enemy({ health: 1 }), enemy({ health: 1 }), enemy()]);
  fight = speed(startDestinyRound(fight, 2), 4, 4, 3, 3);
  fight = endDestinyRound(fight, [0, 1].map(target => ({ target, amount: 1, ignoreArmour: true })));
  assert.deepEqual(fight.turn.deaths, [0, 1]);
  assert.equal(fight.phase, 'death-move');
  assert.equal(skipDestinyDeathMove(fight).phase, 'start');
});

test('simultaneous lethal passive damage cannot become a healed false victory', () => {
  let fight = createDestinyFight({ ...hero(), health: 1 }, [enemy({ health: 1 })]);
  fight = speed(startDestinyRound(fight, 0), 4, 4, 3, 3);
  fight = endDestinyRound(fight, ['hero', 0].map(target => ({ target, amount: 1, ignoreArmour: true })));
  assert.equal(fight.status, 'loss');
  assert.equal(fight.hero.health, 0);
  assert.equal(fight.opponents[0].health, 0);
});

test('invalid random results and invalid actions leave the saved input unchanged', () => {
  const fight = startDestinyRound(createDestinyFight(hero(), [enemy()]), 0);
  const before = structuredClone(fight);
  for (const value of [0, 7, NaN, 1.5]) assert.throws(() => rollDestinySpeed(fight, rolls(6, value)), /1-6/);
  assert.deepEqual(fight, before);
  assert.throws(() => resolveDestinyDamage(fight), /stage/);
  assert.throws(() => createDestinyFight(hero(), [enemy({ magic: 3 })]), /explicitly/);
  assert.throws(() => createDestinyFight(hero(), [enemy({ health: 0 })]), /health/);
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(fight)));
});
