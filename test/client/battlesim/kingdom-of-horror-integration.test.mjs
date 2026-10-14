import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from './simulator-source.mjs';
import { runInNewContext } from 'node:vm';
import translations from '../../../public/js/i18n/en/battlesim/battlesim530.js';
import { KINGDOM_ENCOUNTERS, KINGDOM_DREAMS, KINGDOM_MAGIC_STOCK,
  KINGDOM_STORY_MAGIC, KINGDOM_EQUIPMENT } from '../../../public/js/battlesim/engines/grailquest/kingdom-of-horror-roster.js';

const read = path => readFileSync(new URL('../../../' + path, import.meta.url), 'utf8');

test('Kingdom of Horror is registered in desktop/mobile lazy loaders and exclusive overlays', () => {
  for (const path of ['public/js/battlesim/loader.js', 'public/mobile/js/battlesim-dispatch.js']) {
    const table = read(path).match(/SUPPORTED_BATTLE_SIM_BOOKS = new Set\(\[([\s\S]*?)\]\)/)[1];
    const ids = [...table.matchAll(/\d+/g)].map(match => Number(match[0]));
    assert.ok(ids.includes(530));
    assert.equal(ids.filter(id => id === 530).length, 1);
  }
  const overlays = read('public/js/core/util.js').match(/ALL_PANEL_OVERLAY_IDS = (\[[^;]+\])/)[1];
  assert.ok(runInNewContext(overlays).includes('sim530-overlay'));
});

test('Actual state XP awards completed simulator wins/losses once and ignores avoidance', () => {
  const source = read('server/db/xp.js');
  const keys = runInNewContext(source.match(/const SIM_HISTORY_KEYS = (\[[^;]+\])/)[1]);
  assert.ok(keys.includes('sim530'));
  const awards = [], refs = new Set();
  const context = {
    db: { prepare: sql => ({ get: () => sql.includes('FROM books') ? {} : { n: 100 } }) },
    awardXp(_user, event, ref) {
      if (refs.has(event + ':' + ref)) return false;
      refs.add(event + ':' + ref); awards.push({ event, ref }); return true;
    },
    awardCoins() {}, getXpAmount: () => 50, isCleanRun: () => false,
    _discoveredSet: () => new Set(), _visitedSet: () => new Set(), _mappedSet: () => new Set(),
    _checkGroupWonAll() {}, SIM_HISTORY_KEYS: keys, _xpRefSeq: 0,
  };
  runInNewContext(source.slice(source.indexOf('function processStateXp('), source.indexOf('function migrateXpForUser(')), context);
  const state = history => ({ playthroughs: [{ startedAt: 1, path: [], sim530: { history } }] });
  const history = [{ outcome: 'win', ts: 100 }, { outcome: 'loss', ts: 101 }, { outcome: 'avoided', ts: 102 }];
  context.processStateXp(1, 530, state([]), state(history), 0);
  context.processStateXp(1, 530, state(history), state(history), 0);
  assert.deepEqual(awards.filter(row => row.event.startsWith('battlesim_')),
    [{ event: 'battlesim_win', ref: 'sim530:100' }, { event: 'battlesim_loss', ref: 'sim530:101' }]);
});

test('Own lazy translation table covers every encounter, item, event and literal UI string', () => {
  assert.ok(Object.entries(translations).every(([key, value]) => key.startsWith('battlesim530.') && typeof value === 'string'));
  for (const row of [...KINGDOM_ENCOUNTERS, ...KINGDOM_DREAMS]) assert.ok(translations['battlesim530.enemy_names.' + row.id]);
  for (const item of [...KINGDOM_EQUIPMENT, ...KINGDOM_MAGIC_STOCK.map(row => row.id), ...KINGDOM_STORY_MAGIC]) assert.ok(translations['battlesim530.' + item]);
  const ui = read('public/js/battlesim/battlesim530.js');
  for (const match of ui.matchAll(/tk\('([a-zA-Z0-9_]+)'\)/g)) {
    if (match[1].endsWith('_')) continue;
    assert.ok(translations['battlesim530.' + match[1]], match[1]);
  }
  const engine = read('public/js/battlesim/engines/grailquest/kingdom-of-horror.js')
    + read('public/js/battlesim/engines/grailquest/kingdom-of-horror-magic.js');
  for (const match of engine.matchAll(/kind: '([^']+)'/g)) assert.ok(translations['battlesim530.event_' + match[1]], match[1]);
});
