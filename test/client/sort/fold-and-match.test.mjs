import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { foldForSearch, matchesSearch } from '../../../public/js/sort.js';

describe('foldForSearch', () => {
  test('lowercases and normalizes for comparison', () => {
    assert.equal(foldForSearch('HELLO'), 'hello');
  });

  test('coerces null/undefined to empty string rather than throwing', () => {
    assert.equal(foldForSearch(null), '');
    assert.equal(foldForSearch(undefined), '');
  });

  test('coerces non-string values (e.g. numbers) via String()', () => {
    assert.equal(foldForSearch(42), '42');
  });

  test('folds Cyrillic case the same way as Latin', () => {
    assert.equal(foldForSearch('СЪРЦЕ'), 'сърце');
  });
});

describe('matchesSearch', () => {
  test('true when the folded query is a substring of the folded value', () => {
    assert.equal(matchesSearch('The Forest of Doom', 'forest'), true);
    assert.equal(matchesSearch('The Forest of Doom', 'FOREST'), true);
  });

  test('false when the query is not present', () => {
    assert.equal(matchesSearch('The Forest of Doom', 'desert'), false);
  });

  test('false for an empty query - an empty query should never blanket-match everything', () => {
    assert.equal(matchesSearch('The Forest of Doom', ''), false);
  });

  test('a whitespace-only query still returns false, but via the substring check, not the empty-query guard - foldForSearch does not trim', () => {
    assert.equal(matchesSearch('The Forest of Doom', '   '), false);
  });

  test('false against a null/undefined value', () => {
    assert.equal(matchesSearch(null, 'forest'), false);
  });
});
