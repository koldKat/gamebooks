import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decodeDestinyRoster} from '../../../public/js/battlesim/engines/destinyquest/winters-fury-roster.js';
import {createHeartFight} from '../../../public/js/battlesim/engines/destinyquest/heart.js';
import {startDestinyRound,rollDestinySpeed,resolveDestinySpeed,retargetDestinyRound,rollDestinyDamage,resolveDestinyDamage,endDestinyRound} from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {resolveDestinyAbilityRoll} from '../../../public/js/battlesim/engines/destinyquest/ability-rolls.js';
import {useDestinyAbility} from '../../../public/js/battlesim/engines/destinyquest/abilities.js';
import {destinyStat,destinyStrike,addDestinyStatEffect} from '../../../public/js/battlesim/engines/destinyquest/effects.js';
const roster=decodeDestinyRoster(JSON.parse(readFileSync(new URL('../../fixtures/battlesim/heart-roster.json',import.meta.url))).enemies);
const hero={speed:30,brawn:0,magic:0,armour:0,health:40,maxHealth:40};
const rolls=(...values)=>()=>{assert.ok(values.length,'Unexpected die roll');return values.shift();};
const clone=f=>JSON.parse(JSON.stringify(f));
const fight=(section,options={})=>createHeartFight({...hero,...options.hero},section,{...options,roster});
const win=f=>resolveDestinySpeed(rollDestinySpeed(f,rolls(6,5,1,2)),rolls());
const lose=f=>resolveDestinySpeed(rollDestinySpeed(f,rolls(1,2,6,5)),rolls());
const score=f=>resolveDestinyDamage(rollDestinyDamage(f,rolls(1)));

test('Golden guards failed interception deals four and blocks the named ability only until next round',()=>{
  let f=startDestinyRound(fight(568,{hero:{armour:20},abilities:{quicksilver:1}}),0);
  f=useDestinyAbility(f,'quicksilver',{},rolls(4));assert.equal(f.turn.pendingAbility.type,'ability-interception');
  f=resolveDestinyAbilityRoll(clone(f),rolls(),{roster});assert.equal(f.hero.health,36);
  assert.equal(f.used.quicksilver,undefined);assert.equal(f.turn.used.sp,false);
  assert.throws(()=>useDestinyAbility(f,'quicksilver',{},rolls()),/next round/);
  f=startDestinyRound(endDestinyRound(score(win(f))),0);
  f=useDestinyAbility(f,'quicksilver',{},rolls(5));f=resolveDestinyAbilityRoll(f,rolls(),{roster});
  assert.equal(destinyStat(f,'hero','speed'),32);assert.equal(f.used.quicksilver,1);
});

test('Scything blades check combat abilities, spare modifiers and can cause defeat without spending the ability',()=>{
  let f=win(startDestinyRound(fight(568,{hero:{health:4},abilities:{piercing:1,cunning:1}}),0));
  f=useDestinyAbility(f,'cunning',{},rolls());assert.equal(f.phase,'damage');
  f=useDestinyAbility(f,'piercing',{},rolls(1));f=resolveDestinyAbilityRoll(f,rolls(),{roster});
  assert.equal(f.status,'loss');assert.equal(f.used.piercing,undefined);
});

test('Golden guards Knockdown affects only the next round after an actual Health hit and Steadfast prevents it',()=>{
  for(const abilities of [{},{steadfast:1}]){
    let f=score(lose(startDestinyRound(fight(568,{hero:{speed:0},abilities}),0)));
    f=endDestinyRound(f);f=startDestinyRound(f,0);f.hero.speed=10;
    assert.equal(destinyStat(f,'hero','speed'),abilities.steadfast?10:9);
    f=endDestinyRound(score(win(f)));f=startDestinyRound(f,0);assert.equal(destinyStat(f,'hero','speed'),10);
  }
});

