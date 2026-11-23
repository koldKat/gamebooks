'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function feedFor({ publicRun = true, publicBook = true, hideFirst = true, firstOutcome = null,
  differentStarts = false, reverseMilestones = false, milestoneOnlyFirst = false, milestoneIndex = 3,
  openWorld = false, container = false, correctedWin = false } = {}) {
  const now = Date.now();
  const result = firstOutcome === 'first_loss' ? 'death' : firstOutcome === 'first_battle_death' ? 'battle' : 'success';
  const runs = Array.from({length:firstOutcome ? milestoneIndex + 1 : 1}, (_,index) => ({
    startedAt: now - 20000 + index * 1000, completedAt: now - 10000 + index * 1000,
    completed: true, result:index === milestoneIndex || !firstOutcome ? result
      : firstOutcome === 'first_win' ? 'death' : 'success', path:[1,2],isPublic:publicRun,
  }));
  if (correctedWin) runs[milestoneIndex - 1].path = [1,92];
  const rows = ['koldKat', 'sashii'].map((username, index) => ({
    userId: index + 1, user_id:index + 1, username, public_profile: 1,
    hide_from_feed: index === 0 && hideFirst ? 1 : 0,
    xp: 1000, party_id: 13, state_data: JSON.stringify({playthroughs:runs.map(run => ({...run,
      startedAt:run.startedAt + (differentStarts && index === 1 ? 500 : 0)}))}),
    created_at:Math.floor((now - 10000 + milestoneIndex * 1000) / 1000),
    bookId: 868, bookName: 'Party book', is_public: publicBook ? 1 : 0,
    bookIsContainer: container ? 1 : 0, created_by: 99,
    seriesId: 12, seriesName: 'Series', series_number: 1, seriesIsPublic: 1, seriesIsOpenWorld: openWorld,
  }));
  const deps = {
    './connection': { db: { prepare: sql => ({
      all: type => {
        if (sql.includes('ub.state_data, ub.updated_at, ub.created_at AS ub_created_at, ub.party_id')) return rows;
        if (firstOutcome && (sql.includes("WHERE e.event = 'first_win'") && firstOutcome === 'first_win'
          || sql.includes('WHERE e.event = ? AND e.created_at > ?') && type === firstOutcome)) {
          const milestones=rows.filter(row => !row.hide_from_feed && (!milestoneOnlyFirst || row.userId === 1));
          return reverseMilestones ? milestones.reverse() : milestones;
        }
        return [];
      },
      get: userId => {
        if (!firstOutcome || !sql.includes('SELECT ref FROM xp_events')) return undefined;
        const row=rows.find(row=>row.userId===userId),run=JSON.parse(row.state_data).playthroughs[correctedWin ? milestoneIndex - 1 : milestoneIndex];
        return {ref:`868:${run.startedAt}`};
      },
    }) } },
    './xp': { computeLevel: () => 1, getTitleForLevel: () => 'Lost Soul' },
    './content': {}, './books': {}, './job-xp': require('../server/db/job-xp'), './rating-stats': {},
    './gameplay-stats': {}, './profile-progress': {},
    './nsfw': require('../server/db/nsfw'),
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

test('open-world book runs without a corresponding series journey remain visible', () => {
  const entries = feedFor({ openWorld: true, hideFirst: false });
  for (const type of ['run_started', 'first_win']) {
    const matches = entries.filter(entry => entry.type === type);
    assert.equal(matches.length, 1);
    assert.equal(matches[0].seriesId, 12);
    assert.equal(matches[0].seriesIsPublic, true);
  }
});

test('first wins, losses and battle deaths retain anthology and series context', () => {
  for (const firstOutcome of ['first_win', 'first_loss', 'first_battle_death']) {
    const entry = feedFor({ firstOutcome, container: true, hideFirst: false }).find(e => e.type === firstOutcome);
    assert.equal(entry.isContainer, true);
    assert.equal(entry.seriesId, 12);
    assert.equal(entry.seriesIsPublic, true);
  }
});

test('hiding feed activity still excludes a hidden player from private party runs', () => {
  for (const publicBook of [true, false]) {
    const entries = feedFor({ publicRun: false, publicBook });
    for (const type of ['run_started', 'first_win']) {
      const matching = entries.filter(e => e.type === type);
      assert.equal(matching.length, 1);
      assert.equal(matching[0].username, 'sashii');
      assert.equal(matching[0].usernames, undefined);
    }
  }
});

test('party members who show feed activity still merge their private run events', () => {
  const entries = feedFor({ publicRun: false, hideFirst: false });
  for (const type of ['run_started', 'first_win']) {
    const matching = entries.filter(e => e.type === type);
    assert.equal(matching.length, 1);
    assert.equal(matching[0].usernames.length, 2);
  }
});

test('first party wins, losses and battle deaths merge with the correct run and suppress duplicate completion', () => {
  for (const firstOutcome of ['first_win','first_loss','first_battle_death']) {
    const entries=feedFor({firstOutcome,hideFirst:false,reverseMilestones:true});
    const milestones=entries.filter(e=>e.type===firstOutcome);
    assert.equal(milestones.length,1,firstOutcome);
    assert.equal(milestones[0].runIndex,3,'fourth shared run retains its real index');
    assert.equal(milestones[0].usernames.map(p=>p.username).sort().join(','),'koldKat,sashii');
    assert.equal(entries.filter(e=>e.type==='run_completed'&&e.runIndex===3).length,0,
      'suppression works even when the merged milestone and completion have different representative players');
  }
});

test('unrelated runs with the same array position do not merge their first outcomes', () => {
  const entries=feedFor({firstOutcome:'first_loss',hideFirst:false,differentStarts:true});
  const milestones=entries.filter(e=>e.type==='first_loss');
  assert.equal(milestones.length,2);
  assert.ok(milestones.every(e=>!e.usernames));
});

test('first-outcome merging respects hidden players and individual battle death milestones', () => {
  const hidden=feedFor({firstOutcome:'first_loss'}).filter(e=>e.type==='first_loss');
  assert.equal(hidden.length,1);assert.equal(hidden[0].username,'sashii');assert.equal(hidden[0].usernames,undefined);
  const entries=feedFor({firstOutcome:'first_battle_death',hideFirst:false,milestoneOnlyFirst:true});
  assert.equal(entries.filter(e=>e.type==='first_battle_death').length,1);
  assert.equal(entries.filter(e=>e.type==='run_completed'&&e.runIndex===3).length,1,
    'a shared completion remains when it is not represented for every player by first-outcome entries');
  const win=feedFor({firstOutcome:'first_win',hideFirst:false,milestoneIndex:0}).find(e=>e.type==='first_win');
  assert.equal(win.runIndex,0,'first shared run is still Run 1');
});

test('a corrected win becomes a loss and the next real win owns the first-win feed entry', () => {
  const entries = feedFor({ firstOutcome: 'first_win', hideFirst: false, correctedWin: true });
  assert.equal(entries.find(e => e.type === 'first_win').runIndex, 3);
  const corrected = entries.find(e => e.type === 'run_completed' && e.runIndex === 2);
  assert.equal(corrected.result, 'death');
  assert.equal(corrected.lastSection, 92);
});
