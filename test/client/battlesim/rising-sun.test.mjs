import test from 'node:test';
import assert from 'node:assert/strict';
import { newFabledCharacter } from '../../../public/js/battlesim/engines/fabled-lands/character.js';
import { RISING_DEFAULTS, RISING_FIGHTS, startRisingFight, risingRound, fleeRisingFight, risingSeaCheck }
  from '../../../public/js/battlesim/engines/fabled-lands/rising-sun.js';

const rolls = (...values) => () => { assert.ok(values.length,'Unexpected roll'); return values.shift(); };
const character = overrides => ({...newFabledCharacter('warrior',RISING_DEFAULTS),...overrides});
const start = (section, overrides, options={}, roll) => startRisingFight(RISING_FIGHTS.find(f=>f.section===section),character(overrides),options,roll);

test('book-six defaults and roster leave other books unchanged', () => {
  const c = character();
  assert.deepEqual([c.rank,c.stamina,c.shards,c.armour],[6,27,0,0]);
  assert.deepEqual([c.charisma,c.combat,c.magic,c.sanctity,c.scouting,c.thievery],[5,8,3,6,5,3]);
  assert.equal(RISING_FIGHTS.length,29);
  assert.equal(RISING_FIGHTS.reduce((n,f)=>n+f.enemies.length,0),42);
  assert.equal(newFabledCharacter().rank,1);
});

test('simultaneous enemies all counter while the player chooses one living target', () => {
  const original = start(192,{combat:1,armour:0,stamina:100,staminaInitial:100});
  const f = risingRound(original,{target:2},rolls(1,1,6,6,6,6,6,6));
  assert.equal(f.target,2);
  assert.equal(f.events.filter(e=>e.direction==='enemy').length,3);
  assert.deepEqual(f.events.filter(e=>e.direction==='enemy').map(e=>e.enemy),['First Spider','Second Spider','Third Spider']);
  assert.equal(original.rounds,0);
  f.enemies[2].stamina=1;
  f.character.combat=12;
  const killed = risingRound(f,{target:2},rolls(6,6,1,1,1,1));
  assert.equal(killed.enemies[2].stamina,0);
  assert.equal(killed.events.slice(f.events.length).filter(e=>e.direction==='enemy').length,2);
  assert.throws(()=>risingRound(killed,{target:2}),RangeError);
});

test('sequential vampires neither drain COMBAT nor allow a later enemy to attack early', () => {
  const f = start(116,{combat:12});
  f.enemies[0].stamina=1;
  const next = risingRound(f,{},rolls(6,6));
  assert.equal(next.target,1);
  assert.equal(next.character.combat,12);
  assert.equal(next.events.filter(e=>e.direction==='enemy').length,0);
  assert.throws(()=>risingRound(next,{target:3}),RangeError);
});

test('Thunder Beast reduces actual damage for carried cash, not Defence', () => {
  const f = start(183,{shards:9000});
  const next = risingRound(f,{},rolls(1,1,1,1));
  assert.equal(next.character.stamina,27);
  assert.equal(next.defence,14);
  assert.equal(next.events.at(-1).damage,0);
});

test('giant combat wounds are permanent, but door and thrown-chair damage are recoverable', () => {
  const f = start(623,{combat:1},{},rolls(4));
  assert.deepEqual([f.character.stamina,f.character.staminaInitial],[23,27]);
  const next = risingRound(f,{},rolls(1,1,1,1));
  assert.deepEqual([next.character.stamina,next.character.staminaInitial],[13,17]);
  const escaped = fleeRisingFight(start(712),rolls(2,3));
  assert.deepEqual([escaped.character.stamina,escaped.character.staminaInitial,escaped.destination],[22,27,642]);
});

test('printed special Defence, darkness, subduing and exchanged weapons are independent', () => {
  assert.equal(start(473).defence,6);
  assert.equal(start(718).defence,9);
  assert.equal(start(273,{armour:5}).defence,14);
  assert.equal(start(624).attackModifier,-2);
  assert.equal(start(624,{}, {light:true}).attackModifier,0);
  const subdued = start(490,{combat:10},{subdue:true,weaponBonus:2});
  assert.equal(subdued.attackModifier,-3);
  assert.equal(subdued.defence,14);
  assert.equal(subdued.config.win,463);
  const maid = start(656,{}, {exchangedWeaponBonus:3});
  assert.deepEqual([maid.enemies[0].combat,maid.enemies[0].defence],[11,19]);
  assert.equal(start(656).enemies[0].combat,8);
});