test('Cernos gains two Speed and two damage dice only while the separate rock fists survive',()=>{
  let f=startDestinyRound(fight(579,{hero:{speed:0}}),0);
  assert.equal(destinyStat(f,0,'speed'),12);
  f=rollDestinyDamage(lose(f),rolls(1,2));assert.equal(f.turn.damageDice.length,2);f=resolveDestinyDamage(f);
  f=endDestinyRound(f);f.hero.speed=30;f.hero.brawn=60;
  f=score(retargetDestinyRound(win(startDestinyRound(f,0)),1));assert.equal(f.opponents[1].health,0);
  assert.equal(f.status,'active');assert.equal(destinyStat(f,0,'speed'),10);
  f=endDestinyRound(f);f.hero.speed=0;f=rollDestinyDamage(lose(startDestinyRound(f,0)),rolls(1));assert.equal(f.turn.damageDice.length,1);
});

test('Piercing cannot bypass rock fist Armour by being activated against Cernos before retargeting',()=>{
  let f=win(startDestinyRound(fight(579,{hero:{brawn:5},abilities:{piercing:1}}),0));
  f=useDestinyAbility(f,'piercing');f=retargetDestinyRound(f,1);f=score(f);assert.equal(f.opponents[1].health,40);
  f=win(startDestinyRound(fight(579,{hero:{brawn:200}}),0));f=score(f);
  assert.equal(f.status,'win');assert.equal(f.encounter.outcomeSection,'698');assert.equal(f.opponents[1].health,40);
});

test('rock fists retain their printed null stats and listed immunities without shielding Cernos',()=>{
  let f=score(win(startDestinyRound(fight(579,{abilities:{barbs:1,thorns:1,bleed:1,venom:1,disease:1}}),0)));
  f=endDestinyRound(f);assert.equal(f.opponents[0].health,83);assert.equal(f.opponents[1].health,40);
  assert.deepEqual([f.opponents[1].speed,f.opponents[1].brawn,f.opponents[1].magic],[null,null,null]);
  assert.equal(destinyStrike(f,1,6,'thorn-cage','dice'),0);
});

test('Arratoch is only a post-win target, and cannot be reached by switching initiative before winning',()=>{
  let f=fight(582);assert.throws(()=>startDestinyRound(f,2),/Win against/);
  f=startDestinyRound(f,0);assert.throws(()=>retargetDestinyRound(f,2),/Win against/);
  f=win(f);assert.throws(()=>retargetDestinyRound(f,1),/initiative opponent/);
  f=retargetDestinyRound(f,2);assert.equal(f.turn.enemyAttackTarget,0);
  f=retargetDestinyRound(f,0);assert.equal(f.target,0);
});

test('Arratoch penalties stack until its death, then only those penalties are immediately removed',()=>{
  let f=fight(582,{hero:{brawn:10,magic:8}});addDestinyStatEffect(f,'hero','brawn',-1,null,'other-curse');
  for(let round=1;round<=2;round++){
    f=endDestinyRound(score(win(startDestinyRound(f,0))));
    assert.equal(destinyStat(f,'hero','brawn'),9-2*round);assert.equal(destinyStat(f,'hero','magic'),8-2*round);
  }
  f=retargetDestinyRound(win(startDestinyRound(clone(f),1)),2);
  f.opponents[2].health=3;f=score(f);assert.equal(destinyStat(f,'hero','brawn'),9);assert.equal(destinyStat(f,'hero','magic'),8);
  f=endDestinyRound(f);assert.equal(destinyStat(f,'hero','brawn'),9);
});

test('either fallen golem enrages its living brother, while defeating both automatically ends Arratoch',()=>{
  for(const first of [0,1]){
    let f=score(win(startDestinyRound(fight(582,{hero:{brawn:200}}),first)));const other=1-first;
    assert.equal(f.status,'active');assert.equal(destinyStat(f,other,'speed'),13);
    assert.equal(destinyStat(f,other,'brawn'),first===0?13:12);
    f=endDestinyRound(f);f=score(win(startDestinyRound(f,other)));
    assert.equal(f.status,'win');assert.equal(f.encounter.outcomeSection,'546');assert.equal(f.opponents[2].health,0);
  }
});

