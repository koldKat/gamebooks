import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// server/html-escape.js is CommonJS, no imports of its own - load it via
// createRequire rather than converting the whole test suite to CJS.
const require = createRequire(import.meta.url);
const { escapeHtml, escapeJsonString } = require('../../../server/html-escape.js');

describe('escapeHtml', () => {
  test('escapes the five HTML-significant characters', () => {
    assert.equal(escapeHtml(`<b>"a" & 'b'</b>`), '&lt;b&gt;&quot;a&quot; &amp; &#39;b&#39;&lt;/b&gt;');
  });

  test('also escapes single quotes, since some call sites embed the result in onclick="...""', () => {
    assert.equal(escapeHtml(`it's`), 'it&#39;s');
  });

  test('coerces null/undefined to empty string rather than "null"/"undefined"', () => {
    assert.equal(escapeHtml(null), '');
    assert.equal(escapeHtml(undefined), '');
  });

  test('coerces non-string values via String()', () => {
    assert.equal(escapeHtml(42), '42');
  });

  test('plain text passes through unchanged', () => {
    assert.equal(escapeHtml('hello world'), 'hello world');
  });
});

describe('escapeJsonString', () => {
  test('escapes backslashes and double quotes', () => {
    assert.equal(escapeJsonString('a\\b"c'), 'a\\\\b\\"c');
  });

  test('escapes newlines to a literal \\n and drops carriage returns', () => {
    assert.equal(escapeJsonString('line1\r\nline2'), 'line1\\nline2');
  });

  test('coerces null/undefined to empty string', () => {
    assert.equal(escapeJsonString(null), '');
    assert.equal(escapeJsonString(undefined), '');
  });

  test('does not touch HTML-significant characters - different job than escapeHtml', () => {
    assert.equal(escapeJsonString('<b>&</b>'), '<b>&</b>');
  });
});
