import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

for (const [name, path] of [
  ['desktop', '../../../public/js/reading/liveread.js'],
  ['mobile', '../../../public/mobile/js/reader.js'],
]) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const start = source.indexOf('function _bindMapEntry(');
  const end = source.indexOf('\n}\n', start) + 2;
  assert.ok(start >= 0 && end > start);
  const binding = source.slice(start, end);

  function fixture(maxSectionNumber) {
    let handlers;
    const visits = [];
    const run = { path: [166] };
    const state = { totalSections: 94, maxSectionNumber, graph: {} };
    const navigate = marker => { visits.push(marker); run.path.push(marker); };
    const commitChoices = (sec, choices) => { state.graph[sec].choices = choices; };
    const context = vm.createContext({
      state, currentBookId: 651, getToken: () => 'account',
      currentPlaythrough: () => run, currentSection: () => run.path.at(-1),
      _showToken: 1, _previewSec: null, _accessPending: false, _accessLocked: false,
      bindReadingMapEntry: (_container, options) => { handlers = options; },
      navigate, _navigate: navigate, commitChoices, _commitChoices: commitChoices,
      suppressAutoNav() {}, _showSection() {},
    });
    vm.runInContext(binding, context);
    context._bindMapEntry({}, 1);
    return { visits, state, handlers };
  }

  test(`${name} map accepts a sparse marker above the section count`, () => {
    const f = fixture(739);
    assert.equal(f.handlers.canNavigate(), true);
    f.handlers.onNavigate(739);
    assert.deepEqual(f.visits, [739]);
    assert.deepEqual([...f.state.graph[166].choices], [739]);
  });

  test(`${name} map respects the maximum and legacy section-count fallback`, () => {
    const sparse = fixture(739);
    sparse.handlers.onNavigate(740);
    assert.deepEqual(sparse.visits, []);
    const legacy = fixture(null);
    legacy.handlers.onNavigate(95);
    assert.deepEqual(legacy.visits, []);
    legacy.handlers.onNavigate(94);
    assert.deepEqual(legacy.visits, [94]);
  });
}
