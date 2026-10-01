import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const featureDir = new URL('../../../public/js/covers/', import.meta.url);

test('cover feature dependencies remain acyclic and do not import the compatibility facade', () => {
  const modules = new Map(readdirSync(featureDir).filter(name => name.endsWith('.js')).map(name => [
    name, readFileSync(new URL(name, featureDir), 'utf8'),
  ]));
  const graph = new Map();
  for (const [name, source] of modules) {
    const dependencies = [];
    for (const match of source.matchAll(/^import .* from '([^']+)';/gm)) {
      assert.notEqual(match[1], '../covers.js', `${name} must not back-import the facade`);
      if (!match[1].startsWith('./')) continue;
      const dependency = match[1].slice(2);
      assert.ok(modules.has(dependency), `${name} imports an existing module`);
      dependencies.push(dependency);
    }
    graph.set(name, dependencies);
  }
  const visited = new Set(), visiting = new Set();
  function visit(name) {
    assert.ok(!visiting.has(name), `module cycle through ${name}`);
    if (visited.has(name)) return;
    visiting.add(name);
    for (const dependency of graph.get(name)) visit(dependency);
    visiting.delete(name);
    visited.add(name);
  }
  for (const name of modules.keys()) visit(name);
});

test('compatibility entry point retains the public cover API', () => {
  const source = readFileSync(new URL('../../../public/js/covers.js', import.meta.url), 'utf8');
  const names = [...source.matchAll(/^export function (\w+)/gm)].map(m => m[1]);
  for (const match of source.matchAll(/^export \{([^}]+)\}/gm)) names.push(...match[1].split(',').map(name => name.trim()));
  assert.deepEqual(names.sort(), [
    "_applyLandingBgPosition",
    "_canDragLandingBg",
    "_effectiveLandingCoverSource",
    "_isLandingBooksViewVisible",
    "_refillLazyIfShort",
    "_refreshCoversDisplay",
    "_refreshPublicCatalogIfVisible",
    "_resetLandingCoverQueue",
    "_showCachedCoversPanel",
    "_startLandingCoverRotation",
    "_startLazy",
    "_stopLandingCoverRotation",
    "_toggleCoverTooltipSettings",
    "_updateLandingBgDragUi",
    "_visibleCoverItemsExport",
    "initCoversPanel",
    "loadCovers",
    "openCoverActivity",
    "openSeriesActivity",
    "pauseCoversAutoRefresh",
    "resetFeedDisplayPrefsForLogout",
    "resumeCoversAutoRefresh",
    "setCoversHooks",
    "setCoversPrefsState"
  ]);
});
