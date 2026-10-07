import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initialFortune, rollExchange, spendFortune, recoverVitality } from '../../../public/js/battlesim/engines/skyfall-rules.js';
import { expandMarshEncounter } from '../../../public/js/battlesim/engines/skyfall/monsters-of-the-marsh.js';

const sequence = values => {
  let index = 0;
  return () => {
    assert.ok(index < values.length, 'Unexpected extra coin toss');
    return values[index++];
  };
};

test('initial Fortune follows three independent coins, not a uniform four-value roll', () => {
  const counts = new Map();
  for (let mask = 0; mask < 8; mask++) {
    const result = initialFortune(sequence([0, 1, 2].map(bit => mask & (1 << bit) ? 0.9 : 0.1)));
    counts.set(result.fortune, (counts.get(result.fortune) || 0) + 1);
  }
  assert.deepEqual([...counts].sort((a, b) => a[0] - b[0]), [[7, 1], [9, 3], [11, 3], [13, 1]]);
});

test('opposed attacks add the number of heads; negative Expertise is valid', () => {
  const result = rollExchange({ playerExpertise: -1, enemyExpertise: 1 }, sequence([0.1, 0.1, 0.1, 0.1, 0.9, 0.9, 0.9, 0.9]));
  assert.equal(result.player.total, 3);
  assert.equal(result.enemy.total, 1);
  assert.equal(result.outcome, 'player');
});

test('surprise subtracts three tails from the defender only', () => {
  const result = rollExchange({ playerExpertise: 12, enemyExpertise: 12, surprise: 'player' }, sequence([0.9, 0.9, 0.1, ...Array(8).fill(0.9)]));
  assert.equal(result.surprisePenalty, 2);
  assert.equal(result.player.total, 12);
  assert.equal(result.enemy.total, 10);
});

test('tie rerolls retain the original surprise penalty without tossing surprise coins again', () => {
  const result = rollExchange({ playerExpertise: 10, enemyExpertise: 12, surprise: 'player', surprisePenalty: 2 }, sequence(Array(8).fill(0.9)));
  assert.equal(result.outcome, 'tie');
  assert.equal(result.surprisePenalty, 2);
});

test('Fortune adds at most one point to a player hit', () => {
  assert.deepEqual(spendFortune({ outcome: 'player', weaponDamage: 2, enemyDamage: 4, fortune: 10, attackBonus: true }), { playerLoss: 0, enemyLoss: 3, fortuneSpent: 1 });
  assert.equal(spendFortune({ outcome: 'player', weaponDamage: 2, enemyDamage: 4, fortune: 0, attackBonus: true }).enemyLoss, 2);
});

test('defensive Fortune can cancel a whole wound but cannot overdraw or be wasted', () => {
  assert.deepEqual(spendFortune({ outcome: 'enemy', weaponDamage: 2, enemyDamage: 4, fortune: 10, defensePoints: 20 }), { playerLoss: 0, enemyLoss: 0, fortuneSpent: 4 });
  assert.deepEqual(spendFortune({ outcome: 'enemy', weaponDamage: 2, enemyDamage: 4, fortune: 2, defensePoints: 20 }), { playerLoss: 2, enemyLoss: 0, fortuneSpent: 2 });
});

test('ties cost neither Vitality nor Fortune', () => {
  assert.deepEqual(spendFortune({ outcome: 'tie', weaponDamage: 2, enemyDamage: 4, fortune: 10, attackBonus: true, defensePoints: 4 }), { playerLoss: 0, enemyLoss: 0, fortuneSpent: 0 });
});

test('healing is capped at 20 and cannot revive dead characters', () => {
  assert.equal(recoverVitality(19, 8), 20);
  assert.equal(recoverVitality(10, 4), 14);
  assert.equal(recoverVitality(0, 8), 0);
  assert.equal(recoverVitality(-2, 8), -2);
});

test('Hydra has seven separate four-Vitality heads, not one shared health pool', () => {
  const encounter = expandMarshEncounter(14);
  assert.equal(encounter.mode, 'one-target');
  assert.equal(encounter.foes.length, 7);
  assert.ok(encounter.foes.every(foe => foe.vitality === 4 && foe.expertise === 12));
});

test('Crocodile groups preserve the large animal and seven smaller ones', () => {
  const encounter = expandMarshEncounter(398);
  assert.equal(encounter.foes.length, 8);
  assert.deepEqual(encounter.foes.map(foe => foe.vitality), [12, 10, 10, 10, 10, 10, 10, 10]);
  assert.equal(encounter.expertiseModifier, -2);
});

test('source variants retain different Eagle damage and Ram Vitality', () => {
  assert.equal(expandMarshEncounter(32).foes[0].damage, 2);
  assert.equal(expandMarshEncounter(60).foes[0].damage, 3);
  assert.equal(expandMarshEncounter(33).foes[0].vitality, 5);
  assert.equal(expandMarshEncounter(357).foes[0].vitality, 6);
});

test('conditional groups accept only the source-supported counts', () => {
  assert.equal(expandMarshEncounter(201, { count: 1 }).foes.length, 1);
  assert.equal(expandMarshEncounter(376, { count: 5 }).foes.length, 5);
  assert.throws(() => expandMarshEncounter(376, { count: 7 }), RangeError);
});

test('missing Snake damage is explicit, never silently invented', () => {
  assert.throws(() => expandMarshEncounter(289), RangeError);
  assert.equal(expandMarshEncounter(289, { manualDamage: 2 }).foes[0].damage, 2);
});