test('Haniwa player attacks and their rerolls use one die; enemy attacks use two', () => {
  const f = start(563,{combatBlessing:true});
  const next = risingRound(f,{combatBlessing:true},rolls(1,6,1,1));
  assert.equal(next.events.find(e=>e.direction==='player'&&e.kind==='attack').dice,6);
  assert.equal(next.events.find(e=>e.direction==='enemy'&&e.kind==='attack').dice,2);
  assert.equal(next.character.combatBlessing,false);
});

test('Spider poison consumes protection only when wounded, and escaping is fatal', () => {
  const unwounded = start(481,{combat:12,diseaseBlessing:true});
  unwounded.enemies[0].stamina=1;
  const won = risingRound(unwounded,{},rolls(6,6));
  assert.equal(won.status,'win');
  assert.equal(won.character.diseaseBlessing,true);
  const bitten = start(481,{combat:12,diseaseBlessing:true});
  bitten.enemies[0].stamina=1; bitten.wounded=true;
  assert.equal(risingRound(bitten,{},rolls(6,6)).character.diseaseBlessing,false);
  const fatal = structuredClone(bitten); fatal.character.diseaseBlessing=false;
  assert.equal(risingRound(fatal,{},rolls(6,6)).status,'loss');
  assert.equal(fleeRisingFight(start(481)).destination,140);
});

test('arrow and Divine Wrath damage are optional and a used blessing cannot be reused', () => {
  const f = start(481,{divineWrath:true},{crimsonArrow:true,divineWrath:true},rolls(1,2,3,4));
  assert.equal(f.enemies[0].stamina,23);
  assert.equal(f.character.divineWrath,false);
  assert.throws(()=>start(55,{}, {divineWrath:true}),RangeError);
  assert.equal(start(481,{}, {crimsonArrow:true,applyEntry:false}).enemies[0].stamina,33);
});

test('Morituri escape gives a free strike and carries enemy wounds into outdoor combat', () => {
  const original = start(742,{combat:12});
  original.enemies[0].stamina=20;
  const fled = fleeRisingFight(original,rolls(1,1));
  assert.equal(fled.character.morituriDamage,18);
  assert.equal(fled.destination,460);
  const outside = startRisingFight(RISING_FIGHTS.find(f=>f.section===460),fled.character);
  assert.equal(outside.enemies[0].stamina,20);
  assert.deepEqual([outside.enemies[0].combat,outside.enemies[0].defence],[10,20]);
  assert.equal(original.character.morituriDamage,undefined);
});

test('meditation restores full STAMINA after either outcome', () => {
  const f = start(411,{combat:1,stamina:1});
  const lost = risingRound(f,{},rolls(1,1,6,6));
  assert.equal(lost.status,'loss'); assert.equal(lost.destination,479);
  assert.equal(lost.character.stamina,27);
  const winner = start(411,{combat:12,stamina:2}); winner.enemies[0].stamina=1;
  assert.equal(risingRound(winner,{},rolls(6,6)).character.stamina,27);
});

test('sea rules use the printed ship dice and protect permanent storm blessings', () => {
  const c = character({permanentStorms:true});
  const safe = risingSeaCheck(222,c,{safetyFromStorms:true});
  assert.equal(safe.character.permanentStorms,true); assert.equal(safe.destination,580);
  assert.equal(risingSeaCheck(222,character(),{ship:'barque'},rolls(3)).destination,126);
  assert.equal(risingSeaCheck(222,character(),{ship:'barque',crew:'good'},rolls(3)).destination,6);
  const plague = risingSeaCheck(27,character(),{},rolls(2));
  assert.deepEqual([plague.character.stamina,plague.character.staminaInitial],[25,25]);
  const immune = risingSeaCheck(27,character({diseaseBlessing:true}),{},rolls(2));
  assert.equal(immune.character.staminaInitial,27); assert.equal(immune.character.diseaseBlessing,false);
  assert.equal(risingSeaCheck(52,character({scouting:1}),{},rolls(1,1)).character.stamina,0);
});
