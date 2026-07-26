import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseSecId, isValidSecId, isTerminal } from '../public/js/state.js';

describe('parseSecId', () => {
  test('parses positive integer strings as numbers', () => {
    assert.equal(parseSecId('1'), 1);
    assert.equal(parseSecId('42'), 42);
    assert.equal(parseSecId(' 7 '), 7);
  });

  test('parses "-1" and "0" as the death/win sentinels, not the string', () => {
    assert.equal(parseSecId('-1'), -1);
    assert.equal(parseSecId('0'), 0);
    assert.equal(parseSecId(-1), -1);
    assert.equal(parseSecId(0), 0);
  });

  test('keeps alphanumeric section IDs as trimmed strings', () => {
    assert.equal(parseSecId('A5B'), 'A5B');
    assert.equal(parseSecId(' A5B '), 'A5B');
  });

  test('rejects non-positive-integer numeric strings back to string form', () => {
    // Not a sentinel and not a clean positive integer - falls through to string.
    assert.equal(parseSecId('1.5'), '1.5');
    assert.equal(parseSecId('-5'), '-5');
  });

  test('returns null for empty/nullish input', () => {
    assert.equal(parseSecId(null), null);
    assert.equal(parseSecId(undefined), null);
    assert.equal(parseSecId(''), null);
    assert.equal(parseSecId('   '), null);
  });
});

describe('isValidSecId', () => {
  test('accepts positive integers only', () => {
    assert.equal(isValidSecId(1), true);
    assert.equal(isValidSecId(42), true);
    assert.equal(isValidSecId(0), false);
    assert.equal(isValidSecId(-1), false);
    assert.equal(isValidSecId(1.5), false);
  });

  test('accepts non-empty strings (alphanumeric section IDs)', () => {
    assert.equal(isValidSecId('A5B'), true);
    assert.equal(isValidSecId(''), false);
  });

  test('rejects null/undefined', () => {
    assert.equal(isValidSecId(null), false);
    assert.equal(isValidSecId(undefined), false);
  });
});

describe('isTerminal', () => {
  test('true only for the -1 (death) and 0 (win) sentinels', () => {
    assert.equal(isTerminal(-1), true);
    assert.equal(isTerminal(0), true);
    assert.equal(isTerminal(1), false);
    assert.equal(isTerminal('A5B'), false);
  });
});
