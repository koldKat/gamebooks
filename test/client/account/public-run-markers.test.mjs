import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import {nodeShapeOptions, createNodeShapeRenderer} from '../../../public/js/graph/node-shapes.js';

const source = readFileSync(new URL('../../../public/js/account/public-profile.js', import.meta.url), 'utf8');
const stateSource = readFileSync(new URL('../../../public/js/core/state.js', import.meta.url), 'utf8');
const sectionIds = vm.runInNewContext(stateSource.slice(stateSource.indexOf('export function isTerminal('),
  stateSource.indexOf('export function currentPlaythrough(')).replaceAll('export ', '')
  + '\n({ isValidSecId, parseSecId })');
const build = vm.runInNewContext(source.slice(source.indexOf('function _buildPubSegNetwork(')) + '\n_buildPubSegNetwork', {
  ...sectionIds,
  nodeShapeOptions, createNodeShapeRenderer,
  vis: { DataSet: class { constructor(rows) { this.rows = rows; } },
    Network: class { constructor(_container, data) { this.data = data; } } },
});

test('public runs preserve named starts, their connectors and mixed numeric IDs', () => {
  const chart = {
    'Пролог': { choices: [7, '14', 'K1'] },
    7: { choices: ['14'] }, 14: { choices: ['-1'] },
  };
  const net = build({}, chart, { 'Пролог': { x: 0, y: 0 } },
    ['Пролог', '7', 14], 'death', ['7', 14], [], false, 'Пролог');
  const nodes = new Map(net.data.nodes.rows.map(node => [node.id, node]));
  assert.equal(nodes.size, 3);
  assert.equal(nodes.get('Пролог').color.background, '#fde047');
  assert.equal(nodes.get('Пролог').x, 0);
  assert.ok(!nodes.has('K1'), 'unmapped destination hints stay hidden');
  assert.equal(nodes.get(14).color.background, '#e74c3c');
  const edges = net.data.edges.rows;
  assert.ok(edges.some(edge => edge.from === 'Пролог' && edge.to === 14));
  assert.ok(edges.some(edge => edge.from === 'Пролог' && edge.to === 7 && edge.width === 2.5));
  assert.ok(edges.every(edge => nodes.has(edge.from) && nodes.has(edge.to)));
  assert.ok(!nodes.has(-1) && !nodes.has(0));
});

test('public runs hide unmapped nodes from other runs while retaining mapped nodes', () => {
  const chart = {
    1: { choices: [2, 'hint', 'empty', 'mapped', 'portal', 'endhint'] },
    2: { choices: [0] },
    empty: { discovered: true, choices: [] },
    mapped: { discovered: true, choices: ['otherhint'] },
    portal: { discovered: true, choices: [], portals: [{ bookId: 2, section: 1 }] },
    endhint: { discovered: true, choices: [-1] },
  };
  const net = build({}, chart, {}, [1, 2], 'success', ['oldvisit', 15]);
  const nodes = new Set(net.data.nodes.rows.map(node => node.id));
  assert.deepEqual([...nodes].sort(), [1, 2, 'mapped', 'portal'].sort());
  assert.ok(net.data.edges.rows.some(edge => edge.from === 1 && edge.to === 2));
  assert.ok(net.data.edges.rows.some(edge => edge.to === 'portal'));
  assert.ok(net.data.edges.rows.every(edge => nodes.has(edge.from) && nodes.has(edge.to)));
});

test('the displayed run retains its own visited nodes even without mapped choices', () => {
  const net = build({}, { 1: { choices: [15] } }, {}, [1, 15], 'death', [99]);
  const nodes = new Set(net.data.nodes.rows.map(node => node.id));
  assert.ok(nodes.has(15));
  assert.ok(!nodes.has(99));
  assert.ok(net.data.edges.rows.some(edge => edge.from === 1 && edge.to === 15));
});
const graph = { 1: { choices: [2, 3, 4] }, 2: { choices: [0] }, 3: { choices: [-1] },
  4: { choices: [0, -1] }, 5: { choices: [0], battle: true }, 6: { choices: [7] }, 7: { choices: [0] } };
function nodes(path, result, endNodes = [], portalEntry = false) {
  const net = build({}, graph, {}, path, result, [], endNodes, portalEntry);
  return new Map(JSON.parse(JSON.stringify(net.data.nodes.rows)).map(n => [n.id, n]));
}

test('historical endings stay hollow when publicly viewing another run', () => {
  const n = nodes([1, 6, 7], 'success', [
    { id: 2, result: 'success' }, { id: 3, result: 'death' },
    { id: 4, result: 'success' }, { id: 5, result: 'battle' },
  ]);
  for (const [id, border] of [[2, '#27ae60'], [3, '#e74c3c'], [4, '#f59e0b'], [5, '#f97316']]) {
    assert.equal(n.get(id).color.background, '#0f172a');
    assert.equal(n.get(id).color.border, border);
    assert.equal(n.get(id).borderWidth, 4);
  }
  assert.equal(n.get(6).color.background, '#3d9be9', 'the displayed path remains blue');
  assert.equal(n.get(7).color.background, '#27ae60', 'the displayed winning ending remains filled');
});

test('only the displayed final node gets the actual result fill', () => {
  for (const [result, fill] of [['success', '#27ae60'], ['death', '#e74c3c'], ['battle', '#c2410c'], ['portal', '#0e7490']]) {
    const n = nodes([1, 2], result, [{ id: 2, result: 'death' }]);
    assert.equal(n.get(2).color.background, fill);
    assert.equal(n.get(2).borderWidth, 4);
    assert.equal(n.get(1).color.background, '#fde047');
  }
});

test('hover and trail selection retain hollow markers and actual ending colors', () => {
  const n = nodes([1, 3], 'death', [{ id: 2, result: 'success' }]);
  for (const id of [1, 2, 3]) {
    const color = n.get(id).color;
    assert.deepEqual(color.hover, { background: color.background, border: color.border });
    assert.deepEqual(color.highlight, color.hover);
  }
});

test('open-world portal entries and intermediate portals retain their existing shapes', () => {
  const n = nodes([6, 7], 'portal', [], true);
  assert.equal(n.get(6).shape, 'diamond');
  assert.equal(n.get(6).color.background, '#0e7490');
  assert.equal(n.get(7).shape, 'diamond');
  assert.equal(n.get(7).color.background, '#0e7490');
});

test('public runs retain ordinary saved shapes with battle outlines', () => {
  graph[5].shape = 'octagon';
  graph[6].shape = 'triangle';
  try {
    const n = nodes([1,6,7], 'success');
    assert.equal(n.get(5).shape, 'custom');
    assert.equal(n.get(5).color.border, '#f97316');
    assert.equal(n.get(5).borderWidth, 4);
    assert.equal(n.get(6).shape, 'triangle');
    assert.equal(nodes([6,7], 'portal', [], true).get(6).shape, 'diamond');
  } finally {
    delete graph[5].shape;delete graph[6].shape;
  }
});
