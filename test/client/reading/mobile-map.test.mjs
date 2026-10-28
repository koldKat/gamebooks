import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { sectionLabel } from '../../../public/js/core/section-labels.js';

const source = readFileSync(new URL('../../../public/mobile/js/reader.js', import.meta.url), 'utf8')
  .replace(/^import[\s\S]*?;$/gm, '').replace(/^export /gm, '');
const helper = readFileSync(new URL('../../../public/js/reading/map-entry.js', import.meta.url), 'utf8')
  .replace(/^export /gm, '');

function setup() {
  let form;
  const top = { scrollTop: 7, querySelectorAll: selector => selector.startsWith('form') && form ? [form] : [] };
  Object.defineProperty(top, 'innerHTML', { set(html) {
    form = null;
    if (!html.includes('data-reading-map-entry')) return;
    const input = { value: '', max: '150', disabled: false, addEventListener() {} };
    const button = { disabled: false };
    form = { input, button, querySelector: selector => selector.startsWith('input') ? input : button,
      reportValidity: () => true, addEventListener: (_type, listener) => { form.fire = () => listener({ preventDefault() {} }); } };
  } });
  const state = { totalSections: 150, graph: {}, playthroughs: [] };
  const requests = [], saves = [];
  let run = { path: [1], completed: false }, auth = 'one';
  const context = vm.createContext({
    document: { getElementById: id => id === 'm-top' ? top : { style: {}, addEventListener() {} } },
    console, state, sectionLabel, currentBookId: 570, currentPlaythrough: () => run,
    currentSection: () => run.path.at(-1), getToken: () => auth,
    isValidSecId: value => Number.isInteger(value) && value > 0 && value <= 150,
    isTerminal: value => value === 0 || value === -1, parseSecId: Number,
    saveState: () => saves.push(JSON.stringify(state.graph)), refreshGraph() {}, t: key => key,
    apiFetch: async url => { requests.push(url); return { ok: true, json: async () => ({
      html: '<form data-reading-map-entry><input name="marker" max="150"><button type="submit">Go</button></form>',
      choices: url.endsWith('/1') ? [2] : [],
    }) }; },
  });
  vm.runInContext(helper + '\n' + source, context);
  vm.runInContext('_updateRunControls = () => {}', context);
  return { context, state, requests, saves, show: () => context._showSection(run.path.at(-1)),
    get form() { return form; }, get run() { return run; },
    set run(value) { run = value; }, set auth(value) { auth = value; } };
}

test('mobile map entry adds only the selected edge and preserves it on revisit', async () => {
  const s = setup();
  await s.show();
  assert.equal(s.state.graph[1].manualNavigation, true);
  assert.equal(s.form.input.disabled, false);
  const first = s.form;
  first.input.value = '12'; first.fire();
  await s.show();
  assert.deepEqual(s.run.path, [1, 12]);
  assert.deepEqual([...s.state.graph[1].choices], [2, 12]);
  assert.equal(s.state.graph[1].manualNavigation, true);
  first.input.value = '13'; first.fire();
  assert.deepEqual(s.run.path, [1, 12], 'detached form cannot navigate');
  s.run.path.push(1);
  await s.show();
  assert.deepEqual([...s.state.graph[1].choices], [2, 12]);
  assert.ok(s.saves.length);
  assert.ok(s.requests.length < 10, 'does not fetch every map marker');
});

test('mobile map forms reject previews, replaced runs and account changes', async () => {
  const s = setup();
  await s.show();
  const old = s.form;
  s.run = { path: [1], completed: false };
  old.input.value = '12'; old.fire();
  assert.deepEqual(s.run.path, [1]);
  await s.show();
  s.auth = 'two';
  s.form.input.value = '12'; s.form.fire();
  assert.deepEqual(s.run.path, [1]);
  await s.context._previewSection(1);
  assert.equal(s.form.input.disabled, true);
  assert.equal(s.form.button.disabled, true);
  s.form.input.value = '12'; s.form.fire();
  assert.deepEqual(s.run.path, [1]);
});

test('mobile map asides can navigate only from the active run, not a preview', async () => {
  const s = setup();
  await s.show();
  await s.context._showExtra('original-maps');
  s.form.input.value = '12'; s.form.fire();
  assert.deepEqual(s.run.path, [1, 12]);
  await s.context._showExtra('original-maps', true);
  assert.equal(s.form.input.disabled, true);
  s.form.input.value = '13'; s.form.fire();
  assert.deepEqual(s.run.path, [1, 12]);
});
