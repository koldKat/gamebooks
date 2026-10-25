import test from 'node:test';
import assert from 'node:assert/strict';
import * as combat from '../../../public/js/battlesim/books/860/combat.js';
import {ENCOUNTERS,encounterPreset,HOUSE_RULES} from '../../../public/js/battlesim/books/860/definition.js';
import {createState} from '../../../public/js/battlesim/books/860/state.js';
import bg from '../../../public/js/i18n/bg/battlesim/battlesim860.js';
import en from '../../../public/js/i18n/en/battlesim/battlesim860.js';
import { loadFixtureRoster } from './roster-fixtures.mjs';
await loadFixtureRoster(860);

test('locale keys and placeholders match', () => {
  assert.deepEqual(Object.keys(bg).sort(),Object.keys(en).sort());
  const fields = value => [...value.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();
  for (const key of Object.keys(bg)) assert.deepEqual(fields(bg[key]),fields(en[key]),key);
});
test('initial Energy is 40 plus one die', () => {
  assert.deepEqual(combat.newCharacter(1),{energy:41,initialEnergy:41});
  assert.equal(combat.newCharacter(6).energy,46);
  assert.throws(() => combat.newCharacter(0));
  assert.throws(() => combat.newCharacter(7));
});
test('all printed wound thresholds and damage dice match the visual source', () => {
  assert.deepEqual(ENCOUNTERS.map(e => [e.id,e.threshold,e.damageDice]),[
    ['12',8,1],['31',10,0],['33',6,1],['37',4,1],['46',6,2],['48',8,2],
    ['63',8,2],['72',0,1],['73',10,2],['83',12,1],['86',0,1],
  ]);
  const row = encounterPreset('12'); row.threshold = 2;
  assert.equal(encounterPreset('12').threshold,8);
});
test('threshold equality wounds and damage is rolled once without mutating input', () => {
  const character = combat.newCharacter(1), enemy = encounterPreset('12');
  const result = combat.resolveRound(character,enemy,{attackDice:[4,4],damageDice:[6]});
  assert.equal(result.wounded,true);
  assert.equal(result.character.energy,35);
  assert.equal(result.damage,6);
  assert.equal(result.outcome,'wounded');
  assert.equal(character.energy,41);
  assert.equal(enemy.threshold,8);
});
test('a safe attack consumes no damage dice and grants no invented victory', () => {
  const result = combat.resolveRound(combat.newCharacter(1),encounterPreset('12'),{attackDice:[3,4]},() => {throw Error('unneeded die');});
  assert.equal(result.character.energy,41);
  assert.deepEqual(result.damageDice,[]);
  assert.equal(result.outcome,'safe');
});
test('automatic wounds bypass attack rolls and can exhaust Energy', () => {
  for (const id of ['72','86']) {
    const result = combat.resolveRound({energy:2,initialEnergy:41},encounterPreset(id),{damageDice:[6]});
    assert.deepEqual(result.attackDice,[]);
    assert.equal(result.character.energy,0);
    assert.equal(result.outcome,'death');
    assert.throws(() => combat.resolveRound(result.character,encounterPreset(id)));
  }
});
test('Judge Death uses the printed branch without fabricated numerical damage', () => {
  for (const [dice,destination] of [[[5,5],'78'],[[4,5],'85']]) {
    const result = combat.resolveRound(combat.newCharacter(2),encounterPreset('31'),{attackDice:dice});
    assert.equal(result.destination,destination);
    assert.equal(result.character.energy,42);
    assert.equal(result.damage,0);
  }
  assert.throws(() => combat.validateEncounter({...encounterPreset('31'),threshold:8}));
});
test('custom enemies accept editable values but cannot silently become the death exception', () => {
  const custom = {displayName:'Custom',threshold:2,damageDice:2};
  assert.equal(combat.resolveRound(combat.newCharacter(1),custom,{attackDice:[1,1],damageDice:[2,3]}).damage,5);
  for (const bad of [{threshold:1},{damageDice:0},{displayName:''},{heavyWound:true}]) assert.throws(() => combat.validateEncounter({...custom,...bad}));
  assert.throws(() => combat.resolveRound(combat.newCharacter(1),custom,{attackDice:[7,1]}));
});
test('the accuracy test preserves both printed outcomes', () => {
  assert.deepEqual(combat.rollAccuracy(1),{die:1,destination:'7'});
  for (const die of [2,3,4,5,6]) assert.equal(combat.rollAccuracy(die).destination,'38');
});
test('state preserves other data, rejects stale writes and awards no fabricated fight outcomes', () => {
  const run = {notes:'keep',sim857:{history:[{outcome:'win'}]}}, other = {};
  let live = run, saves = 0;
  const store = createState(() => ({currentBookId:860,currentPlaythrough:() => live,saveState:() => saves++}));
  store.change(data => {data.character = combat.newCharacter(1);});
  store.change(data => {data.result = combat.resolveRound(data.character,encounterPreset('12'),{attackDice:[1,1]});});
  assert.deepEqual(run.sim860.history,[]);
  assert.equal(run.notes,'keep');
  assert.deepEqual(run.sim857,{history:[{outcome:'win'}]});
  const before = JSON.stringify(run);
  assert.equal(store.change(data => {data.character.energy = 1;live = other;}),false);
  assert.equal(JSON.stringify(run),before);
  assert.equal(other.sim860,undefined);
  assert.equal(saves,2);
});

test('heavy-wound eligibility comes from the loaded catalog while retaining strict validation', () => {
  const source = ENCOUNTERS.find(row => row.heavyWound), before = structuredClone(source);
  try {
    source.id = '99'; source.threshold = 9;
    const encounter = encounterPreset('99');
    assert.deepEqual(combat.validateEncounter(encounter), encounter);
    assert.throws(() => combat.validateEncounter({...encounter,id:'31'}));
    assert.throws(() => combat.validateEncounter({...encounter,threshold:10}));
    assert.throws(() => combat.validateEncounter({...encounter,damageDice:1}));
    const result = combat.resolveRound({energy:17,initialEnergy:44}, encounter, {attackDice:[4,5]});
    assert.equal(result.wounded, true); assert.equal(result.character.energy, 17);
  } finally { Object.assign(source, before); }
});

test('loaded wound and accuracy branches preserve character values and input objects', () => {
  const before = structuredClone(HOUSE_RULES);
  try {
    Object.assign(HOUSE_RULES.heavyWound, {wounded:'90',safe:'91'});
    Object.assign(HOUSE_RULES.accuracy, {specialRoll:2,special:'92',other:'93'});
    const character = {energy:17,initialEnergy:44,extension:{kept:true}}, enemy = encounterPreset('31');
    const saved = JSON.stringify({character,enemy});
    const hit = combat.resolveRound(character, enemy, {attackDice:[5,5]});
    const safe = combat.resolveRound(character, enemy, {attackDice:[4,5]});
    assert.equal(hit.destination, '90'); assert.equal(safe.destination, '91');
    assert.deepEqual(hit.character, character); assert.deepEqual(safe.character, character);
    assert.equal(JSON.stringify({character,enemy}), saved);
    assert.deepEqual(combat.rollAccuracy(2), {die:2,destination:'92'});
    assert.deepEqual(combat.rollAccuracy(1), {die:1,destination:'93'});
  } finally { Object.assign(HOUSE_RULES, before); }
});
