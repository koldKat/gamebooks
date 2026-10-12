import assert from 'node:assert/strict';
import test from 'node:test';
import { bindReadingMapEntry, readingChoices } from '../../../public/js/reading/map-entry.js';

function fixture() {
  const input = { value: '12', max: '150', disabled: false };
  const button = { disabled: false };
  const handlers = [];
  const form = {
    querySelector: selector => selector.startsWith('input') ? input : button,
    reportValidity: () => true,
    addEventListener: (event, handler) => handlers.push(handler),
  };
  return {
    input, button, form,
    container: { querySelectorAll: () => [form] },
    submit() { let prevented = false; handlers.forEach(fn => fn({ preventDefault() { prevented = true; } })); assert.ok(prevented); },
  };
}

test('only explicit valid marker submissions navigate', () => {
  const f = fixture();
  const visits = [];
  bindReadingMapEntry(f.container, { canNavigate: () => true, onNavigate: n => visits.push(n) });
  assert.deepEqual(visits, []);
  for (const invalid of ['', '0', '-1', '151', '12.5', '1e2', 'Infinity', 'NaN', '9007199254740993']) {
    f.input.value = invalid;
    f.submit();
  }
  assert.deepEqual(visits, []);
  f.input.value = ' 12 ';
  f.submit();
  assert.deepEqual(visits, [12]);
});

test('read-only and stale contexts cannot navigate', () => {
  const f = fixture();
  let active = false;
  const visits = [];
  bindReadingMapEntry(f.container, { canNavigate: () => active, onNavigate: n => visits.push(n) });
  assert.ok(f.input.disabled && f.button.disabled);
  f.submit();
  assert.deepEqual(visits, []);
  const g = fixture();
  active = true;
  bindReadingMapEntry(g.container, { canNavigate: () => active, onNavigate: n => visits.push(n) });
  active = false;
  g.submit();
  assert.deepEqual(visits, []);
});

test('native validation and malformed bounds cannot be bypassed', () => {
  const f = fixture();
  const visits = [];
  bindReadingMapEntry(f.container, { canNavigate: () => true, onNavigate: n => visits.push(n) });
  f.form.reportValidity = () => false;
  f.submit();
  f.form.reportValidity = () => true;
  for (const max of ['', 'NaN', '0', '3.5', 'Infinity']) {
    f.input.max = max;
    f.submit();
  }
  assert.deepEqual(visits, []);
});

test('manual map edges survive revisits without changing normal choice replacement', () => {
  const existing = [25,35];
  const data = { html: '<form class="reading-map-entry" data-reading-map-entry>', choices: [35,45] };
  assert.deepEqual(readingChoices(data, existing), [25,35,45]);
  assert.deepEqual(existing, [25,35]);
  assert.deepEqual(readingChoices({ html: '<p>Normal section</p>', choices: [45] }, existing), [45]);
  assert.deepEqual(readingChoices({ html: '<form data-reading-map-entry-extra>', choices: [45] }, existing), [45]);
  assert.deepEqual(readingChoices({ html: '<form data-reading-map-entry>' }, existing), existing);
  assert.deepEqual(readingChoices({ html: '<p>Map aside entry</p>', choices: [45] }, existing, true), [25,35,45]);
});
