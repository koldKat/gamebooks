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

for (const key of ['sim1592', 'sim1596', 'sim1597', 'sim1598', 'sim1607', 'sim1608', 'sim1649', 'sim261', 'sim262', 'sim281', 'sim282', 'sim283', 'sim284', 'sim310', 'sim311', 'sim312']) test(key + ' rewards only new wins and losses', () => {
  const source = readFileSync(new URL('../../../server/db/xp.js', import.meta.url), 'utf8');
  const registration = source.slice(source.indexOf('const SIM_HISTORY_KEYS ='), source.indexOf('const RETIRED_SIM_HISTORY_KEYS ='));
  const start = source.indexOf('    for (const simKey of SIM_HISTORY_KEYS)');
  const end = source.indexOf('\n  }\n\n  // Award every', start);
  assert.ok(start > 0 && end > start);
  const calls = [], context = vm.createContext({awardXp:(...args) => calls.push(args)});
  vm.runInContext(registration + '\nfunction sync(newPt,oldPt){const userId=1;' + source.slice(start,end) + '\n}', context);
  const current = {[key]:{history:['win','loss','ended','fled','cancelled'].map((outcome, index) => ({outcome, ts:index + 1}))}};
  context.sync(current, {});
  assert.deepEqual(calls, [[1,'battlesim_win',key+':1'],[1,'battlesim_loss',key+':2']]);
  context.sync(current, current);
  assert.equal(calls.length, 2);
});
