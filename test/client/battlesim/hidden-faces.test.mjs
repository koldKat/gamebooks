import { loadFixtureRoster } from './roster-fixtures.mjs';
await loadFixtureRoster(678);
import test from 'node:test';
import assert from 'node:assert/strict';
import { newFabledCharacter } from '../../../public/js/battlesim/engines/fabled-lands/character.js';
import { HIDDEN_DEFAULTS, HIDDEN_FIGHTS, HIDDEN_RULES, startHiddenFight, hiddenRound, cancelHiddenFight, fleeHiddenFight, hiddenSeaCheck }
  from '../../../public/js/battlesim/engines/fabled-lands/hidden-faces.js';

const rolls = (...values) => () => { assert.ok(values.length,'Unexpected roll'); return values.shift(); };
const character = overrides => ({...newFabledCharacter('warrior',HIDDEN_DEFAULTS),...overrides});
const start = (section, overrides, options={},roll) => startHiddenFight(HIDDEN_FIGHTS.find(f=>f.section===section),character(overrides),options,roll);

test('loaded champion, strangling, choking and Tripling settings control their checks', () => {
  const rules=structuredClone(HIDDEN_RULES);
  try {
    HIDDEN_RULES.champion.difficulty=100;HIDDEN_RULES.champion.divisor=4;
    const champion=start(198,{}, {},()=>1);assert.equal(champion.character.combat,2);assert.equal(cancelHiddenFight(champion).character.combat,8);
    HIDDEN_RULES.strangling.difficulty=20;HIDDEN_RULES.strangling.damage=5;
    const strangled=start(218,{combat:1},{},()=>1);assert.equal(strangled.character.stamina,0);assert(strangled.events.some(e=>e.kind==='entry'&&e.damage===5));
    HIDDEN_RULES.choking.difficulty=5;
    assert.equal(hiddenRound(start(24,{sanctity:1}),{},()=>1).character.stamina,21);
    HIDDEN_RULES.triplingAttacks=1;
    const tripled=hiddenRound(start(345,{combat:1,armour:0}),{},rolls(1,1,6,6));
    assert.equal(tripled.events.filter(e=>e.kind==='attack'&&e.direction==='enemy').length,1);
  } finally {Object.assign(HIDDEN_RULES,rules);}
});

test('loaded drain order and combat-loss settings retain their distinct restoration rules', () => {
  const rules=structuredClone(HIDDEN_RULES);
  try {
    HIDDEN_RULES.abilityDrain.abilities=['combat','charisma','magic','scouting','sanctity','thievery'];HIDDEN_RULES.abilityDrain.amount=2;
    const drained=hiddenRound(start(356),{},rolls(1,1,6,6,1));
    assert.equal(drained.character.combat,6);assert.equal(drained.defence,14);assert.equal(cancelHiddenFight(drained).character.combat,6);
    HIDDEN_RULES.combatDrain.amount=2;
    const vampire=hiddenRound(start(203),{},rolls(1,1,6,6));
    assert.equal(vampire.character.combat,6);assert.equal(cancelHiddenFight(vampire).character.combat,8);
    HIDDEN_RULES.spectre.difficulty=0;
    assert.equal(hiddenRound(start(489,{sanctity:1}),{},rolls(1,1,6,6,1,1)).character.combat,8);
  } finally {Object.assign(HIDDEN_RULES,rules);}
});

test('loaded swimming and lightning settings still apply their final-round checks', () => {
  const rules=structuredClone(HIDDEN_RULES);
  try {
    HIDDEN_RULES.underwater.entryDifficulty=0;HIDDEN_RULES.underwater.roundDifficulty=0;
    const swimmer=start(689,{scouting:4},{},()=>1);assert.equal(swimmer.status,'fighting');swimmer.enemies[0].stamina=1;
    assert.equal(hiddenRound(swimmer,{},rolls(6,6,1,1)).status,'win');
    HIDDEN_RULES.lightning.difficulty=100;HIDDEN_RULES.lightning.damageDice=2;
    const lightning=start(383,{stamina:5},{applyEntry:false});lightning.enemies[0].stamina=1;
    const result=hiddenRound(lightning,{},rolls(6,6,1,1,3,4));
    assert.equal(result.enemies[0].stamina,0);assert.equal(result.status,'loss');assert(result.events.some(e=>e.kind==='entry'&&e.damage===7));
  } finally {Object.assign(HIDDEN_RULES,rules);}
});

