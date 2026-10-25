import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {decodeDestinyRoster} from '../../../public/js/battlesim/engines/destinyquest/winters-fury-roster.js';
import {createLegionFight} from '../../../public/js/battlesim/engines/destinyquest/legion.js';
import {startDestinyRound,rollDestinySpeed,resolveDestinySpeed,rollDestinyDamage,resolveDestinyDamage,endDestinyRound,continueDestinyCombat} from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {useDestinyAbility,useDestinyBackpackItem} from '../../../public/js/battlesim/engines/destinyquest/abilities.js';
import {destinyStat,destinyArmour} from '../../../public/js/battlesim/engines/destinyquest/effects.js';
import {resolveDestinyAbilityRoll} from '../../../public/js/battlesim/engines/destinyquest/ability-rolls.js';
const roster=decodeDestinyRoster(JSON.parse(fs.readFileSync(new URL('../../../data/simulator-rosters/1286.json',import.meta.url),'utf8')).enemies);
const hero={speed:20,brawn:3,magic:0,armour:4,health:17,maxHealth:30};
const rolls=(...values)=>()=>{assert.ok(values.length,'Unexpected roll');return values.shift();};
const make=(section,options={})=>createLegionFight({...hero,...options.hero},section,{roster,...options});
const round=f=>startDestinyRound(f,0);
const win=f=>resolveDestinySpeed(rollDestinySpeed(f,rolls(6,5,1,2)));
const lose=f=>resolveDestinySpeed(rollDestinySpeed(f,rolls(1,2,6,5)));
const hit=(f,face=4)=>resolveDestinyDamage(rollDestinyDamage(f,rolls(face)));
const resume=f=>JSON.parse(JSON.stringify(f));

test('all four companions fight on the hero side without exposing player abilities or items',()=>{
  for(const [section,name] of [['687','Janna'],['703','Gull'],['712','Laine'],['721','Klaret']]){
    const character={notes:'keep',backpack:[{name:'Potion',heal:4}]};
    const f=round(make(section,{abilities:{haste:1,'kick-start':1},character}));
    assert.equal(f.hero.name,name);assert.equal(f.opponents.length,1);
    assert.throws(()=>useDestinyAbility(f,'haste'),/unavailable/);
    assert.throws(()=>useDestinyBackpackItem(f,0),/unavailable/);
    assert.deepEqual(character,{notes:'keep',backpack:[{name:'Potion',heal:4}]});
  }
});

test('Janna death pauses for takeover, preserves enemy wounds and does not consume player revival',()=>{
  let f=make('687',{abilities:{mend:1,haste:1,'kick-start':1},equipment:{mainHand:{type:'sword',id:'keep'}},character:{notes:'keep'}});
  f.hero.health=1;f.opponents[0].health=89;f=hit(lose(round(f)),6);
  assert.equal(f.status,'active');assert.equal(f.phase,'between-combats');assert.equal(f.hero.health,0);
  f=continueDestinyCombat(resume(f));assert.equal(f.hero.health,17);assert.equal(f.opponents[0].health,89);
  assert.equal(f.phase,'start');assert.equal(f.round,0);assert.equal(f.used['kick-start'],undefined);
  assert.equal(f.abilities.haste,1);assert.equal(f.equipment.mainHand.id,'keep');
  assert.equal(f.character.notes,'keep');assert.equal(f.character.companions.janna.alive,false);
  assert.throws(()=>continueDestinyCombat(f),/unavailable/);
});

test('a Medic has a separate Mend use for a companion and for the later player fight',()=>{
  let f=make('687',{abilities:{mend:1}});f.hero.health=20;
  f=useDestinyAbility(round(f),'mend');assert.equal(f.hero.health,35);
  f.hero.health=1;f=hit(lose(f),6);f=round(continueDestinyCombat(resume(f)));
  f=useDestinyAbility(f,'mend');assert.equal(f.hero.health,30);assert.equal(f.used.mend,1);
  f=round(make('703'));assert.throws(()=>useDestinyAbility(f,'mend'),/unavailable/);
});

test('Janna Thorn Armour adds five for one round and one damage die once per fight',()=>{
  let f=round(make('687'));f=useDestinyAbility(f,'thorn-armour',{},rolls(4));
  assert.equal(destinyStat(f,'hero','armour'),15);assert.equal(f.opponents[0].health,146);
  f=endDestinyRound(hit(win(f)));f=round(f);
  assert.equal(destinyStat(f,'hero','armour'),10);
  assert.throws(()=>useDestinyAbility(f,'thorn-armour'),/uses|unavailable/);
});

test('Gull and Klaret add ten to a six damage score without altering their dice',()=>{
  for(const section of ['703','721']){
    const f=hit(win(round(make(section))),6);
    assert.deepEqual(f.turn.damageDice,[6]);assert.equal(f.turn.damageScore,section==='703'?28:32);
  }
});

test('Laine retains missing Armour and heals on a damage six without exceeding eighty',()=>{
  let f=make('712');assert.equal(f.hero.armour,null);assert.equal(destinyArmour(f,'hero'),0);
  f.hero.health=75;f=hit(win(round(f)),6);assert.equal(f.hero.health,80);
  f=endDestinyRound(f);f=hit(lose(round(f)),4);assert.equal(f.hero.health,66);
});

test('companion victory restores the real hero before recovery and records companion survival',()=>{
  let f=make('703',{abilities:{haste:1},character:{notes:'keep'}});f.opponents[0].health=1;
  f=hit(win(round(f)));assert.equal(f.status,'win');assert.equal(f.hero.health,30);
  assert.equal(f.hero.speed,20);assert.equal(f.hero.brawn,3);assert.equal(f.abilities.haste,1);
  assert.equal(f.character.companions.gull.alive,true);assert.equal(f.encounter.outcomeSection,'712');
});

test('Mathis requires three accumulated sixes, or one with the Crown, across saved rounds',()=>{
  for(const crown of [false,true]){
    let f=make('700',{encounterOptions:{crownOfCommand:crown}});
    for(let success=1;success<=(crown?1:3);success++){
      f=hit(win(round(f)));f=endDestinyRound(f,[],rolls(6));
      f=resolveDestinyAbilityRoll(resume(f),rolls(),{roster});
      assert.equal(f.encounter.victorySuccesses,success);
      if(success<(crown?1:3)){assert.equal(f.status,'active');f=endDestinyRound(f,[],rolls());}
    }
    assert.equal(f.status,'win');assert.equal(f.encounter.outcomeSection,'745');
  }
});

test('the raptors use their own combined profile and ignore Armour',()=>{
  const f=hit(lose(round(make('701',{hero:{speed:0,armour:100}}))));
  assert.equal(f.hero.health,7);assert.equal(f.opponents.length,1);
});
