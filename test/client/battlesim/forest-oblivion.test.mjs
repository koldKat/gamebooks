import {loadFixtureRoster} from './roster-fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as combat from '../../../public/js/battlesim/books/812/combat.js';
import { ENCOUNTERS, FOREST_RULES } from '../../../public/js/battlesim/books/812/definition.js';
import { createState } from '../../../public/js/battlesim/books/812/state.js';
import bg from '../../../public/js/i18n/bg/battlesim/battlesim812.js';
import en from '../../../public/js/i18n/en/battlesim/battlesim812.js';
await loadFixtureRoster(812);

const enemy = section => ENCOUNTERS.find(row => row.section === section);

test('Romir metadata controls setup bounds and a saved nonlethal stopping threshold',()=>{
  const original=FOREST_RULES.knockout;
  try{
    FOREST_RULES.knockout=2;
    assert.throws(()=>combat.startFight({...combat.newCharacter(),life:2},enemy(16),16));
    assert.throws(()=>combat.startFight({...combat.newCharacter(),life:3},{...enemy(16),life:2},16,'player',false));
    const fight=combat.startFight({...combat.newCharacter(),life:3},{...enemy(16),life:4},16,'player',false);
    fight.phase='enemy';fight.turns=4;fight.rounds=2;fight.extension={keep:true};
    const saved=JSON.parse(JSON.stringify(fight)),snapshot=structuredClone(saved);
    const result=combat.turn(saved,6,1);
    assert.equal(result.outcome,'loss');assert.equal(result.character.life,2);
    assert.equal(result.enemy.life,4);assert.equal(result.turns,5);assert.equal(result.rounds,2);
    assert.deepEqual(result.extension,{keep:true});assert.deepEqual(saved,snapshot);
  }finally{FOREST_RULES.knockout=original;}
});

test('initial attack and defence come from equipment, not invented base bonuses', () => {
  const character = combat.newCharacter();
  assert.deepEqual(combat.ratings(character, enemy(33)), {attack: 1, defence: 1});
  assert.equal(character.life, 10); assert.equal(character.items, 2);
  assert.deepEqual(combat.ratings({...character, axe: false, shield: false}, enemy(33)), {attack: 0, defence: 0});
});
test('attacks alternate, ties cause no damage, and a kill prevents retaliation', () => {
  const initial = combat.startFight(combat.newCharacter(), enemy(33), 33);
  let fight = combat.turn(initial, 1, 2);
  assert.equal(fight.enemy.life, 10); assert.equal(fight.phase, 'enemy');
  fight = combat.turn(fight, 6, 1);
  assert.equal(fight.character.life, 5); assert.equal(fight.phase, 'player');
  assert.equal(initial.character.life, 10);
  fight = combat.startFight(combat.newCharacter(), {...enemy(33), life: 1}, 33);
  fight = combat.turn(fight, 6, 1);
  assert.equal(fight.outcome, 'win'); assert.equal(fight.character.life, 10);
  assert.throws(() => combat.turn(fight, 1, 6));
});
test('demon gloves and entry wound apply only to the appropriate dice fight', () => {
  const character = combat.newCharacter();
  const gloved = combat.startFight(character, enemy(5), 5);
  const ungloved = combat.startFight(character, enemy(34), 34);
  assert.equal(gloved.ratings.attack, 2); assert.equal(gloved.character.life, 10);
  assert.equal(ungloved.ratings.attack, 1); assert.equal(ungloved.character.life, 7);
  assert.equal(combat.startFight({...character, life: 3}, enemy(34), 34).outcome, 'loss');
  assert.equal(combat.startFight(character, enemy(34), 34, 'reader').character.life, 10);
});
test('silver ring gives ordinary defence and the werewolf-only attack bonus', () => {
  const character = {...combat.newCharacter(), ring: true};
  assert.deepEqual(combat.ratings(character, enemy(33)), {attack: 1, defence: 2});
  assert.deepEqual(combat.ratings(character, enemy(54)), {attack: 3, defence: 2});
});
test('Romir matches current Life, removes only axe/shield, and normal knockout is nonfatal', () => {
  const character = {...combat.newCharacter(), life: 4, helmet: true, ring: true};
  let fight = combat.startFight(character, enemy(16), 16);
  assert.equal(fight.enemy.life, 4);
  assert.deepEqual(fight.ratings, {attack: 0, defence: 2});
  fight = combat.turn(fight, 1, 6);
  fight = combat.turn(fight, 6, 1);
  assert.equal(fight.outcome, 'loss'); assert.equal(fight.character.life, 1);
  assert.equal(fight.destination, null);
  assert.equal(combat.startFight(character, {...enemy(16), life: 8}, 16, 'player', false).enemy.life, 8);
});
test('reader damage uses all item counts, cannot heal, and can be fatal even against Romir', () => {
  const character = combat.newCharacter();
  assert.equal(combat.resolveReader(combat.startFight(character, enemy(33), 33, 'reader')).character.life, 7);
  assert.equal(combat.resolveReader(combat.startFight({...character, items: 20}, enemy(54), 54, 'reader')).character.life, 10);
  const dead = combat.resolveReader(combat.startFight({...character, life: 2, items: 0}, enemy(16), 16, 'reader'));
  assert.equal(dead.character.life, 0); assert.equal(dead.outcome, 'loss');
  assert.throws(() => combat.turn(combat.startFight(character, enemy(33), 33, 'reader')));
});
test('normal lethal damage ends combat and starting never restores lost Life', () => {
  let fight = combat.startFight({...combat.newCharacter(), life: 2}, enemy(33), 33);
  assert.equal(fight.character.life, 2);
  fight = combat.turn(fight, 1, 6);
  fight = combat.turn(fight, 6, 1);
  assert.equal(fight.outcome, 'loss'); assert.equal(fight.destination, '8');
});
test('state keeps runs isolated and records each terminal result only once', () => {
  let run = {}, book = 812;
  const store = createState(() => ({currentBookId: book, currentPlaythrough: () => run, saveState() {}}));
  store.change(data => { data.character = combat.newCharacter(); });
  store.change(data => { data.fight = combat.startFight(data.character, {...enemy(33), life: 1}, 33); });
  store.change(data => { data.fight = combat.turn(data.fight, 6, 1); });
  store.change(() => {}); assert.equal(run.sim812.history.length, 1);
  assert.equal(store.change(() => { run = {}; }), false); assert.equal(store.read(), null);
  book = 810; assert.equal(store.change(() => {}), false);
});
test('Bulgarian and English dictionaries have matching keys and placeholders', () => {
  assert.deepEqual(Object.keys(bg).sort(), Object.keys(en).sort());
  for (const key of Object.keys(bg)) assert.deepEqual((bg[key].match(/\{\w+\}/g) ?? []).sort(), (en[key].match(/\{\w+\}/g) ?? []).sort(), key);
});
