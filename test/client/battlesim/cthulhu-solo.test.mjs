import { test } from 'node:test';
import assert from 'node:assert/strict';
import { successLevel, percentileCheck, damageDice, opposedResult } from '../../../public/js/battlesim/engines/cthulhu-solo/checks.js';

const sequence = values => {
  let index = 0;
  return () => { assert.ok(index < values.length, 'unexpected extra die'); return values[index++]; };
};

test('Nyarlathotep uses the printed universal 96–100 fumble and success boundaries', () => {
  assert.deepEqual([1, 10, 11, 26, 27, 53, 54, 95, 96, 100].map(r => successLevel(r, 53)),
    [5, 4, 3, 3, 2, 2, 1, 1, 0, 0]);
  assert.equal(successLevel(96, 225), 0);
  assert.equal(successLevel(1, 0), 5);
});

test('advantage retains the units die and treats 00 as 100 when choosing tens', () => {
  const result = percentileCheck(40, 1, sequence([0, 0, .4]));
  assert.deepEqual(result.tens, [0, 4]);
  assert.equal(result.roll, 40);
  assert.equal(result.level, 2);
  assert.equal(percentileCheck(40, -1, sequence([0, 0, .4])).roll, 100);
  assert.equal(percentileCheck(70, 2, sequence([.7, .8, .5, .2])).roll, 27);
});

test('the vampire grapple retains its printed60/20/8thresholds instead of repairing them', () => {
  const printed = { hard: 20, extreme: 8 };
  assert.deepEqual([8, 9, 20, 21, 30, 60, 61].map(roll => successLevel(roll, 60, printed)), [4, 3, 3, 2, 2, 2, 1]);
  assert.equal(percentileCheck(60, 0, sequence([0, .3]), 0, printed).level, 2);
});

test('Bast adds a separate percentile roll after selecting the advantaged attack', () => {
  const check = percentileCheck(80, 1, sequence([.1, .3, .1]), 85);
  assert.equal(check.raw, 11);
  assert.equal(check.roll, 96);
  assert.equal(check.level, 0);
});

test('vampire, Dog Man and Hunting Horror opposed ties follow their distinct printed rules', () => {
  assert.deepEqual(opposedResult(3, 3), { attacker: false, defender: true });
  assert.deepEqual(opposedResult(3, 3, { tie: 'both' }), { attacker: true, defender: true });
  assert.deepEqual(opposedResult(1, 1, { tie: 'both' }), { attacker: false, defender: false });
  assert.deepEqual(opposedResult(4, 2), { attacker: true, defender: false });
});

test('native damage formulas preserve DB, flat bonuses, maxima and nonnegative damage', () => {
  assert.equal(damageDice('1D10+2+DB', () => 0, { db: '3D6' }).total, 6);
  assert.equal(damageDice('1D8+1+DB', () => { throw Error('maximum does not roll'); }, { db: '1D4', maximize: true }).total, 13);
  assert.equal(damageDice('1D6-1', () => 0).total, 0);
  assert.equal(damageDice('4D6', () => .99).total, 24);
  assert.equal(damageDice('1D3+DB', () => 0, { db: '+1D6' }).total, 2);
  assert.equal(damageDice('1D3+DB', () => .99, { db: '-1D4' }).total, 0);
});

test('invalid combat values and unbounded dice fail before mutating any fight state', () => {
  for (const formula of ['1D6;alert(1)', '999D6', '2D0', '1D6 garbage', '']) assert.throws(() => damageDice(formula));
  assert.throws(() => damageDice('DB', Math.random, { db: 'DB' }));
  assert.throws(() => percentileCheck(40, 3));
  assert.throws(() => percentileCheck(40, 0, () => 1));
  assert.throws(() => opposedResult(6, 2));
});
