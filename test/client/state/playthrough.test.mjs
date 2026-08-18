import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { state, currentPlaythrough, currentSection } from '../../../public/js/state.js';

// state is a shared module-level singleton (same instance every import, per
// ES module caching) - reset the fields these two functions actually read
// before each test so one test's leftover mutation can't leak into the next.
beforeEach(() => {
  state.activePtIndex = null;
  state.playthroughs = [];
});

describe('currentPlaythrough', () => {
  test('returns null when no run is active', () => {
    assert.equal(currentPlaythrough(), null);
  });

  test('returns the playthrough at activePtIndex', () => {
    state.playthroughs = [{ path: [1], completed: false }];
    state.activePtIndex = 0;
    assert.equal(currentPlaythrough(), state.playthroughs[0]);
  });

  test('returns null for a completed run - completed runs are only ever "viewed", not "current"', () => {
    state.playthroughs = [{ path: [1, 2, 0], completed: true }];
    state.activePtIndex = 0;
    assert.equal(currentPlaythrough(), null);
  });

  test('returns null if activePtIndex points past the end of a shrunk array', () => {
    state.playthroughs = [{ path: [1], completed: false }];
    state.activePtIndex = 3;
    assert.equal(currentPlaythrough(), null);
  });
});

describe('currentSection', () => {
  test('returns null with no active run', () => {
    assert.equal(currentSection(), null);
  });

  test('returns the last entry of the active run\'s path', () => {
    state.playthroughs = [{ path: [1, 7, 12], completed: false }];
    state.activePtIndex = 0;
    assert.equal(currentSection(), 12);
  });

  test('returns null for an active run with an empty path', () => {
    state.playthroughs = [{ path: [], completed: false }];
    state.activePtIndex = 0;
    assert.equal(currentSection(), null);
  });
});
