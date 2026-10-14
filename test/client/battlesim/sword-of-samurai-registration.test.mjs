import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import en from '../../../public/js/i18n/en/battlesim/battlesim672.js';
import bg from '../../../public/js/i18n/bg/battlesim/battlesim672.js';
import { SAMURAI_FIGHTS } from '../../../public/js/battlesim/engines/sword-of-samurai/roster.js';

const read = file => readFileSync(new URL('../../../' + file, import.meta.url), 'utf8');
test('Samurai locales cover every named enemy and share keys and placeholders', () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(bg).sort());
  for (const key of Object.keys(en)) {
    assert.ok(en[key] && bg[key], key);
    const params = value => [...value.matchAll(/\{\w+\}/g)].map(match => match[0]).sort();
    assert.deepEqual(params(en[key]), params(bg[key]), key);
  }
  for (const fight of SAMURAI_FIGHTS) for (const enemy of fight.enemies) {
    assert.ok(en['battlesim672.enemy.' + enemy.name], enemy.name);
    assert.ok(bg['battlesim672.enemy.' + enemy.name], enemy.name);
  }
});
test('Samurai integration registers one history namespace and one overlay', () => {
  for (const file of ['public/js/battlesim/loader.js', 'public/mobile/js/battlesim-dispatch.js']) {
    const supported = read(file).match(/SUPPORTED_BATTLE_SIM_BOOKS = new Set\(\[([\s\S]*?)\]\)/)[1];
    assert.equal([...supported.matchAll(/\b672\b/g)].length, 1, file);
  }
  assert.equal([...read('server/db/xp.js').matchAll(/['"]sim672['"]/g)].length, 1);
  assert.equal([...read('public/js/core/util.js').matchAll(/['"]sim672-overlay['"]/g)].length, 1);
  assert.match(read('public/js/battlesim/engines/sword-of-samurai/panel.js'), /class="inv-modal bsim-modal bsim-compact-form"/);
});
test('actual XP handler awards Samurai wins and losses once, not story exits', () => {
  const source = read('server/db/xp.js');
  const registrations = source.slice(source.indexOf('const SIM_HISTORY_KEYS ='), source.indexOf('function processStateXp('));
  const keys = runInNewContext(registrations + '\nSIM_HISTORY_KEYS;', {});
  assert.equal(keys.filter(key => key === 'sim672').length, 1);
  const awards = [], refs = new Set();
  const context = { db: { prepare: sql => ({ get: () => sql.includes('FROM books') ? {} : { n: 100 } }) },
    awardXp(_user, event, ref) {
      if (refs.has(event + ':' + ref)) return false;
      refs.add(event + ':' + ref); awards.push({ event, ref }); return true;
    },
    awardCoins() {}, getXpAmount: () => 50, isCleanRun: () => false,
    _discoveredSet: () => new Set(), _visitedSet: () => new Set(), _mappedSet: () => new Set(),
    _checkGroupWonAll() {}, SIM_HISTORY_KEYS: keys, _xpRefSeq: 0 };
  runInNewContext(source.slice(source.indexOf('function processStateXp('), source.indexOf('function migrateXpForUser(')), context);
  const state = history => ({ playthroughs: [{ startedAt: 1, path: [], sim672: { history } }] });
  const history = [{ outcome: 'win', ts: 100 }, { outcome: 'loss', ts: 101 },
    { outcome: 'story', ts: 102 }, { outcome: 'cancelled', ts: 103 }, { outcome: 'honourDeath', ts: 104 }];
  context.processStateXp(1, 672, state([]), state(history), 0);
  context.processStateXp(1, 672, state(history), state(history), 0);
  assert.deepEqual(awards.filter(row => row.event.startsWith('battlesim_')),
    [{ event: 'battlesim_win', ref: 'sim672:100' }, { event: 'battlesim_loss', ref: 'sim672:101' }]);
});