test('Nergal blocks combat abilities only in a lost round and a blocked score does not trigger Hunger Strike',()=>{
  let f=lose(startDestinyRound(fight(603,{hero:{speed:0,armour:20},abilities:{vanish:1,piercing:1}}),0));
  assert.throws(()=>useDestinyAbility(f,'vanish'),/blocked this round/);
  f=score(f);assert.equal(f.phase,'end');assert.equal(f.hero.health,40);
  f=endDestinyRound(f);f.hero.speed=30;f=win(startDestinyRound(f,0));
  f=useDestinyAbility(f,'piercing');assert.equal(f.used.piercing,1);
});

test('Nergal heals four per failed escape, increasing the success threshold and preserving pending rolls across saves',()=>{
  let f=lose(startDestinyRound(fight(603,{hero:{speed:0}}),0));f.opponents[0].health=90;
  f=resolveDestinyDamage(rollDestinyDamage(f,rolls(1)),rolls(6));assert.equal(f.turn.pendingAbility.name,'Hunger strike');
  f=resolveDestinyAbilityRoll(clone(f),rolls(2),{roster});assert.equal(f.opponents[0].health,94);assert.equal(f.turn.pendingAbility.event.attempt,2);
  f=resolveDestinyAbilityRoll(f,rolls(),{roster});assert.equal(f.phase,'end');assert.equal(f.opponents[0].health,94);
});

test('five failed Nergal escapes cap healing at starting Health and the sixth attempt is automatically free',()=>{
  let f=lose(startDestinyRound(fight(603,{hero:{speed:0}}),0));f.opponents[0].health=98;
  f=resolveDestinyDamage(rollDestinyDamage(f,rolls(1)),rolls(6));
  for(let attempt=1;attempt<=5;attempt++)f=resolveDestinyAbilityRoll(f,attempt<5?rolls(6):rolls(),{roster});
  assert.equal(f.opponents[0].health,100);assert.equal(f.phase,'end');
  assert.equal(f.history.at(-1).type,'automatic-escape');assert.equal(f.history.at(-1).attempt,6);
});

test('Skitters spawn only on one/two after a lost round, have no damage score and each survivor deals one',()=>{
  for(const face of [1,2,3,4,5,6]){
    let f=resolveDestinySpeed(rollDestinySpeed(startDestinyRound(fight(604,{hero:{speed:0},abilities:{vanish:1}}),0),rolls(1,2,6,5)),rolls(face));
    assert.equal(f.phase,'ability-rolled');assert.throws(()=>useDestinyAbility(f,'vanish'),/unavailable/);
    f=resolveDestinyAbilityRoll(clone(f),rolls(),{roster});assert.equal(f.phase,'end');
    const count=face<=2?5:4;assert.equal(f.opponents.length,count);assert.equal(f.hero.health,40);
    assert.throws(()=>rollDestinyDamage(f),/stage/);f=endDestinyRound(f);assert.equal(f.hero.health,40-count);
    for(const opponent of f.opponents)assert.deepEqual([opponent.speed,opponent.brawn,opponent.magic,opponent.armour],[9,null,null,4]);
  }
});

test('Stone Skin cannot prevent Pile On and no phantom Brawn damage is applied',()=>{
  let f=startDestinyRound(fight(604,{hero:{speed:0}}),0);
  f.combatStance={name:'stone-skin',avoidMaximum:2,allowedAbilities:['trample'],passives:[]};
  f=resolveDestinySpeed(rollDestinySpeed(f,rolls(1,2,6,5)),rolls(1));
  assert.equal(f.turn.pendingAbility.type,'encounter');assert.equal(f.turn.pendingAbility.event.kind,'spawn');
  f=resolveDestinyAbilityRoll(f,rolls(),{roster});assert.equal(f.opponents.length,5);assert.equal(f.hero.health,40);
});

test('defeating every skitter ends the fight at section 655 without remaining passive damage',()=>{
  let f=fight(604,{hero:{brawn:200}});
  for(const target of [0,1,2,3]){
    f=score(win(startDestinyRound(f,target)));
    if(target<3)f=endDestinyRound(f);
  }
  assert.equal(f.status,'win');assert.equal(f.encounter.outcomeSection,'655');assert.equal(f.hero.health,40);
});
