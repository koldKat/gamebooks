import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseRequestUrl, requestQueryParameter } = require('../../../server/request-url.js');

test('scanner-style authority request targets are rejected instead of parsed', () => {
  assert.equal(parseRequestUrl('//%2F.env'), null);
  assert.equal(requestQueryParameter({ url: '//%2F.env' }, 'token'), null);
});

test('ordinary paths retain query parameter parsing', () => {
  const parsed = parseRequestUrl('/api/books?token=abc123&view=compact');
  assert.equal(parsed.pathname, '/api/books');
  assert.equal(requestQueryParameter({ url: '/api/books?token=abc123' }, 'token'), 'abc123');
});

test('invalid and non-origin request targets fail closed', () => {
  assert.equal(parseRequestUrl('https://attacker.invalid/path'), null);
  assert.equal(parseRequestUrl('/\\attacker.invalid/path'), null);
  assert.equal(parseRequestUrl('/bad\u0000path'), null);
  assert.equal(parseRequestUrl(''), null);
  assert.equal(requestQueryParameter({ url: null }, 'token'), null);
});
