const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

test('watch follows unfinished gameplay rather than a portal-paused book or invalid active index', () => {
  const source = fs.readFileSync(path.join(__dirname, '../server/db/books.js'), 'utf8');
  const start = source.indexOf('function getActiveBookInSeries(');
  const end = source.indexOf('\nfunction getBookById(', start);
  let rows = [];
  const context = vm.createContext({ db: { prepare: () => ({ all: () => rows }) } });
  vm.runInContext(source.slice(start, end), context);
  const row = (book_id, pt, index = 0) => ({ book_id, state_data: JSON.stringify({ activePtIndex: index, playthroughs: [pt] }) });
  const paused = row(1, { completed: true, result: 'portal', lastActionAt: 300 });
  const playing = row(2, { completed: false, path: [190], lastActionAt: 200 });
  rows = [paused, playing, row(3, {}, 7), { book_id: 4, state_data: 'broken' }];
  assert.equal(context.getActiveBookInSeries(26, 80), 2);
  rows = [playing, row(5, { completed: false, lastActionAt: 250 })];
  assert.equal(context.getActiveBookInSeries(26, 80), 5);
  rows = [paused, row(2, { completed: true, result: 'success' })];
  assert.equal(context.getActiveBookInSeries(26, 80), null);
});

function viewer() {
  const elements = new Map();
  const element = () => ({
    style: {}, children: [], classList: { add() {}, remove() {} },
    appendChild(child) { this.children.push(child); },
    getContext: () => ({ measureText: text => ({ width: text.length * 5 }) }),
  });
  class DataSet {
    data = new Map();
    update(rows) { rows.forEach(row => this.data.set(row.id, { ...this.data.get(row.id), ...row })); }
    get(id) { return this.data.get(id); }
    getIds() { return [...this.data.keys()]; }
    remove(id) { this.data.delete(id); }
  }
  const context = vm.createContext({
    URLSearchParams, location: { search: '' },
    document: {
      createElement: element, createTextNode: text => ({ textContent: text }),
      getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
    },
    vis: { DataSet, Network: class { on() {} setOptions() {} getScale() { return 1; } focus() {} destroy() {} } },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../admin/js/watch.js'), 'utf8'), context);
  return context;
}

test('watch renders isolated portals, safe destination tooltips, and clears portal styling after removal', () => {
  const context = viewer();
  context.state = { graph: { 236: { choices: [], portals: [
    { targetBookId: 674, targetSection: 190, label: '<b>Coast</b>' },
    { targetBookId: 674, targetSection: 136 },
  ] } }, positions: { 236: { x: 40, y: 80 } } };
  vm.runInContext('render(state, true)', context);
  let node = vm.runInContext('visNodes.get(236)', context);
  assert.equal(node.shape, 'diamond');
  assert.equal(node.label, '236\n⇒');
  assert.equal(node.color.border, '#facc15');
  const tooltip = node.title.children.map(c => c.textContent || '').join('\n');
  assert.match(tooltip, /<b>Coast<\/b>.*Book #674, section 190/);
  assert.match(tooltip, /Book #674, section 136/);
  assert.equal(node.title.children.filter(c => c.textContent).length, 3);
  context.state.graph[236].portals = [];
  vm.runInContext('render(state, true)', context);
  node = vm.runInContext('visNodes.get(236)', context);
  assert.equal(node.shape, 'dot');
  assert.equal(node.title, '');
  assert.equal(node.label, '236');
});

test('watch polling redraws portal styling when open-world mode changes without a state change', async () => {
  const context = viewer();
  const state = { graph: { 7: { choices: [], portals: [{ targetBookId: 2, targetSection: 9 }] } }, playthroughs: [] };
  let isOpenWorld = false;
  context.fetch = async () => ({ ok: true, json: async () => ({ bookId: 1, state, isOpenWorld }) });
  await vm.runInContext('poll()', context);
  assert.equal(vm.runInContext('visNodes.get(7).shape', context), 'dot');
  isOpenWorld = true;
  await vm.runInContext('poll()', context);
  assert.equal(vm.runInContext('visNodes.get(7).shape', context), 'diamond');
  isOpenWorld = false;
  await vm.runInContext('poll()', context);
  assert.equal(vm.runInContext('visNodes.get(7).shape', context), 'dot');
});
