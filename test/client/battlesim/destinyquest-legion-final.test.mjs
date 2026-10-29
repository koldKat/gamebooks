import { readRosterDocument } from '../../helpers/roster-db.cjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {decodeDestinyRoster} from '../../../public/js/battlesim/engines/destinyquest/winters-fury-roster.js';
import {createLegionFight,useLegionAction} from '../../../public/js/battlesim/engines/destinyquest/legion.js';
import {startDestinyRound,rollDestinySpeed,resolveDestinySpeed,rollDestinyDamage,resolveDestinyDamage,endDestinyRound,retargetDestinyRound} from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {useDestinyAbility} from '../../../public/js/battlesim/engines/destinyquest/abilities.js';
import {destinyStat} from '../../../public/js/battlesim/engines/destinyquest/effects.js';
import {resolveDestinyAbilityRoll} from '../../../public/js/battlesim/engines/destinyquest/ability-rolls.js';
const roster=decodeDestinyRoster(readRosterDocument(1286).enemies);
const hero={speed:20,brawn:3,magic:0,armour:4,health:100,maxHealth:100};
const rolls=(...values)=>()=>{assert.ok(values.length,'Unexpected roll');return values.shift();};
const make=(section,options={})=>createLegionFight({...hero,...options.hero},section,{roster,...options});
const round=(f,target=0,...faces)=>startDestinyRound(f,target,rolls(...faces));
const win=f=>resolveDestinySpeed(rollDestinySpeed(f,rolls(6,5,1,2)));
const lose=f=>resolveDestinySpeed(rollDestinySpeed(f,rolls(1,2,6,5)));
const hit=(f,face=4)=>resolveDestinyDamage(rollDestinyDamage(f,rolls(face)));
const resume=f=>JSON.parse(JSON.stringify(f));

test('bone angel permits rerolls before its per-die hazards and retains allied combat buffs',()=>{
  let f=round(make('849',{abilities:{charm:1}}));assert.equal(destinyStat(f,'hero','brawn'),5);assert.equal(destinyStat(f,'hero','magic'),2);assert.equal(destinyStat(f,'hero','armour'),6);
  f=rollDestinySpeed(f,rolls(1,1,2,3));assert.equal(f.hero.health,100);
  f=useDestinyAbility(f,'charm',{die:0},rolls(4));f=resolveDestinySpeed(f);assert.equal(f.hero.health,98);
  f=hit(f,1);assert.equal(f.hero.health,96);
});

test('Second Skin uses half rounded-up Armour against ghasts rather than restoring all Armour',()=>{
  let f=hit(lose(round(make('854',{hero:{speed:0,armour:5}}))));assert.equal(f.hero.health,87);
  f=hit(lose(round(make('854',{hero:{speed:0,armour:5},abilities:{'second-skin':1}}))));assert.equal(f.hero.health,90);
  f=endDestinyRound(f,[],rolls(3));f=resolveDestinyAbilityRoll(f,rolls(),{roster});f=endDestinyRound(f);assert.equal(f.hero.health,85);
});

test('Blindside follows explicit Armour18/6 and requires both a Speed ability and a won round',()=>{
  let f=make('861',{hero:{brawn:20},abilities:{adrenaline:1}});assert.equal(f.opponents[0].armour,16);assert.equal(destinyStat(f,0,'armour'),18);
  f=hit(win(round(f)));assert.equal(f.opponents[0].health,84);
  f=round(make('861',{hero:{brawn:20},abilities:{adrenaline:1}}));f=useDestinyAbility(f,'adrenaline');f=win(f);
  assert.equal(destinyStat(f,0,'armour'),6);f=hit(f);assert.equal(f.opponents[0].health,72);
});

test('Magic Shield spends Magic prospectively, shields one blast and loses immediately at zero',()=>{
  let f=make('877',{hero:{magic:6}});
  for(const magic of [4,2,0]){
    f=hit(win(round(f)));f=useLegionAction(f,'magic-shield',{roster});
    assert.equal(destinyStat({...f,status:'active'},'hero','magic'),magic);
    if(magic){assert.throws(()=>useLegionAction(f,'magic-shield',{roster}),/once/);f=endDestinyRound(resume(f));assert.equal(f.hero.health,100);}
  }
  assert.equal(f.status,'loss');
});

test('omitting Magic Shield retains the next blast and insufficient Magic is not spent',()=>{
  let f=make('877',{hero:{magic:3}});f=useLegionAction(hit(win(round(f))),'magic-shield',{roster});f=endDestinyRound(f);
  f=hit(win(round(f)));assert.throws(()=>useLegionAction(f,'magic-shield',{roster}),/Not enough/);
  f=endDestinyRound(f);assert.equal(f.hero.health,90);
});

