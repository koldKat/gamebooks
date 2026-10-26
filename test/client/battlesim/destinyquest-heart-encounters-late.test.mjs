import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decodeDestinyRoster} from '../../../public/js/battlesim/engines/destinyquest/winters-fury-roster.js';
import {createHeartFight} from '../../../public/js/battlesim/engines/destinyquest/heart.js';
import {startDestinyRound,rollDestinySpeed,resolveDestinySpeed,rollDestinyDamage,resolveDestinyDamage,endDestinyRound} from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {resolveDestinyAbilityRoll} from '../../../public/js/battlesim/engines/destinyquest/ability-rolls.js';
import {useDestinyAbility} from '../../../public/js/battlesim/engines/destinyquest/abilities.js';
import {destinyStat,destinyStrike,destinyDamageScore,addDestinyStatEffect} from '../../../public/js/battlesim/engines/destinyquest/effects.js';
const roster=decodeDestinyRoster(JSON.parse(readFileSync(new URL('../../fixtures/battlesim/heart-roster.json',import.meta.url))).enemies);
const hero={speed:30,brawn:0,magic:0,armour:20,health:40,maxHealth:40};
const rolls=(...values)=>()=>{assert.ok(values.length,'Unexpected die roll');return values.shift();};
const clone=f=>JSON.parse(JSON.stringify(f));
const fight=(section,options={})=>createHeartFight({...hero,...options.hero},section,{...options,roster});
const win=(f,...extra)=>resolveDestinySpeed(rollDestinySpeed(f,rolls(6,5,2,3)),rolls(...extra));
const lose=f=>resolveDestinySpeed(rollDestinySpeed(f,rolls(2,3,6,5)),rolls());
const score=f=>resolveDestinyDamage(rollDestinyDamage(f,rolls(1)));
const resolveEnd=(f,...values)=>endDestinyRound(resolveDestinyAbilityRoll(endDestinyRound(f,[],rolls(...values)),rolls(),{roster}),[],rolls());

test('Nelson Knockdown lasts only the next round, respects Steadfast and victory preserves wounds',()=>{
  for(const abilities of [{},{steadfast:1}]){
    let f=score(lose(startDestinyRound(fight(772,{hero:{speed:0,armour:0},abilities}),0)));
    f=endDestinyRound(f);f.hero.speed=30;f=startDestinyRound(f,0);assert.equal(destinyStat(f,'hero','speed'),abilities.steadfast?30:29);
    f.hero.brawn=200;f=score(win(f));assert.equal(f.hero.health,30);assert.equal(f.encounter.outcomeSection,'447');
  }
});

test('phoenix Heat Wave uses current Magic at the start of every third round without an unprinted Fire Shield exception',()=>{
  let f=fight(784,{hero:{health:200,maxHealth:200},abilities:{'fire-shield':1}});
  for(let round=1;round<=6;round++){
    if(round===4)addDestinyStatEffect(f,0,'magic',-3,null,'test');
    f=startDestinyRound(f,0);assert.equal(f.hero.health,round<3?200:round<6?188:179);
    f=endDestinyRound(score(win(f)));assert.equal(f.opponents[0].health,100);
  }
});

test('phoenix healing caps at one hundred and its listed fire immunities retain unrelated passive damage',()=>{
  let f=score(win(startDestinyRound(fight(784,{abilities:{barbs:1,'fire-aura':1,'searing-mantle':1}}),0)));
  assert.equal(destinyStrike(f,0,6,'sear','dice'),0);f.opponents[0].health=90;f=endDestinyRound(f);
  assert.equal(f.opponents[0].health,91,'Barbs one, then healing two');
  f.hero.brawn=200;f=score(win(startDestinyRound(f,0)));assert.equal(f.status,'win');assert.equal(f.encounter.outcomeSection,'654');
});

test('the later Drecko preserves Speed loss, conditional Delirium, wounds and its own route',()=>{
  let f=startDestinyRound(fight(819,{hero:{health:17,brawn:200}}),0);assert.equal(destinyStat(f,'hero','speed'),29);
  f=score(win(f));assert.equal(f.hero.health,17);assert.equal(f.encounter.outcomeSection,'660');
  f=score(lose(startDestinyRound(fight(819,{hero:{speed:0,armour:0}}),0)));f=endDestinyRound(f);f.hero.speed=30;
  f=win(startDestinyRound(f,0),1);f=resolveDestinyAbilityRoll(f,rolls(),{roster});assert.equal(f.phase,'end');
});

