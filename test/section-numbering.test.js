'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function client(file, globals) {
  const context = vm.createContext(globals);
  const source = fs.readFileSync(require.resolve('../public/js/' + file), 'utf8').replace(/^import .*;$/gm, '').replace(/^export /gm, '');
  vm.runInContext(source, context);
  return context;
}
test('choices accept the highest section number while the total remains the actual count', () => {
  const state = { totalSections: 420, maxSectionNumber: 1003, graph: {}, playthroughs: [] };
  const c = client('play/choices.js', { state, saveState() {}, render() {},
    parseSecId: s => /^-?\d+$/.test(s) ? Number(s) : null,
    isTerminal: s => s === 0 || s === -1, isValidSecId: s => s > 0,
    naturalCompare: (a, b) => String(a).localeCompare(String(b)) });
  c.handleRecordChoices(1, '420 1003 1004 0 -1');
  assert.deepEqual(Array.from(state.graph[1].choices), [420, 1003, 0, -1]);
  assert.equal(state.totalSections, 420);
  state.maxSectionNumber = null;
  c.handleRecordChoices(2, '420 421 1003');
  assert.deepEqual(Array.from(state.graph[2].choices), [420], 'blank maximum uses the section count');
});
test('sparse progress uses the count and does not invent missing section IDs', () => {
  const elements = new Map();
  const document = { getElementById(id) { if (!elements.has(id)) elements.set(id, { style: {}, dataset: {} }); return elements.get(id); } };
  const state = { bookName: 'Sparse book', totalSections: 420, maxSectionNumber: 1003, playthroughs: [] };
  const discovered = new Set([1, 1003]);
  const c = client('play/stats.js', { state, document, allDiscoveredSections: () => discovered, mappedCount: () => 2,
    isTerminal: s => s === 0 || s === -1, t: () => '', playContext: {} });
  c.updateStats();
  assert.equal(elements.get('mapped-bar').style.width, `${2 / 420 * 100}%`);
  assert.equal(elements.get('not-found-count').textContent, 418);
  assert.equal(elements.get('missing-label').dataset.tooltip, '');
  state.totalSections = 3; state.maxSectionNumber = null;
  discovered.clear(); discovered.add(1); discovered.add(3);
  c.updateStats();
  assert.equal(elements.get('not-found-count').textContent, 1);
  assert.equal(elements.get('missing-label').dataset.tooltip, '2', 'ordinary books retain the missing ID list');
});
test('Edit Book saves the optional maximum and keeps the total independent of section labels already used', async () => {
  const elements = new Map();
  const el = id => {
    if (!elements.has(id)) {
      const node = { value: '', textContent: '', style: {}, classList: { contains: () => true }, handlers: {},
        addEventListener(type, fn) { this.handlers[type] = fn; }, cloneNode() { return this; },
        parentNode: { replaceChild() {} } };
      elements.set(id, node);
    }
    return elements.get(id);
  };
  el('edit-book-name-input').value = 'Sparse book';
  el('edit-book-sections-input').value = '420';
  el('edit-book-max-section-input').value = '1003';
  el('edit-book-pub-type').value = 'book';
  let saved;
  const c = client('edit-book/book-actions.js', { document: { getElementById: el },
    editState: { _bookSession: 1, _editBookId: 1 }, isDemoMode: false, t: key => key,
    _setButtonsDisabled() {}, pauseCoversAutoRefresh() {}, resumeCoversAutoRefresh() {},
    validateIsbn: () => '', validateIssn: () => '', validateAsin: () => '' });
  c.bindBookActions({ pubTypeEl: el('edit-book-pub-type'), minSections: 5, minMaxSectionNumber: 1003,
    initialSections: 420, onSave: (...args) => { saved = args; }, closeEditBookModal() {} });
  const save = () => el('edit-book-save').handlers.click();
  await save();
  assert.equal(saved[1], 420);
  assert.equal(saved[15], 1003);
  for (const invalid of ['', '1002', '1003.5', '1003junk']) {
    saved = null; el('edit-book-max-section-input').value = invalid;
    await save();
    assert.equal(saved, null, invalid || 'blank cannot remove a limit still in use');
    assert.equal(el('edit-book-error').textContent, 'err.max_section');
  }
  el('edit-book-sections-input').value = '1003';
  el('edit-book-max-section-input').value = '';
  await save();
  assert.equal(saved[15], 1003, 'blank saves the total as the default maximum');
  let closed = false;
  c.bindBookActions({ pubTypeEl: el('edit-book-pub-type'), minSections: 5, minMaxSectionNumber: 1, initialSections: 1003,
    onSave: async () => { throw new Error('Save rejected'); }, closeEditBookModal() { closed = true; } });
  await save();
  assert.equal(closed, false, 'failed saves keep the editor open');
  assert.equal(el('edit-book-error').textContent, 'Save rejected');
});
