import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rollFight, startFight, validateFight } from '../../../public/js/battlesim/books/1926/combat.js';

const character = { strength: 8, dexterity: 8 };
const encounter = { section: 100, name: 'Test opponent', modifiers: [18],
  kind: 'opposed', winAtMost: 7, loseAtLeast: 8, successSection: 101, failureSection: 102 };

test('opposed result uses the current attributes and the printed threshold', () => {
  const fight = startFight(character, encounter);
  const won = rollFight(fight, [2, 3]);
  assert.equal(won.rolls[0].total, 7);
  assert.equal(won.destination, 101);
  assert.equal(won.status, 'win');
  assert.equal(rollFight(fight, [3, 3]).destination, 102);
  assert.equal(fight.status, 'fighting');
  assert.throws(() => rollFight(won, [1, 1]));
  assert.throws(() => rollFight(fight, [1, 7]));
  assert.throws(() => validateFight({ ...won, destination: 102 }));
});

test('only the neutral struggle band advances to another round', () => {
  const rules = { ...encounter, kind: 'struggle', modifiers: [18, 10, 50], winAtMost: 5, loseAtLeast: 9 };
  const fight = startFight({ strength: 7, dexterity: 7 }, rules);
  const second = rollFight(fight, [1, 1]);
  assert.equal(second.round, 2);
  assert.equal(second.destination, null);
  assert.equal(rollFight(second, [2, 2]).destination, 101);
  const third = rollFight(second, [5, 5]);
  assert.equal(third.round, 3);
  assert.equal(rollFight(third, [1, 1]).destination, 102);
});

test('disarm applies the strength reduction only above nine', () => {
  const rules = { ...encounter, kind: 'disarm', modifiers: [4] };
  const fight = strength => startFight({ strength, dexterity: 8 }, rules);
  assert.equal(rollFight(fight(9), [2, 3]).status, 'loss');
  assert.equal(rollFight(fight(10), [2, 3]).status, 'win');
  assert.equal(rollFight(fight(10), [3, 3]).status, 'loss');
  assert.equal(rollFight(fight(11), [3, 3]).status, 'win');
});
