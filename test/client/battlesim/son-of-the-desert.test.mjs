import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { definition, ENCOUNTERS } from '../../../public/js/battlesim/books/706/definition.js';
import { startEncounter, addPenalty, finishEncounter, enduranceAfter, defendShip, retakeShip, attackShip, barracksPenalty } from '../../../public/js/battlesim/books/706/combat.js';
import { createState } from '../../../public/js/battlesim/books/706/state.js';
import en from '../../../public/js/i18n/en/battlesim/battlesim706.js';
import bg from '../../../public/js/i18n/bg/battlesim/battlesim706.js';

const deploy = points => {
  const force = Object.values(points).reduce((n, p) => n + p.force, 0);
  return { А: { force: 31 - force }, ...points };
};

test('706: the real backend rewards battle outcomes once and ignores retreat', () => {
  const events = [];
  const db = { exec() {}, transaction: fn => () => fn(), prepare: () => ({
    run() {}, all: () => [], get: () => ({ id: 706, total_sections: 560, is_container: 0 }),
  }) };
  const context = { module: { exports: {} }, events, require(name) {
    if (name === './connection') return { db };
    if (name === './auth') return { generateToken: () => 'test-only' };
    if (name === '../impersonation-context') return { isImpersonatingContext: () => false };
    if (name === '../clean-run') return { isCleanRun: () => false };
    throw Error('Unexpected dependency: ' + name);
  } };
  runInNewContext(readFileSync(new URL('../../../server/db/xp.js', import.meta.url), 'utf8')
    + '\nawardXp = (...args) => events.push(args);', context);
  assert.equal(context.module.exports.SIM_HISTORY_KEYS.filter(key => key === 'sim706').length, 1);
  const state = history => ({ graph: {}, playthroughs: [{ startedAt: 123, path: [1], sim706: { history } }] });
  const before = state([]), after = state(['win', 'loss', 'retreat', 'cancelled'].map((outcome, i) => ({ outcome, ts: i + 10 })));
  context.module.exports.processStateXp(1, 706, before, after);
  assert.deepEqual(events.filter(e => e[1].startsWith('battlesim_')).map(e => [...e]),
    [[1, 'battlesim_win', 'sim706:10'], [1, 'battlesim_loss', 'sim706:11']]);
  events.length = 0;
  context.module.exports.processStateXp(1, 706, after, after);
  assert.ok(events.every(e => !e[1].startsWith('battlesim_')));
});

test('706: original encounters, translations and zero-level failure rules', () => {
  assert.equal(definition.id, 706);
  assert.equal(Object.keys(ENCOUNTERS).length, 18);
  assert.deepEqual(Object.keys(en).sort(), Object.keys(bg).sort());
  for (const [id, rule] of Object.entries(ENCOUNTERS)) {
    assert.ok(en['battlesim706.encounter.' + id]);
    const fight = startEncounter(id);
    assert.equal(addPenalty(fight, 0).outcome, null);
    assert.equal(addPenalty(fight, rule.level || 1).outcome, 'loss');
    assert.equal(fight.penalties, 0);
    assert.equal(finishEncounter(fight).outcome, 'win');
  }
  assert.equal(startEncounter(373).fatal, 483);
  assert.equal(startEncounter('map-6').level, 16);
  assert.equal(addPenalty(addPenalty(startEncounter(42), 4), 1).outcome, 'loss');
  assert.throws(() => addPenalty(finishEncounter(startEncounter(42)), 1));
});

test('706: zero Endurance lives, negative dies and recovery cannot exceed 40', () => {
  assert.deepEqual(enduranceAfter(1, -1), { endurance: 0, dead: false });
  assert.deepEqual(enduranceAfter(0, -1), { endurance: -1, dead: true });
  assert.equal(enduranceAfter(39, 8).endurance, 40);
  assert.throws(() => enduranceAfter(NaN, 1));
});

test('706: all barracks approaches and group-size boundaries match the source', () => {
  for (const [size, expected] of [[4, 6], [5, 7], [8, 7], [9, 8], [16, 8], [17, 9], [25, 9], [26, 10], [33, 10], [34, 11], [48, 11]]) {
    assert.equal(barracksPenalty(419, size), 7 + expected);
    assert.equal(barracksPenalty(429, size), 9 + expected);
    assert.equal(barracksPenalty(449, size), 8 + expected);
    assert.equal(barracksPenalty(459, size), 6 + expected);
    assert.equal(barracksPenalty(439, size), 0);
  }
  assert.equal(addPenalty(startEncounter('map-6'), barracksPenalty(429, 48)).outcome, 'loss');
  assert.throws(() => barracksPenalty(419, 3));
  assert.throws(() => barracksPenalty(419, 49));
});

