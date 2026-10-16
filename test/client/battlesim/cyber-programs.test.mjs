import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {PROGRAMS, PROGRAM_TYPES, encounterOptions} from '../../../public/js/battlesim/books/758/definition.js';
import {createLedger, validateLedger, resolveProgram, rechargePrograms, useSafety} from '../../../public/js/battlesim/books/758/combat.js';
import {createState} from '../../../public/js/battlesim/books/758/state.js';
import en from '../../../public/js/i18n/en/battlesim/battlesim758.js';
import bg from '../../../public/js/i18n/bg/battlesim/battlesim758.js';

const ownedLedger = clan => {
  const ledger = createLedger(clan);
  for (const program of Object.values(ledger.programs)) Object.assign(program, {owned: true, remaining: 3});
  return ledger;
};

test('758: all 144 printed program choices, including distinct clan guard counters', () => {
  const guards = {A: [1, 2, 0, 2, 0, 1], O: [0, 2, 1, 1, 2, 0]};
  const doorKeys = [0, 1, 2, 0, 1, 2], doorViruses = [2, 1, 0, 2, 0, 1];
  const counts = {win: 0, loss: 0, blocked: 0};
  for (const clan of ['A', 'O']) for (let encounter = 1; encounter <= 18; encounter++) {
    for (const option of encounterOptions(encounter)) {
      const ledger = ownedLedger(clan), before = structuredClone(ledger);
      const result = resolveProgram(ledger, encounter, option.type, option.index);
      const success = encounter <= 6 ? option.index === (encounter - 1) % 3
        : encounter <= 12 ? option.index === (option.type === 'key' ? doorKeys : doorViruses)[encounter - 7]
        : option.index === guards[clan][encounter - 13];
      const outcome = success ? 'win' : option.type === 'key' ? 'blocked' : 'loss';
      assert.equal(result.fight.outcome, outcome, clan + encounter + ':' + option.type + option.index);
      assert.equal(result.fight.section, clan + option.section);
      assert.equal(result.ledger.programs[option.type + option.index].remaining, 2);
      assert.equal(Object.values(result.ledger.programs).reduce((n, program) => n + program.remaining, 0), 26);
      assert.deepEqual(ledger, before);
      counts[outcome]++;
    }
  }
  assert.deepEqual(counts, {win: 48, loss: 72, blocked: 24});
  assert.equal(resolveProgram(ownedLedger('A'), 17, 'virus', 0).fight.section, 'A35');
  assert.equal(resolveProgram(ownedLedger('O'), 15, 'virus', 2).fight.section, 'O69');
});

test('758: programs are not granted, empty/unowned/invalid selections cannot spend activations', () => {
  const empty = createLedger('A');
  assert(Object.values(empty.programs).every(program => !program.owned && program.remaining === 0));
  assert.throws(() => resolveProgram(empty, 1, 'antivirus', 0));
  const ledger = ownedLedger('A'); ledger.programs.antivirus0.remaining = 0;
  const before = structuredClone(ledger);
  assert.throws(() => resolveProgram(ledger, 1, 'antivirus', 0));
  assert.throws(() => resolveProgram(ledger, 1, 'virus', 0));
  for (const value of [0, 19, 1.5, NaN, '1']) assert.throws(() => encounterOptions(value));
  assert.throws(() => validateLedger({...ledger, clan: 'B'}));
  assert.throws(() => validateLedger({...ledger, programs: {}}));
  assert.deepEqual(ledger, before);
});

test('758: recharge only owned programs; safety is single-use and grants no program or victory', () => {
  const ledger = createLedger('O'); ledger.programs.virus2 = {owned: true, remaining: 0}; ledger.safety = true;
  const charged = rechargePrograms(ledger);
  assert.equal(charged.programs.virus2.remaining, 3);
  assert.equal(charged.programs.key0.remaining, 0);
  assert.equal(ledger.programs.virus2.remaining, 0);
  const result = useSafety(charged, 18);
  assert.equal(result.fight.outcome, 'escape'); assert.equal(result.ledger.safety, false);
  assert.equal(result.ledger.programs.virus2.remaining, 3);
  assert.throws(() => useSafety(result.ledger, 18));
});

test('758: atomic run-scoped state and single outcome history', () => {
  let run = {}, book = 758, saves = 0;
  const store = createState(() => ({currentBookId: book, currentPlaythrough: () => run, saveState: () => saves++}));
  store.ensure(); assert.equal(saves, 1);
  store.change(data => {data.ledger = ownedLedger('A'); Object.assign(data, resolveProgram(data.ledger, 1, 'antivirus', 0)); data.fight.name = 'Ivy';});
  assert.equal(run.sim758.history.length, 1);
  store.change(() => {}); assert.equal(run.sim758.history.length, 1);
  const original = run, snapshot = structuredClone(run);
  assert.equal(store.change(() => {run = {};}), false); assert.deepEqual(original, snapshot);
  book = 759; assert.equal(store.read(), null); assert.equal(store.change(() => {}), false);
  assert.equal(run.sim758, undefined);
  book = 758; store.ensure();
  assert.throws(() => store.change(data => {data.ledger.programs.key0.remaining = 4;}));
  assert.equal(run.sim758.ledger.programs.key0.remaining, 0);
  assert.throws(() => store.change(async () => {}), /synchronous/);
});

test('758: EN/BG key parity and every program/encounter translated', () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(bg).sort());
  for (const clan of Object.keys(PROGRAMS)) for (const type of PROGRAM_TYPES) for (const index of [0, 1, 2]) {
    assert.equal(bg['battlesim758.program.' + clan + '.' + type + '.' + index], PROGRAMS[clan][type][index]);
  }
  for (let id = 1; id <= 18; id++) for (const labels of [en, bg]) assert(labels['battlesim758.enemy.' + id]);
});

test('758: backend rewards wins/losses once, never blocked doors or safety escapes', () => {
  const events = [], db = {exec() {}, transaction: fn => () => fn(), prepare: () => ({run() {}, all: () => [],
    get: () => ({id: 758, total_sections: 520, is_container: 0})})};
  const context = {module: {exports: {}}, events, require(name) {
    if (name === './connection') return {db};
    if (name === './auth') return {generateToken: () => 'test-only'};
    if (name === '../impersonation-context') return {isImpersonatingContext: () => false};
    if (name === '../clean-run') return {isCleanRun: () => false};
    throw Error('Unexpected dependency: ' + name);
  }};
  runInNewContext(readFileSync(new URL('../../../server/db/xp.js', import.meta.url), 'utf8') + '\nawardXp = (...args) => events.push(args);', context);
  assert.equal(context.module.exports.SIM_HISTORY_KEYS.filter(key => key === 'sim758').length, 1);
  const state = history => ({graph: {}, playthroughs: [{startedAt: 123, path: [1], sim758: {history}}]});
  const after = state(['win', 'loss', 'blocked', 'escape'].map((outcome, i) => ({outcome, ts: i + 10})));
  context.module.exports.processStateXp(1, 758, state([]), after);
  assert.deepEqual(events.filter(event => event[1].startsWith('battlesim_')).map(event => [...event]),
    [[1, 'battlesim_win', 'sim758:10'], [1, 'battlesim_loss', 'sim758:11']]);
  events.length = 0;
  context.module.exports.processStateXp(1, 758, after, after);
  assert.ok(events.every(event => !event[1].startsWith('battlesim_')));
});
