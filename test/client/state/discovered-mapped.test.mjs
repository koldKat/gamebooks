import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { discoveredSectionsFor, mappedCountFor } from '../../../public/js/state.js';

describe('discoveredSectionsFor', () => {
  test('always includes the start section, even with an empty graph', () => {
    const set = discoveredSectionsFor({}, [], 1);
    assert.deepEqual([...set], [1]);
  });

  test('falls back to section 1 for an invalid start section', () => {
    const set = discoveredSectionsFor({}, [], null);
    assert.deepEqual([...set], [1]);
  });

  test('includes every graph node key and every non-terminal choice target', () => {
    const graph = {
      1: { choices: [2, 3] },
      2: { choices: [-1] },      // death - excluded
      3: { choices: [0] },       // win - excluded
    };
    const set = discoveredSectionsFor(graph, [], 1);
    assert.deepEqual([...set].sort((a, b) => a - b), [1, 2, 3]);
  });

  test('includes every non-terminal section visited by any playthrough path', () => {
    const playthroughs = [
      { path: [1, 4, 5] },
      { path: [1, 4, -1] }, // trailing death sentinel excluded
    ];
    const set = discoveredSectionsFor({}, playthroughs, 1);
    assert.deepEqual([...set].sort((a, b) => a - b), [1, 4, 5]);
  });

  test('alphanumeric section ids pass through untouched', () => {
    const graph = { A5B: { choices: ['C1'] } };
    const set = discoveredSectionsFor(graph, [], 1);
    assert.ok(set.has('A5B'));
    assert.ok(set.has('C1'));
  });
});

describe('mappedCountFor', () => {
  test('counts a node as mapped once it has a choice recorded', () => {
    const graph = { 1: { discovered: true, choices: [2] } };
    assert.equal(mappedCountFor(graph), 1);
  });

  test('does not count a discovered-but-unexplored node with no choices/portals', () => {
    const graph = { 1: { discovered: true, choices: [] } };
    assert.equal(mappedCountFor(graph), 0);
  });

  test('counts a portal-only node as mapped even with zero choices', () => {
    const graph = { 1: { discovered: true, choices: [], portals: [{ to: 2 }] } };
    assert.equal(mappedCountFor(graph), 1);
  });

  test('a node the player has actually visited (discovered: false) counts even with no choices yet', () => {
    // Matches the source's own filter: !discovered is itself sufficient.
    const graph = { 1: { discovered: false, choices: [] } };
    assert.equal(mappedCountFor(graph), 1);
  });

  test('empty graph counts as zero', () => {
    assert.equal(mappedCountFor({}), 0);
    assert.equal(mappedCountFor(null), 0);
  });
});
