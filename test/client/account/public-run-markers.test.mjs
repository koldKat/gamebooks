import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../../public/js/account/public-profile.js', import.meta.url), 'utf8');
const build = vm.runInNewContext(source.slice(source.indexOf('function _buildPubSegNetwork(')) + '\n_buildPubSegNetwork', {
  isValidSecId: id => Number.isSafeInteger(id) && id > 0,
  vis: { DataSet: class { constructor(rows) { this.rows = rows; } },
    Network: class { constructor(_container, data) { this.data = data; } } },
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
