'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

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
  };
  const context = vm.createContext({ module: { exports: {} }, require: name => deps[name] });
  vm.runInContext(fs.readFileSync(require.resolve('../server/db/feed'), 'utf8'), context);
  const profile = context.module.exports.getPublicProfile('Reader');
  assert.equal(profile.level, 4);
  assert.equal(profile.title, 'Adventurer');
  assert.equal(profile.ratingsGiven, 7);
  assert.equal(profile.averageRating, 3.5);
  for (const key of Object.keys(privateInfo).filter(key => !['level', 'title'].includes(key))) {
    assert.equal(Object.hasOwn(profile, key), false, key + ' must stay private');
  }
  user.public_profile = 0;
  assert.equal(context.module.exports.getPublicProfile('Reader'), null);
});

test('public profile renderer never displays job progression from a stale response', () => {
  const nodes = new Map();
  const document = { getElementById(id) {
    if (!nodes.has(id)) nodes.set(id, { innerHTML: '', style: {}, classList: { remove() {} } });
    return nodes.get(id);
  } };
  const context = vm.createContext({ document, escapeHtml: String, t: key => key });
  const source = fs.readFileSync('public/js/account/public-profile.js', 'utf8')
    .replace(/^import .*;\n/gm, '').replace(/\bexport /g, '');
  vm.runInContext(source, context);
  context.renderPublicProfile({ username: 'Reader', books: [], totalBooks: 0,
    level: 4, title: 'Adventurer', jobXp: 15234, jobLevel: 5, jobTitle: 'Miner', ratingsGiven: 7, averageRating: 3.5 });
  const html = nodes.get('pub-modal-body').innerHTML;
  assert.match(html, /Adventurer/);
  assert.match(html, /profile.ratings_given.*>7</);
  assert.match(html, /profile.average_rating.*>3\.50</);
  assert.doesNotMatch(html, /job-xp|Job Lvl|Job events|15234|15,234|Miner/);
});