test('Jorvic equips exactly five items in order, then stops growing',()=>{
  let f=make('878');const armour=[12,12,14,16,17,17];
  for(let n=0;n<6;n++){f=endDestinyRound(hit(win(round(f))));assert.equal(destinyStat(f,0,'armour'),armour[n]);assert.equal(destinyStat(f,0,'speed'),n===0?12:13);}
  f.hero.health=50;f=useLegionAction(f,'heal-me',{roster});assert.equal(f.hero.health,65);
});

test('Giblets stays hostile for ordinary heroes but a Necromancer can take permanent control',()=>{
  let f=endDestinyRound(hit(win(round(make('911')))));assert.equal(f.hero.health,97);
  f=make('911',{character:{career:'necromancer'}});f=round(f,0,6);assert.equal(f.phase,'ability-rolled');
  f=resolveDestinyAbilityRoll(resume(f),rolls(),{roster});f=endDestinyRound(hit(win(f)));
  assert.equal(f.hero.health,100);assert.equal(f.opponents[0].health,82);
  f=round(f);assert.equal(f.phase,'speed'); // No repeated control roll.
});

test('sentries retain printed missing stats while the membrane alone controls victory',()=>{
  let f=make('921',{hero:{brawn:100}});assert.equal(f.opponents[0].health,null);assert.equal(f.opponents[0].armour,null);
  assert.throws(()=>round(f),/exposed/);f=hit(win(round(f,1)));
  assert.equal(f.status,'win');assert.equal(f.encounter.outcomeSection,'877');assert.equal(f.opponents[0].health,null);
});

test('spore waves strike every third round and reset even when their previous cloud was destroyed',()=>{
  let f=make('924',{hero:{brawn:0}});
  for(let n=1;n<=6;n++){
    if(n===3)f.opponents[1].health=10;if(n===6)f.opponents[1].health=0;
    f=endDestinyRound(hit(win(round(f)),1));
    assert.equal(f.opponents[2].health,n<3?25:15);
    if(n%3===0)assert.equal(f.opponents[1].health,40);
  }
  f=round(f);assert.equal(f.status,'win');assert.equal(f.encounter.outcomeSection,'832');
});

test('an untouched spore cloud destroys the shield; early parent defeat uses the achievement route',()=>{
  let f=make('924',{hero:{brawn:0}});for(let n=0;n<3;n++)f=endDestinyRound(hit(win(round(f)),1));assert.equal(f.status,'loss');
  f=hit(win(round(make('924',{hero:{brawn:200}}))));assert.equal(f.encounter.outcomeSection,'845');
});

test('Wrecker four-die hazard uses half rounded-up Armour and only hits above Speed',()=>{
  for(const [dice,expected] of [[[2,2,3,3],100],[[6,6,5,4],88]]){
    let f=hit(win(round(make('930',{hero:{speed:10,armour:5}}))));f=endDestinyRound(f,[],rolls(...dice));
    f=resolveDestinyAbilityRoll(resume(f),rolls(),{roster});f=endDestinyRound(f);assert.equal(f.hero.health,expected);
  }
});

test('Banshee regeneration is uncapped and reaching one hundred immediately loses the battle',()=>{
  let f=make('932',{hero:{brawn:0}});
  for(const health of [84,92,100]){f=endDestinyRound(hit(win(round(f)),1));assert.equal(f.opponents[0].health,health);}
  assert.equal(f.status,'loss');f=hit(win(round(make('932',{hero:{brawn:200}}))));assert.equal(f.status,'win');
});

test('Lorcan statue deaths increase three boss stats and statues reject passive effects',()=>{
  let f=make('939',{hero:{brawn:100},abilities:{bleed:1,venom:1}});f=hit(retargetDestinyRound(win(round(f)),1));
  assert.equal(destinyStat(f,0,'speed'),16);assert.equal(destinyStat(f,0,'magic'),14);assert.equal(destinyStat(f,0,'armour'),9);
  assert.equal(f.effects.some(effect=>effect.target===1&&['bleed','venom'].includes(effect.kind)),false);
  f=endDestinyRound(f);assert.equal(f.hero.health,92);
  f.hero.brawn=200;f=hit(win(round(f)));assert.equal(f.status,'win');assert.ok(f.opponents.every(o=>o.health===0));
});

test('metal immunity, fire damage, withering hits and temporary shadow buffs remain distinct',()=>{
  let f=win(round(make('872',{abilities:{piercing:1}})));assert.throws(()=>useDestinyAbility(f,'piercing'),/immune/);
  f=endDestinyRound(hit(win(round(make('886')))));assert.equal(f.hero.health,97);
  f=hit(lose(round(make('904',{hero:{speed:0,brawn:7,magic:8}}))));assert.equal(destinyStat(f,'hero','brawn'),6);assert.equal(destinyStat(f,'hero','magic'),7);f=endDestinyRound(f);assert.equal(f.hero.health,86);
  f=make('919');assert.equal(destinyStat(f,'hero','brawn'),8);assert.equal(destinyStat(f,'hero','magic'),5);
  f.opponents[0].health=100;f=endDestinyRound(hit(win(round(f))));assert.equal(f.opponents[0].health,99);
});
