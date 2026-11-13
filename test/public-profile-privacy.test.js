'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { publicName } = require('../server/public-name');

test('public profile responses omit private progression and balances', () => {
  const user = { id: 7, username: 'Reader', public_profile: 1 };
  const privateInfo = { level: 4, title: 'Adventurer', jobXp: 15234, jobLevel: 5,
    jobTitle: 'Miner', jobLevelCap: 9, coins: 123, rubies: 2, diamonds: 1 };
  const deps = {
    './connection': { db: { prepare: sql => ({
      get: () => sql.includes('FROM users WHERE username') ? user : undefined,
      all: () => [],
    }) } },
    './xp': { getUserXpInfo: () => privateInfo },
    './job-xp': {}, './content': {}, './books': {},
    './rating-stats': { getPlayerRatingStats: () => ({ ratingsGiven: 7, averageRating: 3.5 }) },
    './gameplay-stats': { getSimulatorBattleStats: () => ({ simBattlesFought: 12, simBattlesWon: 9, simBattlesLost: 3 }) },
    './profile-progress': { ...require('../server/db/profile-progress'), collectedCount: () => 2 },
  };
  const context = vm.createContext({ module: { exports: {} }, require: name => deps[name] });
  vm.runInContext(fs.readFileSync(require.resolve('../server/db/feed'), 'utf8'), context);
  const profile = context.module.exports.getPublicProfile('Reader');
  assert.equal(profile.level, 4);
  assert.equal(profile.title, 'Adventurer');
  assert.equal(profile.ratingsGiven, 7);
  assert.equal(profile.averageRating, 3.5);
  assert.equal(profile.simBattlesFought, 12);
  assert.equal(profile.simBattlesWon, 9);
  assert.equal(profile.simBattlesLost, 3);
  assert.equal(profile.collectiblesCollected, 2);
  assert.equal(profile.sectionsDiscovered, 0);
  assert.equal(profile.sectionsVisited, 0);
  assert.equal(profile.booksWon, 0);
  const ownStats = context.module.exports.getProfileStats(user.id);
  assert.equal(ownStats.simBattlesFought, 12);
  assert.equal(ownStats.simBattlesWon, 9);
  assert.equal(ownStats.simBattlesLost, 3);
  for (const key of Object.keys(privateInfo).filter(key => !['level', 'title'].includes(key))) {
    assert.equal(Object.hasOwn(profile, key), false, key + ' must stay private');
  }
  user.public_profile = 0;
  assert.equal(context.module.exports.getPublicProfile('Reader'), null);
});

test('public profile renderer never displays job progression from a stale response', () => {
  const nodes = new Map();
  const document = { getElementById(id) {
    if (!nodes.has(id)) nodes.set(id, { innerHTML: '', style: {}, querySelectorAll: () => [], classList: { remove() {} } });
    return nodes.get(id);
  } };
  const context = vm.createContext({ document, escapeHtml: String, publicName, t: key => key });
  vm.runInContext(fs.readFileSync('public/js/account/role-badges.js', 'utf8')
    .replace(/\bexport /g, ''), context);
  vm.runInContext(fs.readFileSync('public/js/account/profile-stats.js', 'utf8')
    .replace(/^import .*;\n/gm, '').replace(/\bexport /g, ''), context);
  const source = fs.readFileSync('public/js/account/public-profile.js', 'utf8')
    .replace(/^import .*;\n/gm, '').replace(/\bexport /g, '');
  vm.runInContext(source, context);
  context.renderPublicProfile({ username: 'Reader', books: [], totalBooks: 0,
    level: 4, title: 'Adventurer', jobXp: 15234, jobLevel: 5, jobTitle: 'Miner', ratingsGiven: 7, averageRating: 3.5,
    simBattlesFought: 12, simBattlesWon: 9, simBattlesLost: 3 });
  const html = nodes.get('pub-modal-body').innerHTML;
  assert.match(html, /Adventurer/);
  assert.match(html, /Profile.ratings_given.*>7</);
  assert.match(html, /Profile.average_rating.*>3\.50</);
  assert.match(html, /Profile.stats.fought<\/span><span class="pub-stat-val">12</);
  assert.match(html, /Profile.stats.won<\/span><span class="pub-stat-val">9</);
  assert.match(html, /Profile.stats.lost<\/span><span class="pub-stat-val">3</);
  assert.doesNotMatch(html, /job-xp|Job Lvl|Job events|15234|15,234|Miner/);
  assert.doesNotMatch(html, /profile-titles|Profile.stats.titles/);
  context.renderPublicProfile({ username: 'Reader', totalBooks: 1, books: [{ id: 10, name: 'Anthology', runs: [
    { bookId: 11, index: 0, result: 'success' },
    { bookId: 11, index: 1, result: 'death' },
    { bookId: 12, index: 0, result: 'success' },
  ] }] });
  assert.match(nodes.get('pub-modal-body').innerHTML, /Pub.stat.books_played<\/span><span class="pub-stat-val">2</,
    'anthology chapters count as individual played books, with repeat runs deduplicated');
});
