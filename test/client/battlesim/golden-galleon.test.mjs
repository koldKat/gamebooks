import test from 'node:test';
import assert from 'node:assert/strict';
import { ARCS, SHIPS, DIAGRAMS, TACTICS } from '../../../public/js/battlesim/books/728/definition.js';
import * as combat from '../../../public/js/battlesim/books/728/combat.js';
import { createState } from '../../../public/js/battlesim/books/728/state.js';
import en from '../../../public/js/i18n/en/battlesim/battlesim728.js';
import bg from '../../../public/js/i18n/bg/battlesim/battlesim728.js';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const start = changes => combat.startFight({ ...combat.newShip('large'), ...changes });
const position = (section, changes = {}) => ({ ...start(), section, ...changes });
const next = fight => combat.options(fight).destinations;

test('source ship tables, firing matrices and ammunition reserves', () => {
  assert.deepEqual(Object.values(SHIPS).map(row => Object.values(row)), [[10, 10, 100, 200], [12, 10, 80, 160], [16, 16, 60, 120]]);
  assert.deepEqual(Object.values(ARCS).map(row => row.power), [[6, 4, 2], [12, 8, 6], [24, 16, 12], [18, 12, 8], [8, 6, 4]]);
  assert.deepEqual(Object.values(ARCS).map(row => row.range), [[6, 4, 2], [8, 6, 6], [8, 6, 6], [8, 6, 6], [6, 4, 4]]);
  for (const size of Object.keys(SHIPS)) {
    assert.equal(combat.ammunition(size, 'full'), 16);
    assert.equal(combat.ammunition(size, 'none'), 0);
    assert.equal(combat.ammunition(size, 'partial'), size === 'small' ? 12 : 9);
  }
});

test('opening broadside/stern arcs, damage, range and immutable inputs', () => {
  const before = start(), snapshot = structuredClone(before);
  let fight = combat.fire(before, 'A', 'broadside');
  assert.deepEqual(before, snapshot);
  assert.equal(fight.pirates.A.durability, 42); assert.equal(fight.player.ammo, 14);
  fight = combat.fire(fight, 'B', 'stern');
  assert.equal(fight.pirates.B.durability, 28); assert.equal(fight.player.ammo, 13);
  assert.throws(() => combat.fire(fight, 'A', 'broadside'));
  assert.throws(() => combat.fire(before, 'A', 'bow'));
  const small = combat.fire(start({ ...combat.newShip('small') }), 'B', 'stern');
  assert.equal(small.pirates.B.durability, 30); assert.equal(small.player.ammo, 15);
  assert.equal(small.events.at(-1).inRange, false);
  assert.throws(() => combat.fire(start({ ammo: 1 }), 'A', 'broadside'));
});

test('tactical distance arithmetic, damage timing and no repeated entry effects', () => {
  let fight = combat.advance(start(), 56);
  assert.deepEqual(fight.distances, { A: 6, B: 4 });
  assert.equal(fight.player.durability, 100);
  assert.deepEqual(next(fight), [76, 86]);
  assert.equal(fight.player.durability, 100, 'Preview must not apply damage');
  fight = combat.advance(fight, 76);
  assert.equal(fight.player.durability, 94);
  assert.deepEqual(fight.distances, { A: 1, B: -2 });
  assert.throws(() => combat.fire(fight, 'B', 'broadside'));
  fight = combat.overrideDistances(fight, { A: 1, B: 2 });
  fight = combat.advance(fight, 57);
  assert.equal(fight.player.durability, 84);
  assert.equal(fight.player.speed, 6); assert.equal(fight.player.manoeuvre, 6);
  assert.deepEqual(fight.distances, { A: -1, B: 1 });
  assert.deepEqual(next(fight), ['manual']);
  assert.equal(combat.advance(fight, 'manual').outcome, 'manual');
});

test('escape and attack manoeuvres use the printed separate constants', () => {
  const escaped = combat.advance(start(), 66);
  assert.deepEqual(escaped.distances, { A: 6, B: 2 });
  const smallAttack = combat.advance(escaped, 86);
  assert.deepEqual(smallAttack.distances, { A: 6, B: -2 });
  assert.equal(smallAttack.player.speed, 9);
  const between = combat.advance(smallAttack, 67);
  assert.deepEqual(between.distances, { A: 6, B: 6 });
  assert.equal(between.player.durability, 90); assert.equal(between.player.speed, 7);
  const shot = combat.fire(between, 'A', 'broadside');
  assert.deepEqual(next(shot), [95]);
  assert.throws(() => combat.advance(shot, 77));
  const reset = combat.advance(shot, 95);
  assert.equal(reset.pirates.A.durability, 42); assert.equal(reset.player.ammo, 14);
  assert.equal(reset.player.durability, 90);
});