test('Nyx uses three raw dice with the ten/eleven boundary and only a hit lowers next-round Speed',()=>{
  for(const [dice,damage] of [[[2,3,5],0],[[2,3,6],5]]){
    let f=score(win(startDestinyRound(fight(820),0)));f=resolveEnd(f,...dice);assert.equal(f.hero.health,40-damage);
    f=startDestinyRound(clone(f),0);assert.equal(destinyStat(f,'hero','speed'),damage?29:30);
    f=resolveEnd(score(win(f)),2,2,2);f=startDestinyRound(f,0);assert.equal(destinyStat(f,'hero','speed'),30);
  }
});

test('Nyx blocks bleed, disease and venom while leaving Barbs effective',()=>{
  let f=score(win(startDestinyRound(fight(820,{hero:{brawn:20},abilities:{bleed:1,disease:1,venom:1,barbs:1}}),0)));
  assert.equal(f.effects.some(e=>['bleed','disease','venom'].includes(e.kind)),false);
  const hp=f.opponents[0].health;f=resolveEnd(f,2,2,2);assert.equal(f.opponents[0].health,hp-1);
});

test('blood demons add one damage die and heal four automatically on a six, even if Armour absorbs the attack',()=>{
  let f=lose(startDestinyRound(fight(821,{hero:{speed:0,armour:40}}),0));f.opponents[0].health=90;
  f=rollDestinyDamage(f,rolls(6,6));assert.deepEqual(f.turn.damageDice,[6,6]);assert.equal(destinyDamageScore(f),23);
  assert.equal(f.opponents[0].health,94);f=resolveDestinyDamage(f);assert.equal(f.hero.health,40);
  f=endDestinyRound(f);f=lose(startDestinyRound(f,0));f.opponents[0].health=99;
  f=rollDestinyDamage(f,rolls(6,1));assert.equal(f.opponents[0].health,100);
});

test('blood demon rage raises Speed once at forty Health',()=>{
  let f=startDestinyRound(fight(821),0);destinyStrike(f,0,60,'test','dice');assert.equal(destinyStat(f,0,'speed'),14);
  destinyStrike(f,0,1,'test','dice');assert.equal(destinyStat(f,0,'speed'),14);
});

test('Terral devil Speed doubles force a loss and block combat/manual and automatic modifier abilities for that round',()=>{
  let f=startDestinyRound(fight(827,{hero:{health:30},abilities:{faith:1,charm:1,vanish:1}}),0);
  f=rollDestinySpeed(f,rolls(6,6,2,2));assert.equal(f.hero.health,30,'Faith cannot activate during a modifier block');
  assert.throws(()=>useDestinyAbility(f,'charm',{die:0},rolls(1)),/blocked this round/);
  f=resolveDestinySpeed(f,rolls());assert.equal(f.turn.winner,'opponent');assert.throws(()=>useDestinyAbility(f,'vanish'),/blocked this round/);
  f=endDestinyRound(score(f));f=startDestinyRound(f,0);f=rollDestinySpeed(f,rolls(6,6,2,3));assert.equal(f.hero.health,32);
});

test('Terral devil disease follows only an actual score Health hit',()=>{
  let f=score(lose(startDestinyRound(fight(827,{hero:{speed:0,armour:0}}),0)));
  assert.equal(f.encounter.heroStatuses.disease,2);const hp=f.hero.health;f=endDestinyRound(f);assert.equal(f.hero.health,hp-2);
});

test('Nephele reflects nonlethal score/dice damage even when the hit exceeds her remaining Health, but never a killing blow',()=>{
  let f=score(win(startDestinyRound(fight(832,{hero:{brawn:70}}),0)));
  assert.equal(f.opponents[0].health,30);assert.equal(f.hero.health,38);
  destinyStrike(f,0,30,'test','dice');assert.equal(f.opponents[0].health,0);assert.equal(f.hero.health,38);
  f=score(win(startDestinyRound(fight(832,{hero:{brawn:200}}),0)));assert.equal(f.status,'win');assert.equal(f.history.some(h=>h.type==='reflected-damage'),false);
});

test('Nephele’s chill starts at two and increases by one each end',()=>{
  let f=fight(832);
  for(let round=1,total=0;round<=3;round++){
    f=endDestinyRound(score(win(startDestinyRound(f,0))));total+=round+1;assert.equal(f.hero.health,40-total);
  }
});

test('Book Wyrm pulp uses the nineteen/twenty Speed challenge boundary',()=>{
  for(const [speed,damage] of [[7,5],[8,0]]){
    let f=score(win(startDestinyRound(fight(833),0)));f.hero.speed=speed;f=resolveEnd(f,6,6);assert.equal(f.hero.health,40-damage);
  }
});