test('loaded sea bands and destination tables preserve inputs and reject inherited property names', () => {
  const rules=structuredClone(HIDDEN_RULES),c=character({extension:{keep:true}}),saved=JSON.stringify(c);
  try {
    HIDDEN_RULES.sea.shipwreck.penalty=8;HIDDEN_RULES.sea.shipwreck.destinations[1]=999;
    assert.equal(hiddenSeaCheck(510,c,{},rolls(6,6,3)).destination,999);
    HIDDEN_RULES.sea.boarding.threshold=0;HIDDEN_RULES.sea.boarding.win=888;
    assert.equal(hiddenSeaCheck(600,c,{},rolls(1,1)).destination,888);
    HIDDEN_RULES.sea.drift.destinations=[701,702,703];HIDDEN_RULES.sea.drift.bucketSize=3;
    assert.equal(hiddenSeaCheck(660,c,{},rolls(3)).destination,701);
    HIDDEN_RULES.sea.rescue.bounds=[0,2,4];HIDDEN_RULES.sea.rescue.destinations[1]=777;
    assert.equal(hiddenSeaCheck(716,c,{},rolls(1)).destination,777);
    for(const key of ['constructor','__proto__','toString'])assert.throws(()=>hiddenSeaCheck(key,c,{},()=>1),RangeError);
    assert.equal(JSON.stringify(c),saved);
  } finally {Object.assign(HIDDEN_RULES,rules);}
});

test('serialized drained fights resume with captured wounds and restore COMBAT only on completion', () => {
  const drained=hiddenRound(start(203),{},rolls(1,1,6,6));drained.rounds=4;drained.enemies[0].stamina=3;drained.extension={keep:['saved']};
  const saved=JSON.stringify(drained),restored=JSON.parse(saved),next=hiddenRound(restored,{},rolls(6,6));
  assert.equal(next.rounds,5);assert.equal(next.status,'win');assert.equal(next.character.combat,8);
  assert.equal(next.character.stamina,17);assert.deepEqual(next.extension,drained.extension);assert.equal(JSON.stringify(restored),saved);
});

test('book-five presets and all encounters are independent of earlier books', () => {
  const c = character();
  assert.equal(c.rank,5); assert.equal(c.stamina,23); assert.equal(c.shards,65);
  assert.deepEqual([c.charisma,c.combat,c.magic,c.sanctity,c.scouting,c.thievery],[5,8,3,6,5,3]);
  assert.equal(HIDDEN_FIGHTS.length,27);
  assert.equal(HIDDEN_FIGHTS.reduce((n,f)=>n+f.enemies.length,0),29);
  assert.equal(newFabledCharacter().rank,1);
});

test('champion curse halves COMBAT and Defence only during this fight', () => {
  const f = start(198,{}, {}, rolls(1,1));
  assert.equal(f.character.combat,4); assert.equal(f.defence,12);
  assert.equal(cancelHiddenFight(f).character.combat,8);
  assert.equal(f.character.combat,4);
  assert.equal(start(198,{magic:12},{},rolls(6,6)).character.combat,8);
});

test('vampires drain both attack and Defence, then restore COMBAT on victory', () => {
  const original = start(203);
  const f = hiddenRound(original,{},rolls(1,1,6,6));
  assert.equal(f.character.combat,7); assert.equal(f.defence,15);
  assert.equal(original.character.combat,8);
  f.enemies[0].stamina=1;
  const won = hiddenRound(f,{},rolls(6,6));
  assert.equal(won.status,'win'); assert.equal(won.character.combat,8);
  assert.equal(won.destination,412);
  assert.equal(hiddenRound(start(203,{stamina:1}),{},rolls(1,1,6,6)).destination,684);
});

test('spectre drain can be resisted and is cleared on flee or cancellation', () => {
  const original=start(489,{sanctity:1});
  const f=hiddenRound(original,{},rolls(1,1,6,6,1,1));
  assert.equal(f.character.combat,7);
  assert.equal(fleeHiddenFight(f).character.combat,8);
  assert.equal(cancelHiddenFight(f).character.combat,8);
  assert.equal(hiddenRound(start(489,{sanctity:12}),{},rolls(1,1,6,6,1,1)).character.combat,8);
});

test('tripling attacks three times unless scattered at its threshold', () => {
  const f=hiddenRound(start(345,{combat:1,armour:0}),{},rolls(1,1,6,6,6,6,1,1));
  assert.equal(f.events.filter(e=>e.kind==='attack'&&e.direction==='enemy').length,3);
  const won=hiddenRound(start(345),{},rolls(6,6));
  assert.equal(won.status,'win'); assert.equal(won.destination,307);
  assert.equal(won.events.filter(e=>e.kind==='attack').length,1);
});

