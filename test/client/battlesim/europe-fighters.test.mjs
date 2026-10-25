import test from 'node:test';
import assert from 'node:assert/strict';
import {loadFixtureRoster} from './roster-fixtures.mjs';
import {ROSTER} from '../../../public/js/battlesim/books/760/definition.js';
import {createState} from '../../../public/js/battlesim/books/760/state.js';
import {createCombat} from '../../../public/js/battlesim/books/760/combat.js';

await loadFixtureRoster(760);

test('new run defaults follow loaded fighters without adding fields to the original state shape', () => {
  const profiles = ROSTER.map(profile => ({...profile, attack: profile.attack + 10, life: profile.life + 1}));
  const run = {};
  const store = createState(() => ({currentPlaythrough: () => run, _fighter: id => profiles.find(profile => profile.id === id)}));
  const state = store._data();
  assert.deepEqual(state.player, {attack: 13, defense: 3, interactive: 3, life: 21});
  assert.deepEqual(state.enemy, {attack: 16, defense: 6, interactive: 6, life: 41});
  state.enemy.life = 2;
  assert.equal(profiles.find(profile => profile.id === '666').life, 41);
});

test('existing fights retain modified stats, current health, turn, log and history', () => {
  const saved = {playerId: 'stacy', enemyId: '666', player: {attack: 9, defense: 2, interactive: 4, life: 2},
    enemy: {attack: 6, defense: 6, interactive: 6, life: 4}, turn: 'enemy', started: true,
    log: ['Existing battle'], history: [{outcome: 'win', ts: 1}]};
  const before = structuredClone(saved), run = {sim760: saved, sim757: {preserved: true}};
  const store = createState(() => ({currentPlaythrough: () => run, _fighter: () => {throw Error('Existing stats must survive');}}));
  assert.equal(store._data(), saved);
  assert.deepEqual(saved, before);
  assert.deepEqual(run.sim757, {preserved: true});
});

test('manual fighter stats resolve once and reset restores loaded profiles while retaining history', () => {
  const run = {};
  let context;
  const store = createState(() => context), combat = createCombat(() => context);
  context = {ROSTER, currentPlaythrough: () => run, ...store, ...combat, _roll1d6: () => 1,
    t: key => key, saveState() {}, _renderAll() {}, SVG_SKULL: '', SVG_TROPHY: ''};
  const before = structuredClone(ROSTER), state = store._data();
  state.player = {attack: 100, defense: 100, interactive: 100, life: 7};
  state.enemy = {attack: 6, defense: 6, interactive: 1, life: 1};
  combat._runRound();
  assert.equal(state.enemy.life, 0);
  assert.equal(state.player.life, 7);
  assert.equal(state.history.length, 1);
  const completed = structuredClone(state);
  combat._runRound();
  assert.deepEqual(state, completed);
  combat._resetBattle();
  assert.equal(state.player.life, 20);
  assert.equal(state.enemy.life, 40);
  assert.equal(state.started, false);
  assert.equal(state.history.length, 1);
  assert.deepEqual(ROSTER, before);
});
