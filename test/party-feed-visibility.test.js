'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function feedFor({ publicRun = true, publicBook = true, hideFirst = true } = {}) {
  const now = Date.now();
  const state = JSON.stringify({ playthroughs: [{
    startedAt: now - 20000, completedAt: now - 10000,
    completed: true, result: 'success', path: [1, 2, 0], isPublic: publicRun,
  }] });
  const rows = ['koldKat', 'sashii'].map((username, index) => ({
    userId: index + 1, username, public_profile: 1,
    hide_from_feed: index === 0 && hideFirst ? 1 : 0,
    xp: 1000, party_id: 13, state_data: state,
    bookId: 868, bookName: 'Party book', is_public: publicBook ? 1 : 0,
    bookIsContainer: 0, created_by: 99,
  }));
  const deps = {
    './connection': { db: { prepare: sql => ({
      all: () => sql.includes('ub.state_data, ub.updated_at, ub.created_at AS ub_created_at, ub.party_id') ? rows : [],
      get: () => undefined,
    }) } },
    './xp': { computeLevel: () => 1, getTitleForLevel: () => 'Lost Soul' },
    './content': {}, './books': {},
  };
  const context = vm.createContext({ module: { exports: {} }, require: name => deps[name], Date });
  vm.runInContext(fs.readFileSync(require.resolve('../server/db/feed'), 'utf8'), context);
  return context.module.exports.getFeed();
}

test('public-book party starts respect hide-feed settings while shared completions remain visible', () => {
  const entries = feedFor();
  const starts = entries.filter(e => e.type === 'run_started');
  assert.equal(starts.length, 1);
  assert.equal(starts[0].username, 'sashii');
  assert.equal(starts[0].usernames, undefined);
  const completions = entries.filter(e => e.type === 'run_completed');
  assert.equal(completions.length, 1);
  assert.equal(completions[0].partyId, 13);
  assert.equal(completions[0].usernames.map(u => u.username).sort().join(','), 'koldKat,sashii');
});

test('hiding feed activity still excludes a hidden player from private party runs', () => {
  for (const publicBook of [true, false]) {
    const entries = feedFor({ publicRun: false, publicBook });
    for (const type of ['run_started', 'run_completed']) {
      const matching = entries.filter(e => e.type === type);
      assert.equal(matching.length, 1);
      assert.equal(matching[0].username, 'sashii');
      assert.equal(matching[0].usernames, undefined);
    }
  }
});

test('party members who show feed activity still merge their private run events', () => {
  const entries = feedFor({ publicRun: false, hideFirst: false });
  for (const type of ['run_started', 'run_completed']) {
    const matching = entries.filter(e => e.type === type);
    assert.equal(matching.length, 1);
    assert.equal(matching[0].usernames.length, 2);
  }
});
