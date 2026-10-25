import test from 'node:test';
import assert from 'node:assert/strict';
import * as definition from '../../../public/js/battlesim/books/212/definition.js';
import {createState} from '../../../public/js/battlesim/books/212/state.js';
import {createCombat} from '../../../public/js/battlesim/books/212/combat.js';

function fixture(mode) {
  const run = {}, labels = {'battlesim212.mode.person': 'Individual', 'battlesim212.mode.crew': 'Crew'};
  const ctx = {...definition, currentPlaythrough: () => run, saveState() {}, _renderAll() {}, t: key => labels[key] ?? key, escapeHtml: String};
  Object.assign(ctx, createState(() => ctx), createCombat(() => ctx));
  ctx._roll2d6 = () => 2; ctx._roll1d6 = () => 6;
  const d = ctx._data();
  Object.assign(d, {rolled: true, mode, roundsPerson: 5, roundsCrew: 3, extension: {kept: true}});
  Object.assign(d.player, {skill: 10, skillInitial: 12, stamina: 17, staminaInitial: 24, luck: 7, luckInitial: 12, gold: 53});
  Object.assign(d.crew, {strike: 10, strikeInitial: 12, strength: 9, strengthInitial: 18});
  Object.assign(d.enemyPerson, {name: 'Rival', skill: 8, stamina: 2, staminaMax: 10});
  Object.assign(d.enemyCrew, {name: 'Warship', strike: 8, strength: 2, strengthMax: 8});
  return {ctx, d};
}

test('new personal and crew wins store translated mode labels and their own health pools', () => {
  for (const mode of ['person', 'crew']) {
    const {ctx, d} = fixture(mode); ctx._runRound();
    assert.equal(d.history.length, 1);
    assert.equal(d.history[0].enemy, mode === 'person' ? 'Rival (Individual)' : 'Warship (Crew)');
    assert.equal(d.history[0].statLabel, mode === 'person' ? 'STAMINA' : 'STRENGTH');
    assert.equal(d.history[0].statValue, mode === 'person' ? 17 : 9);
    assert.equal(d.history[0].statMax, mode === 'person' ? 24 : 18);
    const saved = JSON.stringify(d); ctx._runRound(); assert.equal(JSON.stringify(d), saved);
  }
});

test('recording another outcome preserves existing legacy history and unrelated player fields', () => {
  const {ctx, d} = fixture('person');
  const legacy = {enemy: 'Old rival (battlesim212.mode.person)', outcome: 'win', ts: 1, extension: true};
  d.history.push({...legacy}); ctx._runRound();
  assert.deepEqual(d.history[0], legacy); assert.equal(d.history.length, 2);
  assert.equal(d.player.gold, 53); assert.equal(d.player.luck, 7);
  assert.deepEqual(d.extension, {kept: true});
});
