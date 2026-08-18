import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { safeFilename } = require('../../../server/export.js');

describe('safeFilename', () => {
  test('strips filesystem-illegal characters', () => {
    assert.equal(safeFilename('a<b>c:d"e/f\\g|h?i*j', 'fallback'), 'abcdefghij');
  });

  test('trims surrounding whitespace', () => {
    assert.equal(safeFilename('  Book Title  ', 'fallback'), 'Book Title');
  });

  test('preserves non-Latin Unicode (Cyrillic, CJK, etc.)', () => {
    assert.equal(safeFilename('Сърце от камък', 'fallback'), 'Сърце от камък');
  });

  test('falls back for a Windows-reserved device name, case-insensitive', () => {
    assert.equal(safeFilename('CON', 'fallback'), 'fallback');
    assert.equal(safeFilename('con', 'fallback'), 'fallback');
    assert.equal(safeFilename('lpt1', 'fallback'), 'fallback');
  });

  test('a reserved name with an extension still falls back', () => {
    assert.equal(safeFilename('con.html', 'fallback'), 'fallback');
  });

  test('a name that merely starts with a reserved word is not reserved (e.g. "console")', () => {
    assert.equal(safeFilename('console', 'fallback'), 'console');
  });

  test('falls back when nothing legal is left after stripping', () => {
    assert.equal(safeFilename('<>:"/\\|?*', 'fallback'), 'fallback');
    assert.equal(safeFilename('   ', 'fallback'), 'fallback');
  });

  test('truncates to the max length without leaving a dangling lone surrogate half', () => {
    // 150 'a's then an astral emoji (surrogate pair) - slicing at exactly 150
    // UTF-16 code units would land mid-surrogate-pair without the fix.
    const longName = 'a'.repeat(150) + '\u{1F600}';
    const result = safeFilename(longName, 'fallback');
    assert.ok(result.length <= 150);
    // No lone high surrogate left dangling at the end.
    assert.ok(!/[\uD800-\uDBFF]$/.test(result));
  });
});
