import assert from 'node:assert/strict';
import test from 'node:test';
import { bindReadingMapEntry, readingChoices } from '../../../public/js/reading/map-entry.js';

function fixture() {
  const input = { value: '12', max: '150', disabled: false, addEventListener() {}, setCustomValidity() {}, removeAttribute() {} };
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

test('lettered map markers retain their prefix and enforce numeric bounds', () => {
  const f = fixture();
  f.form.dataset = { readingMarkerPrefix: 'А' };
  f.input.max = '35';
  const visits = [];
  bindReadingMapEntry(f.container, { canNavigate: () => true, onNavigate: n => visits.push(n) });
  f.input.value = '12';
  f.submit();
  f.form.dataset.readingMarkerPrefix = 'Б';
  f.input.value = '025';
  f.input.max = '25';
  f.submit();
  for (const value of ['26', '0', '-1', 'Б12', '1e1']) {
    f.input.value = value;
    f.submit();
  }
  assert.deepEqual(visits, ['А12', 'Б25']);
});

test('invalid map prefixes cannot produce arbitrary section IDs', () => {
  const f = fixture();
  const visits = [];
  bindReadingMapEntry(f.container, { canNavigate: () => true, onNavigate: n => visits.push(n) });
  for (const prefix of [' ', 'A1', '<script>', '../', 'ABCDEFGHI', 'А-']) {
    f.form.dataset = { readingMarkerPrefix: prefix };
    f.submit();
  }
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

test('source codes map only to explicitly configured numeric destinations', () => {
  const f = fixture();
  f.input.max = '2359';
  f.form.dataset = { readingMarkerTargets: '{"1309":10,"1409":11}', readingMarkerError: 'Check the time.' };
  const visits = [];
  let validation = '';
  f.input.setCustomValidity = value => { validation = value; };
  let clear;
  f.input.addEventListener = (event, handler) => { if (event === 'input') clear = handler; };
  bindReadingMapEntry(f.container, { canNavigate: () => true, onNavigate: n => visits.push(n) });
  for (const value of ['10', '1109', '2359']) {
    f.input.value = value;
    f.submit();
    assert.equal(validation, 'Check the time.');
    clear();
    assert.equal(validation, '');
  }
  for (const value of ['1309', '01409']) {
    f.input.value = value;
    f.submit();
  }
  assert.deepEqual(visits, [10, 11]);
});

test('invalid source-code maps never fall back to ordinary navigation', () => {
  const f = fixture();
  const visits = [];
  bindReadingMapEntry(f.container, { canNavigate: () => true, onNavigate: n => visits.push(n) });
  for (const map of ['{', 'null', '12', '[]', '{"12":0}', '{"12":-1}', '{"12":"13"}', '{"12":1.5}', '{"12":9007199254740993}']) {
    f.form.dataset = { readingMarkerTargets: map };
    f.submit();
  }
  assert.deepEqual(visits, []);
});

test('lettered grid coordinates navigate only within the source map', () => {
  const f = fixture();
  f.form.dataset = { readingMarkerGrid: '{"rows":27,"columns":"ABCDEFGH"}', readingMarkerError: 'Check the map.' };
  const visits = [];
  let validation = '';
  f.input.setCustomValidity = value => { validation = value; };
  let clear;
  f.input.addEventListener = (event, handler) => { if (event === 'input') clear = handler; };
  bindReadingMapEntry(f.container, { canNavigate: () => true, onNavigate: n => visits.push(n) });
  for (const value of ['', '0A', '01A', '28A', '1I', 'A1', '14', '1.5A', '1e2A', '../1A']) {
    f.input.value = value;
    f.submit();
    assert.equal(validation, 'Check the map.');
    clear();
  }
  assert.deepEqual(visits, []);
  for (let row = 1; row <= 27; row++) for (const column of 'ABCDEFGH') {
    f.input.value = ` ${row}${column.toLowerCase()} `;
    f.submit();
  }
  assert.equal(visits.length, 216);
  assert.equal(visits[0], '1A');
  assert.equal(visits.at(-1), '27H');
});

test('invalid grids and stale contexts cannot navigate or fall back to numeric markers', () => {
  const f = fixture();
  const visits = [];
  let active = true;
  bindReadingMapEntry(f.container, { canNavigate: () => active, onNavigate: n => visits.push(n) });
  f.input.value = '1A';
  for (const grid of ['{', 'null', '[]', '{"rows":0,"columns":"A"}', '{"rows":1.5,"columns":"A"}',
    '{"rows":1000000,"columns":"A"}', '{"rows":27,"columns":"AA"}', '{"rows":27,"columns":"a"}',
    '{"rows":27,"columns":12}', '{"rows":27,"columns":"../"}']) {
    f.form.dataset = { readingMarkerGrid: grid };
    f.submit();
  }
  f.form.dataset = { readingMarkerGrid: '{"rows":27,"columns":"ABCDEFGH"}' };
  active = false;
  f.submit();
  assert.deepEqual(visits, []);
});
