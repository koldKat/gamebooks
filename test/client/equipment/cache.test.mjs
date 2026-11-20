import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('equipment reuses inventory icons and fetches only missing IDs without retaining stale responses', () => {
  const result = spawnSync(process.execPath, ['--experimental-vm-modules', '--input-type=module', '--eval', `
    import assert from 'node:assert/strict';
    import { readFileSync } from 'node:fs';
    import { SourceTextModule, SyntheticModule, createContext } from 'node:vm';
    const context = createContext({});
    const icons = new Map([1, 2, 3].map(id => [id, { id, svg_data: '<svg/>' }]));
    const runtime = { _itemCache: new Map(), cacheEpoch: 0 };
    const requests = [];
    let resolveResponse;
    const dependencies = {
      '../inventory.js': { getCachedInventoryItem: id => icons.get(id) ?? null },
      '../core/state.js': { apiFetch: url => {
        requests.push(url);
        return new Promise(resolve => { resolveResponse = resolve; });
      } },
      './runtime.js': { equipmentRuntime: runtime },
      './model.js': { _eq: () => ({}), _eqItemId: x => x,
        _captureEqContext: () => ({}), _isEqContextCurrent: () => true }
    };
    const mod = new SourceTextModule(readFileSync('public/js/equipment/cache.js', 'utf8'), { context });
    await mod.link(name => {
      const exports = dependencies[name];
      return new SyntheticModule(Object.keys(exports), function () {
        for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
      }, { context });
    });
    await mod.evaluate();
    const { _fetchItems, _byId } = mod.namespace;
    await _fetchItems([1, 2, 3]);
    assert.equal(requests.length, 0, 'three loaded inventory items need no network');
    assert.equal(_byId(1), icons.get(1), 'reuse the original object, not a duplicate SVG');
    runtime._itemCache.clear();
    await _fetchItems([1, 2, 3]);
    assert.equal(requests.length, 0, 'reopening after picker pruning still needs no network');
    const missing = _fetchItems([1, 4, 4]);
    assert.equal(requests[0], '/api/items?ids=4');
    resolveResponse({ ok: true, json: async () => [{ id: 4 }] });
    await missing;
    assert.equal(_byId(4).id, 4);
    let current = true;
    const stale = _fetchItems([5], () => current);
    current = false;
    resolveResponse({ ok: true, json: async () => [{ id: 5 }] });
    await stale;
    assert.equal(_byId(5), null, 'closed picker must reject its late response');
    await _fetchItems([3], () => false);
    assert.equal(requests.length, 2, 'invalid context must not start a request');
  `], { encoding: 'utf8', timeout: 10000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