test('706: printed hold example, simultaneous clearance and K follows the printed central-mast rule', () => {
  const example = defendShip(deploy({ Д: { force: 6, pots: 1 } }));
  assert.equal(example.results.find(p => p.key === 'Д').survivors, 4);
  for (const key of ['Б', 'Г']) {
    const result = defendShip(deploy({ [key]: { force: 3 } })).results.find(p => p.key === key);
    assert.equal(result.secured, true);
    assert.equal(result.casualties, 3);
  }
  const mast = defendShip(deploy({ К: { force: 4 } })).results.find(p => p.key === 'К');
  assert.equal(mast.casualties, 4);
  assert.equal(mast.points, 0);
});

test('706: equipment limits, armoury explosion and left-side ranged reductions', () => {
  assert.equal(defendShip(deploy({})).results.find(p => p.key === 'В').points, -8);
  assert.equal(defendShip(deploy({ Б: { force: 1, pots: 8 } })).results.find(p => p.key === 'В').points, -2);
  const left = defendShip(deploy({ Ж: { force: 5, whip: true, chestnuts: true, bows: 3 } }), { whip: true, chestnuts: true });
  assert.equal(left.results.find(p => p.key === 'Ж').casualties, 3);
  assert.equal(left.results.find(p => p.key === 'Ж').secured, true);
  assert.equal(defendShip(deploy({ И: { force: 1, whip: true } }), { whip: true }).results.find(p => p.key === 'И').casualties, 0);
  assert.throws(() => defendShip({ А: { force: 30 } }));
  assert.throws(() => defendShip(deploy({ Б: { force: 1, whip: true } })));
  assert.throws(() => defendShip(deploy({ Б: { force: 1, whip: true }, Г: { force: 1, whip: true } }), { whip: true }));
  assert.throws(() => defendShip(deploy({ Б: { force: 1, bows: 2 } })));
});

test('706: retaking and final assault do not invent casualty order or force a suicidal attack', () => {
  assert.equal(retakeShip({ survivors: 3, remainingPirates: 3 }).destination, 58);
  assert.equal(retakeShip({ survivors: 3, remainingPirates: 3, whipSurvives: true, whipKills: 3 }).survivors, 2);
  assert.throws(() => retakeShip({ survivors: 3, remainingPirates: 3, whipKills: 3 }));
  assert.equal(attackShip({ survivors: 15 }).destination, 78);
  assert.equal(attackShip({ survivors: 16 }).destination, 68);
  assert.equal(attackShip({ survivors: 1, pots: 5 }).destination, 68);
  assert.equal(attackShip({ survivors: 0, pots: 5 }).destination, 58);
});

test('706: saved outcomes occur once, negotiations and cancellation do not grant battle XP', () => {
  let saves = 0;
  const run = { sim700: { preserved: true } };
  const store = createState(() => ({ currentBookId: 706, currentPlaythrough: () => run, saveState: () => saves++ }));
  store.ensure();
  store.change(d => { d.fight = { ...finishEncounter(startEncounter(42)), name: 'Negotiation' }; });
  assert.equal(run.sim706.history.length, 0);
  store.change(d => { d.fight = { ...finishEncounter(startEncounter(31)), name: 'Bodyguard' }; });
  store.change(() => {});
  assert.equal(run.sim706.history.length, 1);
  assert.equal(run.sim706.history[0].outcome, 'win');
  store.change(d => { d.naval = { outcome: 'retreat', name: 'Sea Wolf' }; });
  assert.equal(run.sim706.history.length, 1);
  assert.deepEqual(run.sim700, { preserved: true });
  const before = JSON.stringify(run);
  assert.throws(() => store.change(d => { d.character.endurance = 0; throw Error('Failed action'); }));
  assert.equal(JSON.stringify(run), before);
  assert.equal(saves, 5);
});

test('706: state transactions refuse stale runs and unrelated books', () => {
  const old = {}, next = {};
  let run = old, id = 706, saves = 0;
  const store = createState(() => ({ currentBookId: id, currentPlaythrough: () => run, saveState: () => saves++ }));
  assert.equal(store.change(() => { run = next; }), false);
  assert.equal(old.sim706, undefined);
  id = 700;
  assert.equal(store.change(() => {}), false);
  assert.equal(saves, 0);
});