test('bridge troll concedes at eight STAMINA and leaves the defeated player alive', () => {
  const won=hiddenRound(start(263,{combat:12}),{},rolls(6,6));
  assert.equal(won.status,'win'); assert.equal(won.destination,97);
  const lost=hiddenRound(start(263,{stamina:1}),{},rolls(1,1,6,6));
  assert.equal(lost.status,'loss'); assert.equal(lost.destination,66);
  assert.equal(lost.character.stamina,1);
});

test('first Hangman checks choking before attacking; second replaces wounds with ability loss', () => {
  const dead=hiddenRound(start(24,{sanctity:1,stamina:1}),{},rolls(1,1));
  assert.equal(dead.status,'loss'); assert.equal(dead.events.filter(e=>e.kind==='attack').length,0);
  const drained=hiddenRound(start(356),{},rolls(1,1,6,6,1));
  assert.equal(drained.character.stamina,23); assert.equal(drained.character.charisma,4);
  assert.equal(cancelHiddenFight(drained).character.charisma,4);
  assert.equal(hiddenRound(start(356,{charisma:1}),{},rolls(1,1,6,6,1)).destination,7);
});

test('underwater armour reduces swimming, not incoming damage; final-round drowning remains fatal', () => {
  const entryDeath=start(689,{scouting:1},{},rolls(1,1));
  assert.equal(entryDeath.destination,7);
  const f=start(689,{scouting:12},{},rolls(6,6));
  assert.equal(f.defence,13);
  f.enemies[0].stamina=1;
  f.character.scouting=1;
  const dead=hiddenRound(f,{},rolls(6,6,1,1));
  assert.equal(dead.status,'loss'); assert.equal(dead.destination,7);
});

test('strangling repeats bounded checks; lightning checks even after a winning hit', () => {
  const entry=start(218,{combat:1},{},rolls(1,1,6,6));
  assert.equal(entry.character.stamina,20);
  const f=start(383,{stamina:1},{applyEntry:false});
  f.enemies[0].stamina=1;
  const dead=hiddenRound(f,{},rolls(6,6,1,1,1));
  assert.equal(dead.status,'loss'); assert.equal(dead.destination,7);
});

test('Defence through Faith is consumed once and sequential enemies do not attack prematurely', () => {
  const f=start(80,{defenceThroughFaith:true});
  assert.equal(f.defence,19); assert.equal(f.character.defenceThroughFaith,false);
  f.enemies[0].stamina=1;
  const next=hiddenRound(f,{},rolls(6,6));
  assert.equal(next.target,1);
  assert.equal(next.events.filter(e=>e.kind==='attack').length,1);
});

test('coastal blessings prevent only a rolled storm; passage blessings reroll once', () => {
  const c=character({stormsBlessing:true});
  const pirates=hiddenSeaCheck(60,c,{safetyFromStorms:true},rolls(1,1));
  assert.equal(pirates.destination,600); assert.equal(pirates.usedBlessing,false);
  assert.equal(pirates.character.stormsBlessing,true);
  const safe=hiddenSeaCheck(60,c,{safetyFromStorms:true},rolls(6,6));
  assert.equal(safe.destination,133); assert.equal(safe.character.stormsBlessing,false);
  const rerolled=hiddenSeaCheck(232,c,{safetyFromStorms:true},rolls(6,6,1,1));
  assert.equal(rerolled.destination,321); assert.equal(rerolled.usedBlessing,true);
  assert.equal(hiddenSeaCheck(716,c,{safetyFromStorms:true},rolls(6,6)).destination,510);
  assert.equal(c.stormsBlessing,true);
});

test('shipwreck subtraction, storm modifiers and strict boarding threshold match the source', () => {
  const c=character();
  assert.equal(hiddenSeaCheck(510,c,{},rolls(3,4,6)).destination,569);
  assert.equal(hiddenSeaCheck(510,c,{},rolls(4,4)).destination,7);
  assert.equal(hiddenSeaCheck(527,c,{ship:'galleon',crew:'excellent'},rolls(1,2)).destination,660);
  assert.equal(hiddenSeaCheck(527,c,{ship:'barque',crew:'poor'},rolls(3,3)).destination,510);
  assert.equal(hiddenSeaCheck(600,c,{ship:'brigantine'},rolls(2,3)).destination,540);
  assert.equal(hiddenSeaCheck(600,c,{ship:'galleon'},rolls(2,3)).destination,460);
});
