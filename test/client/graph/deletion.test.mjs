import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../../../public/js/graph/deletion.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replace(/^export /gm, '');

function setup(playthroughs, activePtIndex = null) {
  const state = {
    graph: { 1: { choices: [9, 54] }, 9: { choices: [] }, 54: { choices: [70] }, 70: { choices: [0] } },
    positions: { 9: { x: 10, y: 20 } }, playthroughs, activePtIndex,
  };
  let saves = 0;
  const context = { state, parseSecId: Number, isTerminal: id => id === 0 || id === -1,
    isValidSecId: id => Number.isInteger(id) && id > 0, saveState: () => { saves++; } };
  runInNewContext(source, context);
  return { state, remove: ids => context.deleteNodes(new Set(ids)), saves: () => saves };
}

test('deleting a rediscovered node preserves completed win and loss histories', () => {
  const runs = [
    { path: [1, 9, 54, 70], completed: true, result: 'success', completedAt: 100, isPublic: true },
    { path: [1, 9, 54], completed: true, result: 'death', completedAt: 200, isPublic: true },
  ];
  const before = structuredClone(runs);
  const app = setup(runs);
  app.remove([9]);
  assert.deepEqual(runs, before);
  assert.equal(app.state.graph[9], undefined);
  assert.deepEqual(app.state.graph[1].choices, [54]);
  assert.equal(app.state.positions[9], undefined);
  assert.equal(app.saves(), 1);
});

test('only affected unfinished runs are trimmed; other runs and their selection remain intact', () => {
  const runs = [
    { path: [1, 9, 54], completed: false, result: null },
    { path: [1, 54], completed: false, result: null },
    { path: [1, 9, 70], completed: true, result: 'success', completedAt: 100 },
  ];
  const finished = structuredClone(runs[2]);
  const app = setup(runs, 0);
  app.remove(['9']);
  assert.deepEqual([...runs[0].path], [1]);
  assert.deepEqual(runs[1].path, [1, 54]);
  assert.deepEqual(runs[2], finished);
  assert.equal(app.state.activePtIndex, null);
});

test('portal-paused paths remain editable rather than becoming immutable completed history', () => {
  const app = setup([{ path: [1, 9, 54], completed: true, result: 'portal' }], 0);
  app.remove([9]);
  assert.deepEqual([...app.state.playthroughs[0].path], [1]);
  assert.equal(app.state.playthroughs[0].completed, false);
  assert.equal(app.state.playthroughs[0].result, null);
  assert.equal(app.state.activePtIndex, null);
});
