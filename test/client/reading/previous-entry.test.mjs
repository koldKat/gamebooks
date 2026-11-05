import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { bindReadingPreviousEntry } from '../../../public/js/reading/previous-entry.js';

for (const [mode, file] of [
  ['desktop', '../../../public/js/reading/liveread.js'],
  ['mobile', '../../../public/mobile/js/reader.js'],
]) {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8');
  const start = source.indexOf('function _bindReadingNavigation(');
  assert.ok(start >= 0);
  const binding = source.slice(start, source.indexOf('\n}\n', start) + 2);

  function fixture(path = [9, 55], readOnly = false) {
    let run = { path, undosUsed: 3 }, auth = 'first';
    const original = run, visits = [], attributes = {}, listeners = [];
    const link = { setAttribute: (name, value) => { attributes[name] = value; },
      addEventListener: (_type, listener) => listeners.push(listener) };
    const container = { querySelectorAll: selector => selector === 'a[href="#reading-previous-entry"]' ? [link] : [] };
    const state = { graph: {}, totalSections: 59, maxSectionNumber: 119 };
    const navigate = target => { visits.push(target); run.path.push(target); };
    const commitChoices = (section, choices) => { state.graph[section].choices = choices; };
    const context = vm.createContext({ state, currentBookId: 1501, getToken: () => auth,
      currentPlaythrough: () => run, currentSection: () => run?.path.at(-1),
      _showToken: 1, _previewSec: null, _accessPending: false, _accessLocked: false,
      bindReadingMapEntry() {}, bindReadingSourceFlipbooks() {}, bindReadingPreviousEntry,
      navigate, _navigate: navigate, commitChoices, _commitChoices: commitChoices,
      suppressAutoNav() {}, _showSection() {} });
    vm.runInContext(binding, context);
    context._bindReadingNavigation(container, 1, readOnly);
    return { context, state, original, visits, attributes,
      set run(value) { run = value; }, set auth(value) { auth = value; },
      click() {
        let prevented = false, stopped = false;
        for (const listener of listeners) listener({ preventDefault() { prevented = true; },
          stopImmediatePropagation() { stopped = true; } });
        assert.ok(prevented && stopped, 'return link cannot fall through to aside navigation');
      } };
  }

  test(`${mode} printed retry follows either incoming page without charging Undo or choosing automatically`, () => {
    for (const previous of [9, 116]) {
      const f = fixture([1, previous, 55]);
      assert.deepEqual(f.visits, []);
      assert.equal(f.attributes['aria-disabled'], 'false');
      f.click();
      assert.deepEqual(f.visits, [previous]);
      assert.deepEqual(f.original.path, [1, previous, 55, previous]);
      assert.equal(f.original.undosUsed, 3);
      assert.deepEqual([...f.state.graph[55].choices], [previous]);
      assert.equal(f.state.graph[55].manualNavigation, true);
      f.click();
      assert.deepEqual(f.visits, [previous], 'detached link cannot navigate twice');
    }
  });

  test(`${mode} retry rejects absent history, terminals and malformed destinations`, () => {
    for (const path of [[55], [0, 55], [-1, 55], [null, 55], ['../9', 55], [1000000, 55]]) {
      const f = fixture(path);
      assert.equal(f.attributes['aria-disabled'], 'true');
      f.click();
      assert.deepEqual(f.visits, []);
    }
  });

  test(`${mode} retry rejects stale runs, accounts, books and content`, () => {
    for (const change of [
      f => { f.run = null; }, f => { f.run = { path: [116, 55] }; },
      f => { f.auth = 'second'; }, f => { f.context.currentBookId = 999; },
      f => { f.context._showToken = 2; }, f => { f.original.path.push(9); },
    ]) {
      const f = fixture(); change(f); f.click();
      assert.deepEqual(f.visits, []);
    }
    const f = fixture([9, 55], true);
    if (mode === 'desktop') f.context._previewSec = 55;
    f.click();
    assert.deepEqual(f.visits, []);
  });
}

test('read-only return links and named previous entries use the same explicit click guard', () => {
  let listener, attributes = {}, allowed = false;
  const visits = [], path = ['prologue', 'retry'];
  const link = { setAttribute: (name, value) => { attributes[name] = value; },
    addEventListener: (_type, value) => { listener = value; } };
  bindReadingPreviousEntry({ querySelectorAll: () => [link] }, {
    canNavigate: () => allowed, getPath: () => path, onNavigate: value => visits.push(value),
  });
  const event = { preventDefault() {}, stopImmediatePropagation() {} };
  assert.equal(attributes['aria-disabled'], 'true');
  listener(event); assert.deepEqual(visits, []);
  allowed = true; listener(event); assert.deepEqual(visits, ['prologue']);
});
