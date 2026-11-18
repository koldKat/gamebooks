'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const read = name => readFileSync(resolve(__dirname, '..', 'docs', name), 'utf8');

test('player seasonal guidance stays general rather than publishing the event schedule or bonus rules', () => {
  const guide = read('user-guide.md');
  const section = guide.split('### Seasonal events\n')[1]?.split('\n### ')[0];
  assert.ok(section);
  assert.doesNotMatch(section, /Halloween|Diwali|Thanksgiving|Nicholas|Lucia|Christmas|New Year|Friday the 13th/i);
  assert.doesNotMatch(section, /\d|double|fivefold|multiplier|qualifying|payout/i);
});

test('player and technical guides exclude progression formulas and financial reward schedules', () => {
  for (const name of ['user-guide.md', 'technical.md']) {
    const text = read(name);
    assert.doesNotMatch(text, /(?:level|XP) (?:cap|buffer)|next-level buffer|floor\(|sqrt\(/i, name);
    assert.doesNotMatch(text, /\b\d[\d,.]*\s*(?:base\s+)?XP\b|\b\d+\s*(?:ruby|rubies|diamond|diamonds|GC)\s+(?:per|at|for every)\b/i, name);
    assert.doesNotMatch(text, /retroactiv|backfill|root cause|bug resolution|fixed on \d/i, name);
  }
});
