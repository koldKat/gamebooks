import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../../public/js/core/state.js', import.meta.url), 'utf8').replace(/^export /gm, '');
test('strict reader loads preserve existing progress on HTTP, network and invalid-response failures', async () => {
  let response = { ok: false };
  const context = vm.createContext({ localStorage: { getItem: () => 'token' },
    fetch: async () => { if (response instanceof Error) throw response; return response; } });
  vm.runInContext(source, context);
  vm.runInContext('state.playthroughs = [{path:[1,25]}]; setCurrentBookId(14); globalThis.original = state', context);
  for (response of [{ ok: false }, new Error('offline'), { ok: true, json: async () => null }]) {
    await assert.rejects(context.loadState(263, { strict: true }));
    assert.equal(vm.runInContext('state === original && currentBookId === 14', context), true);
  }
  response = { ok: true, json: async () => ({ playthroughs: [], graph: {} }) };
  await context.loadState(263, { strict: true, isCurrent: () => false });
  assert.equal(vm.runInContext('state === original && currentBookId === 14', context), true, 'late response cannot replace another session');
  await context.loadState(263, { strict: true });
  assert.equal(vm.runInContext('currentBookId === 263 && state !== original', context), true);
});

test('legacy default load failure retains its existing empty-state fallback', async () => {
  const context = vm.createContext({ localStorage: { getItem: () => 'token' }, fetch: async () => ({ ok: false }) });
  vm.runInContext(source, context);
  await context.loadState(263);
  assert.equal(vm.runInContext('currentBookId === 263 && state.playthroughs.length === 0', context), true);
});
