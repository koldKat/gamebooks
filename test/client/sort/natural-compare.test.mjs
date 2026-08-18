import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { naturalCompare, naturalCompareByName } from '../../../public/js/sort.js';

describe('naturalCompare', () => {
  test('sorts embedded numbers numerically, not lexicographically', () => {
    const list = ['Book 10', 'Book 2', 'Book 1'];
    list.sort(naturalCompare);
    assert.deepEqual(list, ['Book 1', 'Book 2', 'Book 10']);
  });

  test('is case-insensitive (base sensitivity)', () => {
    assert.equal(naturalCompare('apple', 'APPLE'), 0);
  });

  test('coerces null/undefined to empty string rather than throwing', () => {
    assert.doesNotThrow(() => naturalCompare(null, undefined));
  });

  test('returns negative/positive/zero consistent with a-then-b ordering', () => {
    assert.ok(naturalCompare('a', 'b') < 0);
    assert.ok(naturalCompare('b', 'a') > 0);
    assert.equal(naturalCompare('a', 'a'), 0);
  });
});

describe('naturalCompareByName', () => {
  test('compares by the .name property of each object', () => {
    const list = [{ name: 'Book 10' }, { name: 'Book 2' }];
    list.sort(naturalCompareByName);
    assert.deepEqual(list.map(b => b.name), ['Book 2', 'Book 10']);
  });

  test('does not throw on an object missing .name', () => {
    assert.doesNotThrow(() => naturalCompareByName({}, { name: 'Book 1' }));
  });
});
