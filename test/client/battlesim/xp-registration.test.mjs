import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import vm from 'node:vm';

test('every active simulator has exactly one outcome XP history registration', () => {
  const source = readFileSync(new URL('../../../server/db/xp.js', import.meta.url), 'utf8');
  const start = source.indexOf('const SIM_HISTORY_KEYS =');
  const end = source.indexOf('const RETIRED_SIM_HISTORY_KEYS =');
  assert.ok(start >= 0 && end > start);
  const keys = vm.runInNewContext(source.slice(start, end) + '\nSIM_HISTORY_KEYS;');
  for (const file of readdirSync(new URL('../../../public/js/battlesim/', import.meta.url))) {
    const match = /^battlesim(\d+)\.js$/.exec(file);
    if (match) assert.equal(keys.filter(key => key === 'sim' + match[1]).length, 1, file);
  }
});
