import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const dir = new URL('../../../public/js/graph/', import.meta.url);
test('graph modules remain acyclic and never back-import their facade', () => {
  const modules = new Map(readdirSync(dir).filter(n => n.endsWith('.js')).map(n => [n, readFileSync(new URL(n, dir), 'utf8')]));
  const visiting = new Set(), visited = new Set();
  function visit(name) {
    assert.ok(!visiting.has(name), `cycle through ${name}`); if (visited.has(name)) return;
    visiting.add(name);
    for (const match of modules.get(name).matchAll(/(?:import|export) .* from '([^']+)';/g)) {
      assert.notEqual(match[1], '../graph.js'); if (!match[1].startsWith('./')) continue;
      const dependency = match[1].slice(2); assert.ok(modules.has(dependency)); visit(dependency);
    }
    visiting.delete(name); visited.add(name);
  }
  for (const name of modules.keys()) visit(name);
});