test('volley caps and per-target limits; 96 permits two shots at one target', () => {
  for (const section of [57, 77, 97]) {
    const once = combat.fire(position(section, { distances: { A: 2, B: 2 } }), 'A', 'broadside');
    assert.throws(() => combat.fire(once, 'B', 'broadside'));
  }
  const single = combat.fire(position(66, { distances: { A: 2, B: 2 } }), 'A', 'broadside');
  assert.throws(() => combat.fire(single, 'A', 'broadside'));
  let twice = combat.fire(position(96, { distances: { A: 2, B: 2 } }), 'A', 'broadside');
  twice = combat.fire(twice, 'A', 'broadside');
  assert.equal(twice.pirates.A.durability, 16);
  assert.throws(() => combat.fire(twice, 'B', 'broadside'));
});

test('printed explosion thresholds and boarding hooks stay section-specific', () => {
  for (const [section, health, target] of [[96, 19, 'B'], [96, 20, 'both']]) {
    let fight = position(section, { pirates: { A: { durability: health }, B: { durability: 30 } } });
    fight = combat.advance(fight, 78);
    assert.deepEqual(fight.attackers, target === 'both' ? ['A', 'B'] : ['B']);
  }
  assert.deepEqual(next(position(97, { pirates: { A: { durability: 15 }, B: { durability: 30 } } })), [68]);
  assert.deepEqual(next(position(97, { pirates: { A: { durability: 16 }, B: { durability: 0 } } })), [58]);
  const hooks = combat.advance(position(97, { pirates: { A: { durability: 16 }, B: { durability: 0 } } }), 58);
  assert.deepEqual(hooks.attackers, ['A', 'B']);
});

test('soldier thresholds, missing boundaries and partial-supply overlaps remain explicit', () => {
  const troops = (number, type = 'professional') => position(88, {
    player: { ...combat.newShip('large'), soldiers: number, soldierType: type }, attackers: ['A', 'B'],
  });
  for (const number of [40, 60]) {
    assert.deepEqual(next(troops(number)), [59, 69]);
    assert.equal(combat.options(troops(number)).manual, 'missing88');
  }
  assert.deepEqual(next(troops(39)), [59]); assert.deepEqual(next(troops(61)), [69]);
  assert.deepEqual(next(troops(50)), [69]); assert.deepEqual(next(troops(50, 'mercenary')), [59]);
  const overlap = position(99, { player: { ...combat.newShip('medium'), soldiers: 50, weapons: 'partial' } });
  assert.deepEqual(next(overlap), [101, 100]); assert.equal(combat.options(overlap).manual, 'overlap99');
});

test('boarding casualty halves are not silently rounded and virtual crew are not soldiers', () => {
  let fight = position(88, { player: { ...combat.newShip(), soldiers: 25 }, attackers: ['A'] });
  fight = combat.advance(fight, 59); assert.equal(fight.player.soldiers, 12.5);
  fight = combat.advance(fight, 70); assert.equal(fight.player.soldiers, 7.5);
  assert.equal(fight.player.manoeuvre, 2); assert.equal(fight.player.durability, 70);
  let sailors = position(98, { player: { ...combat.newShip('large'), seaWolves: true }, attackers: ['B'] });
  sailors = combat.advance(sailors, 89); assert.equal(sailors.virtualTroops, 50);
  sailors = combat.advance(sailors, 90); assert.equal(sailors.player.soldiers, 0); assert.equal(sailors.virtualTroops, 50);
  assert.deepEqual(next(sailors), [101]);
});

