import {loadFixtureRoster} from './roster-fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {CHANCE_TABLE, EASY_PRESETS, HARD_PRESETS} from '../../../public/js/battlesim/books/891/definition.js';
import {startFight, exchange, resolveDamage, sampleChance, setTurn, amendFighter, amendFighters, abandon} from '../../../public/js/battlesim/books/891/combat.js';
import {createState} from '../../../public/js/battlesim/books/891/state.js';

const fighter = values => ({displayName: 'Робот', attack: 10, defence: 10, damage: 3, hp: 20, ...values});
const hard = (player = {}, enemy = {}, setup = {}) => startFight(fighter(player), fighter(enemy), {mode: 'hard', ...setup});

await loadFixtureRoster(891);

test('891 samples cells from the original nonuniform 54-cell chance table', () => {
  assert.equal(CHANCE_TABLE.length, 54);
  assert.deepEqual(CHANCE_TABLE.map((_, index) => sampleChance(() => (index + 0.5) / 54)), [...CHANCE_TABLE]);
  assert.notEqual(CHANCE_TABLE.filter(value => value === 1).length, CHANCE_TABLE.filter(value => value === 6).length);
  for (const value of [-1, 1, NaN, Infinity]) assert.throws(() => sampleChance(() => value), RangeError);
});

test('891 easy exchanges use opposed attacks, harmless ties and winner damage', () => {
  const original = startFight(fighter(), fighter({attack: 8, damage: 9}));
  const before = structuredClone(original);
  const tie = exchange(original, {playerChance: 1, enemyChance: 3});
  assert.equal(tie.player.hp, 20); assert.equal(tie.enemy.hp, 20);
  const win = exchange(tie, {playerChance: 6, enemyChance: 1});
  assert.equal(win.enemy.hp, 17); assert.equal(win.player.hp, 20);
  const loss = exchange(win, {playerChance: 1, enemyChance: 12});
  assert.equal(loss.player.hp, 11); assert.equal(loss.enemy.hp, 17);
  assert.deepEqual(original, before);
  assert.equal(loss.exchanges, 3);
});

test('891 optional easy one-hit combat does not require invented damage', () => {
  const fight = startFight(fighter({damage: null}), fighter(), {oneHit: true});
  const next = exchange(fight, {playerChance: 12, enemyChance: 1});
  assert.equal(next.enemy.hp, 0); assert.equal(next.outcome, 'win'); assert.equal(next.pendingDamage, null);
  const zero = exchange(startFight(fighter({damage: 0}), fighter()), {playerChance: 12, enemyChance: 1});
  assert.equal(zero.enemy.hp, 20); assert.equal(zero.outcome, null);
});

test('891 hard attacks use distance instead of a defence roll when present', () => {
  const original = hard();
  const next = exchange(original, {playerChance: 3, enemyChance: 12, distance: 2});
  assert.equal(next.events[0].attack, 13); assert.equal(next.events[0].defence, 12);
  assert.equal(next.events[0].defenceChance, null); assert.equal(next.enemy.hp, 17); assert.equal(next.turn, 'enemy');
  const fallback = exchange(original, {playerChance: 3, enemyChance: 4});
  assert.equal(fallback.player.hp, 16); assert.equal(fallback.enemy.hp, 20);
  assert.equal(fallback.events[0].defence, 14);
});

test('891 hard successful defence costs the attacker exactly four LIFE', () => {
  const next = exchange(hard({}, {defence: 100, damage: 999}), {playerChance: 1, enemyChance: 1});
  assert.equal(next.player.hp, 16); assert.equal(next.enemy.hp, 20); assert.equal(next.turn, 'enemy');
  const tie = exchange(hard(), {playerChance: 5, enemyChance: 5});
  assert.equal(tie.player.hp, 20); assert.equal(tie.enemy.hp, 20); assert.equal(tie.turn, 'enemy');
});

test('891 unspecified damage pauses once and survives a saved-fight round trip', () => {
  const fight = hard({attack: 30, damage: null});
  const pending = JSON.parse(JSON.stringify(exchange(fight, {playerChance: 1, enemyChance: 1})));
  assert.deepEqual(pending.pendingDamage, {winner: 'player', loser: 'enemy'});
  assert.equal(pending.enemy.hp, 20); assert.equal(pending.turn, 'player');
  assert.throws(() => exchange(pending), RangeError);
  const next = resolveDamage(pending, 7);
  assert.equal(next.enemy.hp, 13); assert.equal(next.turn, 'enemy'); assert.equal(next.exchanges, 1);
  assert.throws(() => resolveDamage(next, 7), RangeError);
  assert.equal(pending.enemy.hp, 20);
});

