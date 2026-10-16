import test from 'node:test';
import assert from 'node:assert/strict';
import * as rules from '../../../public/js/battlesim/engines/sorcery/core.js';

const rolls = (...values) => () => { assert.ok(values.length, 'Unexpected die'); return values.shift(); };

test('Sorcery: warrior and wizard initial rolls use the printed defaults', () => {
  const warrior = rules.newCharacter('warrior', rolls(1, 2, 3, 4));
  assert.equal(warrior.skill, 7);
  assert.equal(warrior.stamina, 17);
  assert.equal(warrior.luck, 10);
  assert.equal(warrior.provisions, 2);
  assert.equal(warrior.gold, 20);
  assert.equal(rules.newCharacter('wizard', () => 6).skill, 10);
  assert.throws(() => rules.newCharacter('cleric'), RangeError);
  for (const value of [0, 7, 1.5, NaN]) assert.throws(() => rules.die(() => value), RangeError);
});

test('Sorcery: attack rolls expose both dice and keep ordinary ties harmless', () => {
  const attack = rules.attackStrength(9, -2, rolls(3, 4));
  assert.deepEqual(attack, { dice: [3, 4], total: 14 });
  assert.equal(rules.compareAttacks(14, 14), 'tie');
  assert.equal(rules.compareAttacks(14, 14, true), 'player');
  assert.equal(rules.compareAttacks(14, 15, true), 'enemy');
  assert.equal(rules.compareAttacks(15, 14), 'player');
  assert.equal(rules.attackStrength(1, -3, () => 1).total, 2);
});

test('Sorcery: Luck adjusts damage by the printed amounts without inventing a wound', () => {
  assert.equal(rules.damageWithLuck('outgoing', 2, true), 4);
  assert.equal(rules.damageWithLuck('outgoing', 2, false), 1);
  assert.equal(rules.damageWithLuck('incoming', 2, true), 1);
  assert.equal(rules.damageWithLuck('incoming', 2, false), 3);
  assert.equal(rules.damageWithLuck('incoming', 0, false), 0);
  assert.equal(rules.damageWithLuck('outgoing', 2), 2);
  assert.throws(() => rules.damageWithLuck('outgoing', 2, 'lucky'), RangeError);
});

test('Sorcery: transactions preserve caller state and never heal a dead character', () => {
  const character = { ...rules.newCharacter('wizard', () => 6), inventory: ['kept'] };
  const snapshot = structuredClone(character);
  const wounded = rules.loseStamina(character, 5);
  assert.equal(wounded.stamina, 19);
  assert.equal(rules.healStamina(wounded, 100).stamina, 24);
  assert.deepEqual(character, snapshot);
  wounded.inventory.push('changed');
  assert.deepEqual(character.inventory, ['kept']);
  const dead = rules.loseStamina(character, 24);
  assert.equal(dead.dead, true);
  assert.throws(() => rules.healStamina(dead, 1), RangeError);
  assert.throws(() => rules.validateCharacter({ ...character, skill: 11 }), RangeError);
  assert.equal(rules.healStamina({ ...character, stamina: 10, afflictions: ['fever'] }, 4).stamina, 10);
});

test('Sorcery: mandatory Luck tests can fail at zero without trapping play or going negative', () => {
  const character = rules.newCharacter('warrior', () => 6);
  const tested = rules.testLuck({ ...character, luck: 2 }, rolls(1, 1));
  assert.equal(tested.lucky, true);
  assert.equal(tested.character.luck, 1);
  assert.equal(character.luck, 12);
  const empty = rules.testLuck({ ...character, luck: 0 }, rolls(1, 1));
  assert.equal(empty.lucky, false);
  assert.equal(empty.character.luck, 0);
});
