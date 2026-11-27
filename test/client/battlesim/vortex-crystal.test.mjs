import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diceFor, rollFight, startFight, validateFight } from '../../../public/js/battlesim/books/1927/combat.js';

const hero = { strength: 8, endurance: 8, dexterity: 8, charisma: 9, mentality: 10, brawling: 8 };
const base = { section: '100', name: 'Test opponent', targetStats: ['brawling'], opponentDice: 1, opponentModifier: 1,
  saves: [{ stat: 'strength', onPass: -3, onFail: 2 }], win: 101, loss: 102 };
const play = (spec, steps) => steps.reduce(rollFight, startFight(hero, spec));

test('conditional attack treats an equal score according to the printed comparison', () => {
  const steps = [[1, 1], [1], [4, 5]];
  const tie = play({ ...base, strictTie: true }, steps);
  assert.equal(tie.target, 6);
  assert.equal(tie.status, 'tie');
  assert.equal(tie.recorded, true);
  assert.deepEqual(tie.destinations, []);
  assert.deepEqual(play(base, steps).destinations, ['101']);
  assert.throws(() => validateFight({ ...tie, destinations: ['101'] }));
});

test('disarming, picking up the spanner and attacking remain distinct steps', () => {
  const spec = { ...base, opponentModifier: 0,
    continuation: { kind: 'disarmThenAttack', pickupStat: 'dexterity', attackOpponentModifier: -2 } };
  const beforePickup = play(spec, [[1, 1], [1], [2, 2]]);
  assert.equal(beforePickup.phase, 'pickup');
  assert.deepEqual(rollFight(beforePickup, [5, 4]).destinations, ['102']);
  const armed = rollFight(beforePickup, [4, 4]);
  assert.equal(armed.round, 2);
  assert.equal(diceFor(armed), 1);
  const attack = rollFight(armed, [3]);
  assert.equal(attack.modifier, -3);
  assert.equal(attack.target, 7);
  assert.equal(rollFight(attack, [5, 5]).status, 'win');
});

test('failed attack can require an injury roll before writing the result', () => {
  const spec = { ...base, loss: [102, 103], failureSave: { stat: 'dexterity', onPass: 102, onFail: 103 } };
  const injury = play(spec, [[6, 6], [6], [6, 6]]);
  assert.equal(injury.phase, 'failure');
  assert.equal(injury.status, 'fighting');
  assert.deepEqual(rollFight(injury, [3, 5]).destinations, ['102']);
  assert.deepEqual(rollFight(injury, [4, 5]).destinations, ['103']);
});

test('mental combat uses reduced attributes and floors damage at two', () => {
  const spec = { ...base, opponentDice: 2, opponentModifier: 0, targetStats: ['mentality'],
    saves: [{ stat: 'endurance', onPass: -2, onFail: 3 }], openingChanges: { mentality: -4, endurance: -4 },
    lossChanges: { mentality: -4, endurance: -2 }, bonus: { key: 'clueZ', modifier: -2 } };
  const start = startFight(hero, spec, true);
  assert.equal(start.player.mentality, 6);
  assert.equal(start.player.endurance, 4);
  const loss = [[2, 3], [5, 5], [6, 6]].reduce(rollFight, start);
  assert.equal(loss.modifier, 1);
  assert.equal(loss.target, -4);
  assert.equal(loss.player.mentality, 2);
  assert.equal(loss.player.endurance, 2);
  assert.equal(loss.status, 'loss');
  assert.equal(hero.mentality, 10);
});
