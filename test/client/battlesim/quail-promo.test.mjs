import {loadFixtureRoster} from './roster-fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as combat from '../../../public/js/battlesim/books/810/combat.js';
import { ENCOUNTERS, ESCAPE_RULES } from '../../../public/js/battlesim/books/810/definition.js';
import { createState } from '../../../public/js/battlesim/books/810/state.js';
import bg from '../../../public/js/i18n/bg/battlesim/battlesim810.js';
import en from '../../../public/js/i18n/en/battlesim/battlesim810.js';

await loadFixtureRoster(810);

test('escape metadata preserves a saved attempt, wounds and armour exception',()=>{
  const original=structuredClone(ESCAPE_RULES);
  try{
    Object.assign(ESCAPE_RULES,{minimum:6,failureDamage:5});
    const fight=combat.startFight({...combat.newCharacter(),life:7,armour:true},ENCOUNTERS.find(row=>row.section===8),8);
    fight.enemy.life=3;fight.extension={keep:true};
    const saved=JSON.parse(JSON.stringify(fight)),snapshot=structuredClone(saved);
    const failed=combat.escapeFight(saved,5);
    assert.equal(failed.character.life,2);assert.equal(failed.escapeAttempted,true);
    assert.equal(failed.enemy.life,3);assert.deepEqual(failed.extension,{keep:true});assert.deepEqual(saved,snapshot);
    assert.throws(()=>combat.escapeFight(failed,6));
    assert.equal(combat.escapeFight(saved,6).outcome,'escape');
  }finally{Object.assign(ESCAPE_RULES,original);}
});

test('promo defaults and roster do not inherit full-book combat rules', () => {
  assert.equal(combat.newCharacter().attack, 1);
  assert.equal(combat.newCharacter().life, 10);
  assert.deepEqual(ENCOUNTERS.map(row => [row.section,row.attack,row.life]), [[2,2,6],[3,1,3],[5,2,4],[8,1,4]]);
});
test('loser takes the attack-total difference and ties cause no damage', () => {
  const fight = combat.startFight(combat.newCharacter(), ENCOUNTERS[0], 2);
  const result = combat.round(fight, 6, 1);
  assert.equal(result.enemy.life, 2);
  assert.equal(result.character.life, 10);
  assert.equal(fight.enemy.life, 6);
  const tied = combat.round(fight, 2, 1);
  assert.equal(tied.enemy.life, 6); assert.equal(tied.character.life, 10);
});
test('leather armour caps only incoming combat loss, not outgoing damage', () => {
  const fight = combat.startFight({...combat.newCharacter(), armour: true}, ENCOUNTERS[0], 2);
  assert.equal(combat.round(fight, 1, 6).character.life, 8);
  assert.equal(combat.round(fight, 6, 1).enemy.life, 2);
});
test('axe and amulet each add one attack without changing the base', () => {
  const character = {...combat.newCharacter(), axe: true, amulet: true};
  assert.equal(combat.effectiveAttack(character), 3);
  assert.equal(character.attack, 1);
});
test('beetle escape is one pre-combat attempt; failure costs two even with armour', () => {
  const fight = combat.startFight({...combat.newCharacter(), armour: true}, ENCOUNTERS[3], 8);
  const escaped = combat.escapeFight(fight, 4);
  assert.equal(escaped.outcome, 'escape'); assert.equal(escaped.destination, '11');
  const failed = combat.escapeFight(fight, 3);
  assert.equal(failed.character.life, 8); assert.equal(failed.outcome, null);
  assert.throws(() => combat.escapeFight(failed, 6));
  assert.throws(() => combat.escapeFight(combat.round(fight, 1, 1), 6));
  assert.throws(() => combat.escapeFight(combat.startFight(combat.newCharacter(), ENCOUNTERS[0], 2), 6));
});
test('death ends a failed escape or fight and meat cannot resurrect', () => {
  const character = {...combat.newCharacter(), life: 2, meat: true};
  const fight = combat.startFight(character, ENCOUNTERS[3], 8);
  const dead = combat.escapeFight(fight, 1);
  assert.equal(dead.outcome, 'loss');
  assert.throws(() => combat.eatMeat(dead.character));
  assert.equal(combat.round(combat.startFight(character, ENCOUNTERS[0], 2), 1, 6).outcome, 'loss');
});
test('beetle meat heals up to six once without exceeding current configured maximum', () => {
  const character = {...combat.newCharacter(), life: 3, meat: true};
  const healed = combat.eatMeat(character);
  assert.equal(healed.life, 9); assert.equal(healed.meat, false);
  assert.throws(() => combat.eatMeat(healed));
  assert.equal(combat.eatMeat({...character, life: 8}).life, 10);
});
test('run state is isolated and completed outcomes are recorded once', () => {
  let run = {}, book = 810;
  const store = createState(() => ({currentBookId: book, currentPlaythrough: () => run, saveState() {}}));
  store.change(data => { data.character = combat.newCharacter(); });
  store.change(data => { data.fight = combat.startFight(data.character, {...ENCOUNTERS[0], life: 1}, 2); });
  store.change(data => { data.fight = combat.round(data.fight, 6, 1); });
  store.change(() => {});
  assert.equal(run.sim810.history.length, 1);
  assert.equal(store.change(() => { run = {}; }), false);
  assert.equal(store.read(), null);
  book = 809;
  assert.equal(store.change(() => {}), false);
});

test('promo translations match keys and substitution fields', () => {
  assert.deepEqual(Object.keys(bg).sort(), Object.keys(en).sort());
  for (const key of Object.keys(bg)) {
    assert.deepEqual((bg[key].match(/\{\w+\}/g) ?? []).sort(), (en[key].match(/\{\w+\}/g) ?? []).sort(), key);
  }
});
