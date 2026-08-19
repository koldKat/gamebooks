import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { hasSim } from '../../../public/mobile/js/battlesim-dispatch.js';

describe('hasSim', () => {
  test('true for a book with a battle sim', () => {
    assert.equal(hasSim(214), true);
    assert.equal(hasSim(8), true);
    assert.equal(hasSim(829), true);
  });

  test('false for a book with no battle sim', () => {
    assert.equal(hasSim(1), false);
    assert.equal(hasSim(999), false);
  });

  test('accepts a numeric-string bookId the same as a number (object key coercion)', () => {
    assert.equal(hasSim('214'), true);
    assert.equal(hasSim('1'), false);
  });
});
