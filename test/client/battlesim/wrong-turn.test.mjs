import {loadFixtureRoster} from './roster-fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as combat from '../../../public/js/battlesim/books/797/combat.js';
import { createState } from '../../../public/js/battlesim/books/797/state.js';
import { MISSION_RULES } from '../../../public/js/battlesim/books/797/definition.js';

await loadFixtureRoster(797);

const roll = (...values) => () => { assert.ok(values.length); return values.shift(); };
const character = () => combat.medicalStation(combat.newCharacter(() => 6));
const start = (options = {}, section = 27) => combat.startFight(section, character(), options);

test('mission metadata controls entry and saved-round timeouts without losing pending doubles or wounds',()=>{
  const original=structuredClone(MISSION_RULES);
  try{
    Object.assign(MISSION_RULES,{timeoutSeconds:200,timeoutDestination:999,roundSeconds:7});
    const c=character();c.elapsed=80;
    assert.equal(combat.startFight(27,c).destination,999);
    const fight=start();fight.character.elapsed=193;fight.rounds=4;fight.enemies[0].stamina=7;fight.extension={keep:true};
    const saved=JSON.parse(JSON.stringify(fight)),snapshot=structuredClone(saved);
    const result=combat.round(saved,roll(1,1,2,2));
    assert.equal(result.outcome,'timeout');assert.equal(result.destination,999);
    assert.equal(result.character.elapsed,200);assert.equal(result.rounds,5);
    assert.equal(result.enemies[0].stamina,7);assert.deepEqual(result.extension,{keep:true});assert.deepEqual(saved,snapshot);
    const pending={...snapshot,pendingDoubles:true};
    const resolved=combat.resolveDoubles(pending,'player');
    assert.equal(resolved.character.elapsed,193);assert.equal(resolved.rounds,4);assert.equal(resolved.destination,11);
    assert.equal(pending.pendingDoubles,true);
  }finally{Object.assign(MISSION_RULES,original);}
});

test('initial maxima, hangover, medical restoration and standalone Luck follow the source', () => {
  const c = combat.newCharacter(() => 1);
  assert.deepEqual([c.skillInitial, c.staminaInitial, c.luckInitial], [7, 14, 7]);
  assert.deepEqual([c.skill, c.stamina, c.luck, c.elapsed], [6, 11, 7, 0]);
  assert.deepEqual([combat.medicalStation(c).skill, combat.medicalStation(c).stamina], [7, 14]);
  assert.equal(combat.testLuck(c, roll(3, 4)).lucky, true);
  assert.equal(combat.testLuck(c, roll(4, 4)).lucky, false);
  assert.equal(combat.testLuck(c, roll(3, 4)).character.luck, 6);
  assert.equal(c.luck, 7);
});

test('both pirate entries preserve stats, time costs and nonfatal stun outcomes', () => {
  for (const section of [27, 60]) {
    const f = start({}, section);
    assert.deepEqual([f.enemies[0].skill, f.enemies[0].stamina], [9, 12]);
    assert.equal(f.character.elapsed, section === 27 ? 120 : 90);
    const won = combat.round(f, roll(1, 1, 5, 6));
    assert.equal(won.outcome, 'win'); assert.equal(won.destination, 11);
    const lost = combat.round(f, roll(5, 6, 1, 1));
    assert.equal(lost.outcome, 'loss'); assert.equal(lost.destination, 36);
    assert.equal(lost.character.dead, false);
    assert.equal(lost.character.elapsed, f.character.elapsed + 10);
    assert.equal(f.rounds, 0);
  }
});

test('simultaneous doubles require explicit resolution rather than invented priority', () => {
  const f = combat.round(start(), roll(2, 2, 3, 3));
  assert.equal(f.pendingDoubles, true); assert.equal(f.outcome, null);
  assert.throws(() => combat.round(f, () => 1));
  assert.equal(combat.resolveDoubles(f, 'player').destination, 11);
  assert.equal(combat.resolveDoubles(f, 'enemy').destination, 36);
  assert.equal(f.pendingDoubles, true);
});

test('ordinary ties, cleaver damage, magic sword damage/skill and surrender at 2', () => {
  const tied = start(); tied.character.skill = 9;
  const result = combat.round(tied, roll(2, 3, 1, 4));
  assert.equal(result.enemies[0].stamina, 12); assert.equal(result.character.stamina, 24);
  assert.equal(combat.round(start({weapon: 'cleaver'}), roll(5, 6, 1, 2)).enemies[0].stamina, 9);
  const sword = combat.round(start({weapon: 'sword'}), roll(5, 6, 1, 2));
  assert.equal(sword.enemies[0].stamina, 6); assert.equal(sword.events[0].playerAttack, 25);
  const threshold = start(); threshold.enemies[0].stamina = 4;
  assert.equal(combat.round(threshold, roll(5, 6, 1, 2)).destination, 11);
  const lost = start(); lost.character.stamina = 4; lost.character.skill = 1;
  const end = combat.round(lost, roll(1, 2, 5, 6));
  assert.equal(end.destination, 36); assert.equal(end.character.stamina, 2); assert.equal(end.character.dead, false);
});

test('timeout takes priority at 3600, while custom opponents remain editable', () => {
  const c = character(); c.elapsed = 3480;
  assert.equal(combat.startFight(27, c).destination, 33);
  const f = start(); f.character.elapsed = 3590;
  assert.equal(combat.round(f, roll(1, 1, 2, 3)).outcome, 'timeout');
  const custom = combat.startFight(0, character(), {opponents: [{displayName: 'Тест', skill: 3, stamina: 5}]});
  assert.equal(custom.config.stun, false); assert.equal(custom.config.threshold, 0);
  assert.equal(custom.enemies[0].displayName, 'Тест');
  assert.throws(() => combat.startFight(27, character(), {weapon: 'invalid'}));
});

test('state isolates runs and books and records a finished fight only once', () => {
  let run = {}, book = 797, saves = 0;
  const state = createState(() => ({currentBookId: book, currentPlaythrough: () => run, saveState: () => saves++}));
  state.change(data => { data.encounterName = 'Пират'; data.fight = combat.round(start(), roll(1, 1, 2, 3)); });
  state.change(() => {});
  assert.equal(run.sim797.history.length, 1); assert.equal(saves, 2);
  const old = run; run = {};
  assert.equal(state.read(), null);
  assert.equal(state.change(() => { run = {}; }), false);
  book = 1; assert.equal(state.change(() => {}), false); assert.equal(state.read(), null);
  assert.equal(old.sim797.history.length, 1);
});
