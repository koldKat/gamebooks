import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decodeDestinyRoster} from '../../../public/js/battlesim/engines/destinyquest/winters-fury-roster.js';
import {createHeartFight} from '../../../public/js/battlesim/engines/destinyquest/heart.js';
import {startDestinyRound,rollDestinySpeed,resolveDestinySpeed,rollDestinyDamage,resolveDestinyDamage,endDestinyRound} from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {resolveDestinyAbilityRoll} from '../../../public/js/battlesim/engines/destinyquest/ability-rolls.js';
import {destinyStat,destinyStrike,addDestinyStatEffect,destinyDamageScore} from '../../../public/js/battlesim/engines/destinyquest/effects.js';
import {useDestinyAbility} from '../../../public/js/battlesim/engines/destinyquest/abilities.js';
import {useLegionAction} from '../../../public/js/battlesim/engines/destinyquest/legion.js';
const roster=decodeDestinyRoster(JSON.parse(readFileSync(new URL('../../fixtures/battlesim/heart-roster.json',import.meta.url))).enemies);
const hero={speed:30,brawn:0,magic:0,armour:20,health:40,maxHealth:40};
const rolls=(...values)=>()=>{assert.ok(values.length,'Unexpected die roll');return values.shift();};
const clone=f=>JSON.parse(JSON.stringify(f));
const fight=(section,options={})=>createHeartFight({...hero,...options.hero},section,{...options,roster});
const win=(f,...extra)=>resolveDestinySpeed(rollDestinySpeed(f,rolls(6,5,1,2)),rolls(...extra));
const score=(f,...extra)=>resolveDestinyDamage(rollDestinyDamage(f,rolls(1)),rolls(...extra));

test('each forge die outcome heals and raises Magic as printed, and the same sprite cannot visit twice',()=>{
  for(const face of [1,2,3,4,5,6]){
    let f=score(win(startDestinyRound(fight(601,{hero:{brawn:23}}),0)),face);
    assert.equal(f.opponents[0].health,20);assert.equal(f.phase,'ability-rolled');
    f=resolveDestinyAbilityRoll(clone(f),rolls(),{roster});
    assert.equal(f.opponents[0].health,face<=2?30:face<=4?25:20);
    assert.equal(destinyStat(f,0,'magic'),face<=2||face>=5?9:6);
    destinyStrike(f,0,10,'test','dice');assert.equal(f.turn.afterHealthDamageEvents?.length||0,0);
  }
});

test('four separate sprites retain independent forge flags and lethal damage never triggers recovery',()=>{
  let f=fight(601,{hero:{brawn:23}});assert.equal(f.opponents.length,4);
  for(const target of [0,1,2,3]){
    f=score(win(startDestinyRound(f,target)),3);f=resolveDestinyAbilityRoll(f,rolls(),{roster});
    assert.equal(f.encounter.healthThresholdStats.filter(r=>r.triggered).length,target+1);f=endDestinyRound(f);
  }
  f=score(win(startDestinyRound(fight(601,{hero:{brawn:200}}),0)));
  assert.equal(f.opponents[0].health,0);assert.equal(f.phase,'end');assert.equal(f.encounter.healthThresholdStats[0].triggered,undefined);
});

test('fire quencher changes starting and maximum Health to thirty; wind breaker adds two with a six cap',()=>{
  for(const [face,hp,magic,result] of [[1,25,6,3],[3,20,9,5],[6,20,9,6]]){
    let f=fight(601,{hero:{brawn:13},encounterOptions:{fireQuencher:true,windBreaker:true}});
    assert.deepEqual(f.opponents.map(o=>[o.health,o.maxHealth]),Array.from({length:4},()=>[30,30]));
    f=score(win(startDestinyRound(f,0)),face);f=resolveDestinyAbilityRoll(f,rolls(),{roster});
    assert.equal(f.opponents[0].health,hp);assert.equal(destinyStat(f,0,'magic'),magic);assert.equal(f.history.at(-1).result,result);
  }
});

test('a forge visit triggered by passive damage resumes at the next round without duplicating heat or passives',()=>{
  let f=score(win(startDestinyRound(fight(601,{abilities:{barbs:1}}),0)));f.opponents[0].health=21;
  f=endDestinyRound(f,[],rolls(3));assert.equal(f.phase,'ability-rolled');assert.equal(f.hero.health,36);
  assert.deepEqual(f.opponents.map(o=>o.health),[20,39,39,39]);
  f=resolveDestinyAbilityRoll(clone(f),rolls(),{roster});assert.equal(f.phase,'start');assert.equal(f.hero.health,36);
  assert.deepEqual(f.opponents.map(o=>o.health),[25,39,39,39]);f=startDestinyRound(f,0);assert.equal(f.round,2);
});

