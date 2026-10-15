import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { CHECKS, ENCOUNTERS } from '../../../public/js/battlesim/books/2116/definition.js';
import { resolveCheck, resolveEncounter } from '../../../public/js/battlesim/books/2116/combat.js';
import { createState } from '../../../public/js/battlesim/books/2116/state.js';
import en from '../../../public/js/i18n/en/battlesim/battlesim2116.js';
import bg from '../../../public/js/i18n/bg/battlesim/battlesim2116.js';

const stats = {stick: 6, speed: 4, reflex: 4, strength: 4, knife: 5, kick: 5, punch: 5};
const items = {pipe: true, knife: true, spray: true, holyWater: true, stake: true};

test('2116: all printed strict thresholds, methods and translations', () => {
  assert.deepEqual(Object.values(CHECKS).map(rule => rule.threshold), [16, 18, 17, 20, 4, 18, 18, 3, 16]);
  assert.deepEqual(Object.keys(en).sort(), Object.keys(bg).sort());
  for (const [section, rule] of Object.entries(CHECKS)) {
    const key = Object.keys(rule.terms).find(key => rule.terms[key] === 1);
    const boundary = Object.fromEntries(Object.keys(rule.terms).map(key => [key, 0]));
    boundary[key] = rule.threshold;
    assert.equal(resolveCheck(section, boundary, items).section, rule.failure);
    boundary[key]++;
    assert.equal(resolveCheck(section, boundary, items).section, rule.success);
  }
  for (const methods of Object.values(ENCOUNTERS)) for (const id of methods) assert.ok(en['battlesim2116.method.' + id]);
  assert.throws(() => resolveCheck(26, stats), /equipment/);
  assert.throws(() => resolveEncounter('skinhead', 30, stats), /equipment/);
  assert.throws(() => resolveCheck(28, {...stats, kick: NaN}), /quality/);
  assert.throws(() => resolveCheck('toString', stats), /Unknown/);
  assert.throws(() => resolveEncounter('collie', 30, stats, items), /method/);
});

test('2116: printed equipment effects, retry penalties and complete collie escape', () => {
  const before = JSON.stringify({stats, items});
  const pipe = resolveEncounter('skinhead', 26, stats, items);
  assert.equal(pipe.consumed, 'pipe'); assert.equal(pipe.next, 36);
  assert.equal(resolveEncounter('skinhead', 30, stats, items).outcome, 'win');
  const failed = resolveEncounter('skinhead', 28, {...stats, kick: 0}, items);
  assert.equal(failed.scoreDelta, -6); assert.equal(failed.retry, 7);
  assert.equal(resolveEncounter('goblins', 113, stats, items).scoreDelta, -5);
  assert.equal(resolveEncounter('goblins', 117, stats, items).next, 120);
  assert.equal(resolveEncounter('collie', 135, {...stats, speed: 3}, items).section, 138);
  assert.equal(resolveEncounter('collie', 135, stats, items).outcome, 'escape');
  assert.equal(resolveEncounter('collie', 140, stats, items).scoreDelta, 1);
  assert.equal(resolveEncounter('collie', 146, stats, items).consumed, 'holyWater');
  assert.equal(JSON.stringify({stats, items}), before);
});

test('2116: immutable per-run state records wins and losses once, never escape', () => {
  let book = 2116, run = {}, saves = 0;
  const state = createState(() => ({currentBookId: book, currentPlaythrough: () => run, saveState: () => saves++}));
  assert.equal(state.read(), null);
  state.ensure(); assert.equal(state.read().character, null); assert.deepEqual(state.read().items, {});
  state.change(d => {d.fight = {name: 'Collie', outcome: 'escape'};});
  assert.equal(state.read().history.length, 0);
  state.change(d => {d.fight = {name: 'Skinhead', outcome: 'win'};});
  const previous = state.read();
  state.change(() => {});
  assert.equal(state.read().history.length, 1); assert.notEqual(state.read(), previous);
  state.change(d => {d.fight = {name: 'Goblins', outcome: 'loss'};});
  assert.equal(state.read().history.length, 2);
  const before = JSON.stringify(run), oldRun = run;
  assert.equal(state.change(() => {run = {};}), false);
  assert.equal(JSON.stringify(oldRun), before);
  assert.equal(state.read(), null);
  book = 999; assert.equal(state.change(() => {}), false);
  assert.equal(saves, 5);
});

test('2116: actual backend rewards outcomes once, not escapes', () => {
  const events = [], db = {exec() {}, transaction: fn => () => fn(), prepare: () => ({run() {}, all: () => [],
    get: () => ({id: 2116, total_sections: 148, is_container: 0})})};
  const context = {module: {exports: {}}, events, require(name) {
    if (name === './connection') return {db};
    if (name === './auth') return {generateToken: () => 'test-only'};
    if (name === '../impersonation-context') return {isImpersonatingContext: () => false};
    if (name === '../clean-run') return {isCleanRun: () => false};
    throw Error('Unexpected dependency: ' + name);
  }};
  runInNewContext(readFileSync(new URL('../../../server/db/xp.js', import.meta.url), 'utf8') + '\nawardXp = (...args) => events.push(args);', context);
  assert.equal(context.module.exports.SIM_HISTORY_KEYS.filter(key => key === 'sim2116').length, 1);
  const state = history => ({graph: {}, playthroughs: [{startedAt: 123, path: [1], sim2116: {history}}]});
  const after = state(['win', 'loss', 'escape'].map((outcome, i) => ({outcome, ts: i + 10})));
  context.module.exports.processStateXp(1, 2116, state([]), after);
  assert.deepEqual(events.filter(e => e[1].startsWith('battlesim_')).map(e => [...e]),
    [[1, 'battlesim_win', 'sim2116:10'], [1, 'battlesim_loss', 'sim2116:11']]);
  events.length = 0;
  context.module.exports.processStateXp(1, 2116, after, after);
  assert.ok(events.every(e => !e[1].startsWith('battlesim_')));
});