test('last stand and damage preserve source conditions without phantom victory', () => {
  assert.deepEqual(next(position(78)), ['loss']);
  const unarmed = position(99, { player: { ...combat.newShip(), weapons: 'none' } });
  assert.deepEqual(next(unarmed), ['loss']);
  assert.equal(combat.advance(unarmed, 'loss').outcome, 'loss');
  const unresolved = position(100, { attackers: ['A'] });
  assert.deepEqual(next(unresolved), ['manual']);
  const won = combat.advance(position(99, { player: { ...combat.newShip('large'), soldiers: 20 } }), 101);
  assert.equal(won.outcome, 'win'); assert.equal(won.destination, 101);
  assert.throws(() => combat.fire(won, 'A', 'bow'));
  const doomed = position(56, { player: { ...combat.newShip(), durability: 1 }, distances: { A: 1, B: 2 } });
  assert.deepEqual(next(doomed), ['loss']); assert.equal(combat.advance(doomed, 'loss').outcome, 'loss');
});

test('state preserves other simulators, records each result once, and ignores manual exits', () => {
  const run = { other: { important: true } };
  let saves = 0, book = 728, liveRun = run;
  const store = createState(() => ({ currentBookId: book, currentPlaythrough: () => liveRun, saveState: () => saves++ }));
  assert.equal(store.read(), null);
  store.change(data => { data.encounterName = 'Pirates'; data.fight = combat.advance(position(99), 101); });
  assert.equal(run.sim728.history.length, 1); assert.deepEqual(run.other, { important: true });
  store.change(() => {}); assert.equal(run.sim728.history.length, 1);
  store.change(data => { data.fight = combat.advance(position(57), 'manual'); });
  assert.equal(run.sim728.history.length, 1);
  const before = structuredClone(run);
  book = 1; assert.equal(store.change(() => { throw Error('should not run'); }), false);
  assert.deepEqual(run, before);
  book = 728;
  assert.equal(store.change(() => { liveRun = {}; }), false);
  assert.deepEqual(run, before); assert.equal(saves, 3);
});

test('both locales cover tactical/boarding labels and use matching interpolation fields', () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(bg).sort());
  for (const key of Object.keys(en)) {
    assert.deepEqual([...en[key].matchAll(/\{([^}]+)\}/g)].map(match => match[1]).sort(), [...bg[key].matchAll(/\{([^}]+)\}/g)].map(match => match[1]).sort(), key);
  }
  for (const section of [...TACTICS, 58, 68, 87, 78, 88, 59, 60, 70, 69, 80, 90, 98, 79, 89, 99, 100, 101]) assert.ok(en['battlesim728.phase.' + section]);
  for (const hash of Object.values(DIAGRAMS)) assert.match(hash, /^[a-f0-9]{64}$/);
});

test('actual backend XP processor registers naval results and ignores manual/cancelled exits', () => {
  const source = readFileSync(new URL('../../../server/db/xp.js', import.meta.url), 'utf8');
  const registry = source.slice(source.indexOf('const SIM_HISTORY_KEYS ='), source.indexOf('function processStateXp('));
  const processor = source.slice(source.indexOf('function processStateXp('), source.indexOf('function migrateXpForUser('));
  const awards = [], ledger = new Set();
  const context = {
    db: { prepare: sql => ({ get: () => sql.includes('FROM books') ? {} : { n: 100 } }) },
    isCleanRun: () => false, awardCoins() {}, getXpAmount: () => 50,
    _discoveredSet: () => new Set(), _visitedSet: () => new Set(), _mappedSet: () => new Set(),
    _checkGroupWonAll() {}, _xpRefSeq: 0,
    awardXp(_user, event, ref) {
      const key = event + ':' + ref;
      if (ledger.has(key)) return false;
      ledger.add(key); awards.push({ event, ref }); return true;
    },
  };
  runInNewContext(registry + '\nglobalThis.registeredKeys = SIM_HISTORY_KEYS;\n' + processor, context);
  assert.ok(context.registeredKeys.includes('sim728'));
  const before = { playthroughs: [{ startedAt: 1, path: [1], sim728: { history: [] } }] };
  const after = { playthroughs: [{ startedAt: 1, path: [1], sim728: { history: [
    { outcome: 'win', ts: 11 }, { outcome: 'loss', ts: 12 }, { outcome: 'manual', ts: 13 }, { outcome: 'cancelled', ts: 14 },
  ] } }] };
  context.processStateXp(1, 728, before, after, 0);
  context.processStateXp(1, 728, after, after, 0);
  assert.deepEqual(awards, [{ event: 'battlesim_win', ref: 'sim728:11' }, { event: 'battlesim_loss', ref: 'sim728:12' }]);
});