test('living sprites each cause heat, Fire Shield blocks it and their fire immunity leaves Barbs effective',()=>{
  for(const shield of [false,true]){
    let f=score(win(startDestinyRound(fight(601,{abilities:{barbs:1,'fire-aura':1,'searing-mantle':1,...(shield?{'fire-shield':1}:{})}}),0)));
    assert.equal(destinyStrike(f,0,6,'sear','dice'),0);f=endDestinyRound(f);
    assert.equal(f.hero.health,shield?40:36);assert.deepEqual(f.opponents.map(o=>o.health),[39,39,39,39]);
  }
});

test('all four sprites must fall before victory at section 792',()=>{
  let f=fight(601,{hero:{brawn:200}});
  for(const target of [0,1,2,3]){
    f=score(win(startDestinyRound(f,target)));
    if(target<3){assert.equal(f.status,'active');f=endDestinyRound(f);}
  }
  assert.equal(f.status,'win');assert.equal(f.encounter.outcomeSection,'792');
});

test('Zephyr uses first-printed-condition precedence for the overlapping three and still runs passives',()=>{
  for(const face of [1,2,3,4,5,6]){
    let f=win(startDestinyRound(fight(573,{abilities:{barbs:1,bleed:1,disease:1,venom:1}}),0),face);
    f=resolveDestinyAbilityRoll(f,rolls(),{roster});
    if(face<=3){assert.equal(f.phase,'end');assert.equal(f.hero.health,36);}
    else{assert.equal(f.phase,'damage');assert.equal(f.hero.health,40);f=score(f);}
    f=endDestinyRound(f);assert.equal(f.opponents[0].health,49);
    assert.equal(f.effects.some(e=>['bleed','disease','venom'].includes(e.kind)),false);
  }
  assert.match(roster.find(r=>r.section==='573').adapter.sourceClarifications[0],/overlap/);
});

test('Gheira gains Brawn at each bleeding round start, caps at twelve and immediately resets after Cauterise',()=>{
  let f=startDestinyRound(fight(633,{hero:{speed:0,armour:0,health:200,maxHealth:200},abilities:{cauterise:1}}),0);
  assert.equal(destinyStat(f,0,'brawn'),7);
  f=resolveDestinySpeed(rollDestinySpeed(f,rolls(1,2,6,5)),rolls());f=score(f);assert.equal(f.encounter.heroStatuses.bleed,1);
  f=endDestinyRound(f);f.hero.speed=30;
  for(let round=1;round<=7;round++){
    f=startDestinyRound(f,0);assert.equal(destinyStat(f,0,'brawn'),Math.min(12,7+round));
    f=endDestinyRound(score(win(f)));
  }
  f=startDestinyRound(f,0);addDestinyStatEffect(f,0,'brawn',-2,null,'other-curse');
  f=useDestinyAbility(clone(f),'cauterise');assert.equal(f.encounter.heroStatuses.bleed,undefined);
  assert.equal(f.opponents[0].brawn,7);assert.equal(destinyStat(f,0,'brawn'),5,'other debuffs remain');
});

test('Gheira does not gain Brawn without bleed or after an attack blocked by Armour',()=>{
  let f=startDestinyRound(fight(633,{hero:{speed:0}}),0);
  f=resolveDestinySpeed(rollDestinySpeed(f,rolls(1,2,6,5)),rolls());f=endDestinyRound(score(f));
  f=startDestinyRound(f,0);assert.equal(destinyStat(f,0,'brawn'),7);assert.equal(f.encounter.heroStatuses,undefined);
});

test('the mad man keeps null Brawn/Magic and uses only four dice for his damage score',()=>{
  let f=startDestinyRound(fight(638,{hero:{speed:0,armour:0}}),0);
  assert.deepEqual([f.opponents[0].brawn,f.opponents[0].magic],[null,null]);
  f=resolveDestinySpeed(rollDestinySpeed(f,rolls(1,2,6,5)),rolls());f=rollDestinyDamage(f,rolls(2,3,4,5));
  assert.equal(destinyDamageScore(f),14);f=resolveDestinyDamage(f);assert.equal(f.hero.health,26);
});

test('sun maidens preserve both printed profiles and only surviving maidens contribute searing damage',()=>{
  let f=fight(652);assert.deepEqual(f.opponents.map(o=>[o.brawn,o.armour,o.health]),[[10,8,30],[10,8,30],[8,6,25],[8,6,25]]);
  f=endDestinyRound(score(win(startDestinyRound(f,0))));assert.equal(f.hero.health,32);
  f.hero.brawn=200;f=endDestinyRound(score(win(startDestinyRound(f,1))));assert.equal(f.hero.health,26);
  for(const target of [0,2,3]){
    f=score(win(startDestinyRound(f,target)));if(target!==3)f=endDestinyRound(f);
  }
  assert.equal(f.status,'win');assert.equal(f.encounter.outcomeSection,'699');
});

test('the sun maidens allow retreat to the open doorway without marking a victory',()=>{
  let f=startDestinyRound(fight(652),0);f=useLegionAction(f,'retreat',{roster});
  assert.equal(f.status,'retreat');assert.equal(f.history.at(-1).section,'595');assert.equal(f.opponents.every(o=>o.health>0),true);
});
