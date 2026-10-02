import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const dir = new URL('../../../public/js/play/', import.meta.url);
test('play controller modules stay acyclic and use one render-panel registration', () => {
  const modules = new Map(readdirSync(dir).filter(n => n.endsWith('.js')).map(n => [n, readFileSync(new URL(n, dir), 'utf8')]));
  // These were external play features before relocation; their existing facade
  // dependencies are not part of the controller implementation's internal DAG.
  const features = new Set(['dice.js', 'notes.js', 'charsheet.js', 'open-world.js', 'party.js', 'bg.js']);
  const visiting = new Set(), visited = new Set();
  function visit(name) {
    assert.ok(!visiting.has(name), `cycle through ${name}`);
    if (visited.has(name)) return;
    visiting.add(name);
    for (const match of modules.get(name).matchAll(/(?:import|export) .* from '([^']+)';/g)) {
      assert.notEqual(match[1], '../play.js');
      if (!match[1].startsWith('./')) continue;
      const dependency = match[1].slice(2);
      assert.ok(modules.has(dependency), dependency);
      if (!features.has(dependency)) visit(dependency);
    }
    visiting.delete(name); visited.add(name);
  }
  for (const name of modules.keys()) if (!features.has(name)) visit(name);
  assert.equal([...modules.values()].filter(source => /setPanelRenderer\(renderPlaythroughPanel\)/.test(source)).length, 1);
  const facade = readFileSync(new URL('../play.js', dir), 'utf8');
  assert.match(facade, /import '\.\/play\/init\.js';/);
  assert.doesNotMatch(facade, /\b(?:function|setTimeout|addEventListener)\b/);
});
