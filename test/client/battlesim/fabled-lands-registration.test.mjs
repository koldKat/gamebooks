import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import en from '../../../public/js/i18n/en/battlesim/battlesim674.js';
import bg from '../../../public/js/i18n/bg/battlesim/battlesim674.js';
import { WAR_TORN_FIGHTS } from '../../../public/js/battlesim/engines/fabled-lands/roster.js';
import risingEn from '../../../public/js/i18n/en/battlesim/battlesim679.js';
import risingBg from '../../../public/js/i18n/bg/battlesim/battlesim679.js';
import { RISING_FIGHTS } from '../../../public/js/battlesim/engines/fabled-lands/rising-sun.js';

const read = file => readFileSync(new URL('../../../' + file, import.meta.url), 'utf8');
test('Fabled Lands locales cover every enemy and share keys and placeholders', () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(bg).sort());
  const params = value => [...value.matchAll(/\{\w+\}/g)].map(match => match[0]).sort();
  for (const key of Object.keys(en)) {
    assert.ok(en[key] && bg[key], key); assert.deepEqual(params(en[key]), params(bg[key]), key);
  }
  for (const fight of WAR_TORN_FIGHTS) for (const enemy of fight.enemies) {
    assert.ok(en['battlesim674.enemy.' + enemy.name], enemy.name);
    assert.ok(bg['battlesim674.enemy.' + enemy.name], enemy.name);
  }
});
test('both loaders, shortcuts, styling and XP register the new simulator exactly once', () => {
  for (const file of ['public/js/battlesim/loader.js', 'public/mobile/js/battlesim-dispatch.js']) {
    const supported = read(file).match(/SUPPORTED_BATTLE_SIM_BOOKS = new Set\(\[([\s\S]*?)\]\)/)[1];
    assert.equal([...supported.matchAll(/\b674\b/g)].length, 1, file);
  }
  assert.equal([...read('server/db/xp.js').matchAll(/['"]sim674['"]/g)].length, 1);
  assert.equal([...read('public/js/core/util.js').matchAll(/['"]sim674-overlay['"]/g)].length, 1);
  const selectors = [...read('public/css/battlesim.css').matchAll(/(?:^|\n)([^{}]+)\{/g)]
    .flatMap(match => match[1].split(',').map(selector => selector.trim()));
  assert.ok(selectors.includes('#sim674-btn'));
  assert.match(read('public/js/battlesim/engines/fabled-lands/panel.js'), /class="inv-modal bsim-modal bsim-compact-form"/);
});
test('book-six locales, encounters and registrations are complete', () => {
  assert.deepEqual(Object.keys(risingEn).sort(),Object.keys(risingBg).sort());
  for (const key of Object.keys(risingEn)) {
    const placeholders = value => [...value.matchAll(/\{\w+\}/g)].map(match=>match[0]).sort();
    assert.deepEqual(placeholders(risingEn[key]),placeholders(risingBg[key]),key);
  }
  for (const fight of RISING_FIGHTS) {
    for (const enemy of fight.enemies) assert.ok(risingEn['battlesim679.enemy.'+enemy.name]);
    if (fight.special) assert.ok(risingEn['battlesim679.effect.'+fight.special]);
  }
  for (const file of ['public/js/battlesim/loader.js','public/mobile/js/battlesim-dispatch.js']) {
    const supported = read(file).match(/SUPPORTED_BATTLE_SIM_BOOKS = new Set\(\[([\s\S]*?)\]\)/)[1];
    assert.equal([...supported.matchAll(/\b679\b/g)].length,1);
  }
  assert.equal([...read('server/db/xp.js').matchAll(/['"]sim679['"]/g)].length,1);
  assert.equal([...read('public/js/core/util.js').matchAll(/['"]sim679-overlay['"]/g)].length,1);
});
test('the actual XP handler awards wins and losses once, not surrender or abandoned fights', () => {
  const source = read('server/db/xp.js');
  const registrations = source.slice(source.indexOf('const SIM_HISTORY_KEYS ='), source.indexOf('function processStateXp('));
  const keys = runInNewContext(registrations + '\nSIM_HISTORY_KEYS;', {});
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
  const state = history => ({ playthroughs: [{ startedAt: 1, path: [], sim674: { history } }] });
  const history = [{ outcome: 'win', ts: 100 }, { outcome: 'loss', ts: 101 },
    { outcome: 'surrender', ts: 102 }, { outcome: 'cancelled', ts: 103 }];
  context.processStateXp(1, 674, state([]), state(history), 0);
  context.processStateXp(1, 674, state(history), state(history), 0);
  assert.deepEqual(awards.filter(row => row.event.startsWith('battlesim_')),
    [{ event: 'battlesim_win', ref: 'sim674:100' }, { event: 'battlesim_loss', ref: 'sim674:101' }]);
});
