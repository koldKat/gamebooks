import assert from 'node:assert/strict';
import test from 'node:test';
import { beginFight, defaults, exchange } from '../../../public/js/battlesim/books/1414/combat.js';

const guards = {
  kind: 'guards', section: 247, name: 'Стражи', count: 8,
  threshold: 12, wordThreshold: 11, playerLoss: 3, strategistLoss: 2,
  routes: { win: 257, loss: 267 },
};
const thorvald = {
  kind: 'duel', section: 374, name: 'Торвалд', stopAt: 1, positionBonus: 2,
  opponent: { name: 'Торвалд', strength: 4, strategistBonus: 1, fighting: 7 },
  routes: { win: 375, loss: 385 },
};
const chance = (...rolls) => () => rolls.shift();

test('guards check current strength and the guard word changes the threshold', () => {
  let fight = beginFight(defaults, guards);
  fight = exchange(fight, { chance: chance(3) }).fight;
  assert.deepEqual([fight.strength, fight.remaining], [4, 8]);
  fight = exchange(fight, { chance: chance(6) }).fight;
  assert.deepEqual([fight.strength, fight.remaining], [3, 8]);
  const prepared = beginFight(defaults, guards, { guardWord: true });
  assert.equal(exchange(prepared, { chance: chance(5) }).fight.remaining, 7);
});

test('all eight guards must fall, and prayer replaces only one check', () => {
  let fight = beginFight(defaults, guards);
  const first = exchange(fight, { prayer: true, chance: () => assert.fail('Prayer should not roll') });
  fight = first.fight;
  assert.equal(fight.remaining, 7);
  assert.throws(() => exchange(fight, { prayer: true }));
  for (let i = 0; i < 7; i += 1) fight = exchange(fight, { chance: chance(6) }).fight;
  assert.deepEqual([fight.outcome, fight.destination], ['win', 257]);
  assert.throws(() => exchange(beginFight(defaults, guards, { prayerUsed: true }), { prayer: true }));
});

test('the guard loss limit respects difficulty and reaching zero is fatal', () => {
  let fight = beginFight(defaults, guards, { strategist: true });
  for (let i = 0; i < 2; i += 1) fight = exchange(fight, { chance: chance(1) }).fight;
  assert.deepEqual([fight.strength, fight.outcome, fight.destination], [3, 'loss', 267]);
  fight = beginFight({ ...defaults, strength: 1 }, guards);
  fight = exchange(fight, { chance: chance(1) }).fight;
  assert.deepEqual([fight.strength, fight.outcome, fight.destination], [0, 'loss', null]);
});

test('Thorvald uses independent Chance rolls, wounds, position and a one-strength stop', () => {
  let fight = beginFight(defaults, thorvald, { strategist: true, wounds: 1, positionWord: true });
  assert.deepEqual([fight.enemy.strength, fight.enemy.fighting, fight.fighting], [4, 7, 3]);
  const tie = exchange(fight, { chance: chance(4, 1) });
  assert.equal(tie.event.hit, 'tie');
  assert.deepEqual([tie.fight.strength, tie.fight.enemy.strength], [5, 4]);
  for (let i = 0; i < 4; i += 1) fight = exchange(fight, { chance: chance(1, 6) }).fight;
  assert.deepEqual([fight.strength, fight.outcome, fight.destination], [1, 'loss', 385]);
});