test('891 ground initiative and energy follow feedback and per-shot cost', () => {
  const original = hard({energy: 30, energyCost: 5, feedback: 2}, {energy: 8, energyCost: 10, feedback: 8}, {domain: 'ground'});
  assert.equal(original.turn, 'enemy');
  const next = exchange(original, {playerChance: 1, enemyChance: 12});
  assert.equal(next.enemy.energy, 0); assert.equal(next.player.energy, 30); assert.equal(next.turn, 'player');
  assert.throws(() => exchange(setTurn(next, 'enemy')), /No energy/);
  const easy = startFight(fighter({energy: 0, energyCost: 5}), fighter(), {domain: 'ground'});
  assert.doesNotThrow(() => exchange(easy, {playerChance: 1, enemyChance: 1}));
  const range = hard({range: 2, energy: 10, energyCost: 1}, {}, {domain: 'ground'});
  assert.throws(() => exchange(range, {distance: 3}), /Out of range/);
  assert.equal(range.player.energy, 10);
});

test('891 manoeuvres are exclusive and apply source attack/defence modifiers', () => {
  const next = exchange(hard(), {playerChance: 1, enemyChance: 1, playerManoeuvre: 'frontal', enemyManoeuvre: 'deflection'});
  assert.equal(next.events[0].attack, 15); assert.equal(next.events[0].defence, 13);
  const fleeing = exchange(hard({attack: 100}), {playerChance: 1, enemyChance: 1, playerManoeuvre: 'escape'});
  assert.equal(fleeing.events[0].attack, 1);
  const retreating = exchange(setTurn(hard(), 'enemy'), {playerChance: 1, enemyChance: 1, playerManoeuvre: 'withdraw'});
  assert.equal(retreating.events[0].defence, 15);
  assert.throws(() => exchange(hard(), {playerManoeuvre: 'frontal+approach'}), RangeError);
});

test('891 missing characteristics are omitted, not copied from easy tables', () => {
  assert.equal(EASY_PRESETS.length, 12); assert.equal(HARD_PRESETS.length, 29);
  assert(HARD_PRESETS.every(row => row.damage === null));
  assert.equal(HARD_PRESETS.find(row => row.id === 'mastodon').attack, null);
  assert.equal(HARD_PRESETS.find(row => row.id === 'large-transport').hp, null);
  assert.throws(() => startFight(HARD_PRESETS.find(row => row.id === 'large-transport'), fighter()), RangeError);
  const next = exchange(hard({attack: null}, {defence: null}), {playerChance: 4, enemyChance: 1});
  assert.equal(next.events[0].attack, 4); assert.equal(next.events[0].defence, 1);
});

test('891 outcomes, overrides and validation cannot silently change original fights', () => {
  const fight = hard({hp: 4}, {defence: 100});
  const next = exchange(fight, {playerChance: 1, enemyChance: 1});
  assert.equal(next.outcome, 'loss'); assert.equal(fight.player.hp, 4);
  assert.throws(() => exchange(next), RangeError);
  assert.equal(setTurn(fight, 'enemy').turn, 'enemy');
  assert.equal(amendFighter(fight, 'player', {hp: 12}).player.hp, 12);
  assert.equal(amendFighters(fight, {player: {hp: 0}, enemy: {hp: 0}}).outcome, 'loss');
  assert.equal(abandon(fight).outcome, 'abandoned');
  assert.equal(fight.outcome, null);
  for (const invalid of [0, 13, 1.5, NaN]) assert.throws(() => exchange(fight, {playerChance: invalid}), RangeError);
  assert.throws(() => startFight(fighter(), fighter(), {mode: 'fleet'}), RangeError);
});

test('891 state updates preserve run isolation and record each result once', () => {
  let run = {otherSimulator: {hp: 7}}, bookId = 891, saves = 0;
  const store = createState(() => ({currentBookId: bookId, currentPlaythrough: () => run, saveState: () => saves++}));
  assert.equal(store.read(), null);
  store.change(data => {data.fight = exchange(startFight(fighter({attack: 100, damage: 20}), fighter()), {playerChance: 1, enemyChance: 1});});
  assert.equal(run.sim891.history.length, 1); assert.equal(run.otherSimulator.hp, 7);
  store.change(() => {}); assert.equal(run.sim891.history.length, 1);
  const before = structuredClone(run);
  assert.throws(() => store.change(data => {data.history.length = 0; throw Error('abort');}));
  assert.deepEqual(run, before);
  const oldRun = run;
  assert.equal(store.change(() => {run = {};}), false); assert.deepEqual(oldRun, before);
  bookId = 857; assert.equal(store.read(), null); assert.equal(store.change(() => {}), false);
  assert.equal(saves, 2);
});
