import test from 'node:test';
import assert from 'node:assert/strict';
import * as combat from '../../../public/js/battlesim/books/807/combat.js';
import { createState } from '../../../public/js/battlesim/books/807/state.js';
import { loadFixtureRoster } from './roster-fixtures.mjs';
import { OUTCOME_RULES } from '../../../public/js/battlesim/books/807/definition.js';
await loadFixtureRoster(807);

const roll = (...values) => () => { assert.ok(values.length); return values.shift(); };
const start = (determination = 1, pills = false) => combat.startFight({ determination, pills }, 'Двойник');

test('metadata controls outcome routes and pill loss while preserving a saved decision',()=>{
  const original=structuredClone(OUTCOME_RULES);
  try{
    Object.assign(OUTCOME_RULES,{win:911,loss:930,escape:974,pillsLostAt:930});
    const fight=combat.rollPlayer(start(5,true),roll(2,3));fight.rounds=4;fight.rerolls=2;fight.extension={keep:true};
    const saved=JSON.parse(JSON.stringify(fight)),snapshot=structuredClone(saved);
    const result=combat.rollEnemy(saved,roll(6,6));
    assert.equal(result.destination,930);assert.equal(result.character.pills,false);
    assert.equal(result.rounds,4);assert.equal(result.rerolls,2);assert.equal(result.character.determination,5);
    assert.deepEqual(result.extension,{keep:true});assert.deepEqual(saved,snapshot);
    assert.equal(combat.rollEnemy(saved,roll(1,2)).destination,911);
    assert.equal(combat.rollPlayer(start(5,true),roll(2,2)).destination,974);
    OUTCOME_RULES.pillsLostAt=-1;
    assert.equal(combat.rollEnemy(saved,roll(6,6)).character.pills,true);
  }finally{Object.assign(OUTCOME_RULES,original);}
});

test('initial passport and safe signed Determination have no invented health stats', () => {
  assert.deepEqual(combat.newCharacter(), { determination: 1, pills: false });
  assert.equal(start(-20000).character.determination, -20000);
  for (const value of [NaN, Infinity, 1.5, '1']) assert.throws(() => start(value));
  assert.throws(() => start(1, 1));
});

test('player doubles escape immediately, with the global pill exception', () => {
  for (const pills of [false, true]) {
    const initial = start(-2, pills), result = combat.rollPlayer(initial, roll(2, 2));
    assert.equal(result.outcome, 'escape'); assert.equal(result.destination, 74);
    assert.equal(result.character.determination, pills ? -2 : -3);
    assert.equal(result.character.pills, pills); assert.equal(result.enemyDice, null);
    assert.equal(initial.character.determination, -2);
  }
});

test('rerolls spend one point before replacing the roll and cannot refund a worse result', () => {
  const first = combat.rollPlayer(start(2, true), roll(5, 6));
  const rerolled = combat.rollPlayer(first, roll(1, 2), true);
  assert.equal(rerolled.character.determination, 1); assert.equal(rerolled.playerTotal, 3);
  assert.equal(first.playerTotal, 11); assert.equal(first.character.determination, 2);
  const double = combat.rollPlayer(rerolled, roll(3, 3), true);
  assert.equal(double.character.determination, 0); assert.equal(double.outcome, 'escape');
  assert.throws(() => combat.rollPlayer(combat.rollPlayer(start(0), roll(1, 2)), roll(2, 3), true));
});

test('negative Determination penalizes the score; opponent doubles have no special power', () => {
  const first = combat.rollPlayer(start(-3), roll(5, 6));
  assert.equal(first.playerTotal, 8);
  const result = combat.rollEnemy(first, roll(3, 3));
  assert.equal(result.outcome, 'win'); assert.equal(result.destination, 11);
  assert.equal(result.character.determination, -3);
});

test('loss leads to30 and clears lost equipment, without an invented extra Determination penalty', () => {
  const first = combat.rollPlayer(start(2, true), roll(1, 2));
  const result = combat.rollEnemy(first, roll(5, 6));
  assert.equal(result.outcome, 'loss'); assert.equal(result.destination, 30);
  assert.equal(result.character.pills, false); assert.equal(result.character.determination, 2);
  assert.throws(() => combat.rollEnemy(result, roll(1, 2)));
});

test('ties repeat without an arbitrary turn limit; phases reject stale actions', () => {
  let fight = start(0);
  assert.throws(() => combat.rollEnemy(fight, roll(1, 2)));
  for (let i = 0; i < 30; i++) {
    fight = combat.rollPlayer(fight, roll(1, 2));
    assert.throws(() => combat.rollPlayer(fight, roll(1, 2)));
    fight = combat.rollEnemy(fight, roll(1, 2));
    assert.equal(fight.outcome, null); assert.equal(fight.phase, 'player');
  }
  assert.equal(fight.rounds, 30); assert.equal(fight.character.determination, 0);
  const result = combat.cancelFight(fight);
  assert.equal(result.outcome, 'cancelled'); assert.equal(result.character.determination, 0);
});

test('state preserves separate runs, records each outcome once, and rejects stale writes', () => {
  let run = {}, book = 807, saves = 0;
  const state = createState(() => ({ currentBookId: book, currentPlaythrough: () => run, saveState: () => saves++ }));
  state.change(data => { data.fight = combat.rollPlayer(start(), roll(2, 2)); });
  state.change(() => {});
  assert.equal(run.sim807.history.length, 1); assert.equal(run.sim807.history[0].outcome, 'escape');
  assert.equal(saves, 2);
  const old = run;
  assert.equal(state.change(() => { run = {}; }), false);
  assert.equal(state.read(), null); assert.equal(old.sim807.history.length, 1);
  book = 1;
  assert.equal(state.read(), null); assert.equal(state.change(() => {}), false);
});
