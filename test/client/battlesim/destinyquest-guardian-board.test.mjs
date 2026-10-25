import test from 'node:test';
import assert from 'node:assert/strict';
import {createWinterFight} from './destinyquest-fixtures.mjs';
import {beginDestinyPath as begin, advanceDestinyPath as move, useDestinyPathOrb as orb}
  from '../../../public/js/battlesim/engines/destinyquest/path-challenge.js';
import {startDestinyRound, endDestinyRound, rollDestinySpeed, resolveDestinySpeed,
  rollDestinyDamage, resolveDestinyDamage, skipDestinyDeathMove}
  from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {useDestinyOpening} from '../../../public/js/battlesim/engines/destinyquest/openings.js';

const rolls=(...values)=>()=>{assert.ok(values.length,'Unexpected dice');return values.shift();};
const make=(abilities={})=>createWinterFight({speed:20,brawn:200,armour:0,health:100,maxHealth:100},600,{abilities});
const save=fight=>JSON.parse(JSON.stringify(fight));
const end=fight=>endDestinyRound(fight,[],rolls());
const exit=fight=>{for(let i=0;i<11;i++){fight=move(fight);if(i<10)fight=end(fight);}return fight;};

test('guardian board preserves the ten-square source topology and thirteen sockets',()=>{
  const fight=make(),board=fight.encounter.pathChallenge;
  assert.equal(fight.phase,'encounter-setup');assert.equal(board.cells.length,10);
  assert.deepEqual(board.cells.map(c=>[c.x,c.y,c.sockets.length]),[
    [0,0,1],[1,0,2],[2,0,1],[2,1,1],[2,2,1],[1,2,1],[0,2,2],[0,3,1],[0,4,2],[1,4,1]]);
  assert.equal(board.cells.flatMap(c=>c.sockets).length,13);
  assert.deepEqual(fight.opponents.map(o=>[o.speed,o.brawn,o.armour,o.health]),Array.from({length:4},()=>[5,5,7,150]));
});

test('placements validate sockets, types and stock, with explicit additional collected orbs',()=>{
  const fight=make(),before=structuredClone(fight);
  assert.throws(()=>begin(fight,{'bad':'frost'}),/Invalid orb/);
  assert.throws(()=>begin(fight,{'0-0':'unknown'}),/Invalid orb/);
  assert.throws(()=>begin(fight,{'0-0':'lightning','1-0':'lightning'}),/stock/);
  assert.throws(()=>begin(fight,{}, {shadow:-1}),/Invalid additional/);
  const result=begin(fight,{'0-0':'lightning','1-0':'lightning'},{lightning:1});
  assert.equal(result.encounter.pathProgress.additionalOrbs.lightning,1);assert.deepEqual(fight,before);
  assert.throws(()=>begin(result,{}),/unavailable/);
});

test('the first move starts from the first arrow and cannot start ordinary combat',()=>{
  const fight=begin(make(),{}),before=structuredClone(fight),result=move(fight);
  assert.deepEqual(fight,before);assert.equal(result.round,1);assert.equal(result.phase,'end');
  assert.deepEqual(Object.values(result.encounter.pathProgress.positions),[0,0,0,0]);
  assert.equal(result.status,'active');assert.throws(()=>startDestinyRound(result,0,rolls()),/unavailable/);
  assert.throws(()=>move(result),/unavailable/);
});

test('unresolved orb choices survive reload and block moving or fighting',()=>{
  const fight=move(begin(make(),{'0-0':'frost'}));assert.equal(fight.phase,'encounter-orbs');
  assert.throws(()=>move(fight),/unavailable/);assert.throws(()=>startDestinyRound(fight,0,rolls()),/unavailable/);
  const result=orb(save(fight),'0-0',0);assert.equal(result.phase,'end');
  assert.deepEqual(result.encounter.pathProgress.usedSockets,['0-0']);
  assert.throws(()=>orb(result,'0-0',1),/unavailable/);
});

test('frost holds one guardian for exactly the next movement and cannot trigger again',()=>{
  let fight=orb(move(begin(make(),{'0-0':'frost'})),'0-0',0);
  fight=move(end(fight));assert.deepEqual(Object.values(fight.encounter.pathProgress.positions),[0,1,1,1]);
  fight=move(end(fight));assert.deepEqual(Object.values(fight.encounter.pathProgress.positions),[1,2,2,2]);
  assert.equal(fight.history.filter(e=>e.type==='path-orb').length,1);
});

test('shadow damage follows a moving guardian and ignores armour without a death move',()=>{
  let fight=orb(move(begin(make(),{'0-0':'shadow'})),'0-0',0);fight=end(fight);
  assert.equal(fight.opponents[0].health,140);assert.equal(fight.opponents[1].health,150);
  fight.opponents[0].health=10;fight=end(move(save(fight)));
  assert.equal(fight.opponents[0].health,0);assert.equal(fight.phase,'encounter-start');assert.deepEqual(fight.defeated,[0]);
});

test('a guardian cannot be shadow-cursed twice, and another target may be chosen',()=>{
  let fight=begin(make(),{'1-0':'shadow','1-1':'shadow'});fight=end(move(fight));fight=move(fight);
  fight=orb(fight,'1-1',0);const before=structuredClone(fight);
  assert.throws(()=>orb(fight,'1-0',0),/already cursed/);assert.deepEqual(fight,before);
  fight=orb(save(fight),'1-0',1);assert.deepEqual(fight.encounter.pathProgress.cursed,[0,1]);
});

for(const [count,damage] of [[1,100],[2,50],[3,30],[4,20]])test('tremor deals '+damage+' each to '+count+' occupants',()=>{
  let fight=begin(make(),{'0-0':'tremor'});
  for(let i=count;i<4;i++)fight.encounter.pathProgress.positions[i]=0;
  fight=orb(move(fight),'0-0');
  assert.deepEqual(fight.opponents.map(o=>o.health),Array.from({length:4},(_,i)=>i<count?150-damage:150));
});

test('lightning changes only the selected guardian armour and persists after reload',()=>{
  const fight=orb(move(begin(make(),{'0-0':'lightning'})),'0-0',2);
  assert.deepEqual(save(fight).opponents.map(o=>o.armour),[7,7,2,7]);
});

test('multiple sockets can resolve in either chosen order, with damage based on current occupants',()=>{
  let fight=begin(make(),{'1-0':'shadow','1-1':'tremor'});fight=end(move(fight));fight=move(fight);
  fight.opponents[0].health=20;fight=orb(fight,'1-1');assert.equal(fight.opponents[0].health,0);
  assert.throws(()=>orb(fight,'1-0',0),/guardian in this square/);
  fight=orb(fight,'1-0',1);assert.deepEqual(fight.encounter.pathProgress.cursed,[1]);
});

test('orbs with no eligible occupants are spent after another orb defeats their targets',()=>{
  let fight=begin(make(),{'1-0':'shadow','1-1':'tremor'});fight=end(move(fight));fight=move(fight);
  fight.opponents.forEach(o=>o.health=20);fight=orb(fight,'1-1');
  assert.equal(fight.status,'win');assert.deepEqual(fight.encounter.pathProgress.usedSockets,['1-1','1-0']);
  assert.equal(fight.encounter.pathProgress.achievementSection,'513');
});

test('guardians reach the final arrow after eleven moves and combat does not add another round',()=>{
  let fight=exit(begin(make(),{}));assert.equal(fight.phase,'start');assert.equal(fight.round,11);
  assert.deepEqual(Object.values(fight.encounter.pathProgress.positions),[10,10,10,10]);
  fight=startDestinyRound(save(fight),0,rolls());assert.equal(fight.round,11);assert.equal(fight.phase,'speed');
  fight.phase='end';fight=end(fight);fight=move(fight);fight=startDestinyRound(fight,0,rolls());assert.equal(fight.round,12);
});

test('staggered guardians remain on the path while an arrived guardian fights',()=>{
  let fight=orb(move(begin(make(),{'0-0':'frost'})),'0-0',0);fight=end(fight);
  for(let i=0;i<10;i++){fight=move(fight);if(i<9)fight=end(fight);}
  assert.equal(fight.encounter.pathProgress.positions[0],9);assert.equal(fight.encounter.pathProgress.positions[1],10);
  assert.throws(()=>startDestinyRound(fight,0,rolls()),/living/);
  fight=startDestinyRound(fight,1,rolls());assert.equal(fight.round,11);
  fight.phase='end';fight=end(fight);fight=move(fight);assert.equal(fight.encounter.pathProgress.positions[0],10);
});

test('shadow curses and orb-reduced health and armour persist into ordinary combat',()=>{
  let fight=orb(move(begin(make(),{'0-0':'shadow','1-0':'lightning'})),'0-0',0);fight=end(fight);
  fight=orb(move(fight),'1-0',0);fight=end(fight);
  for(let i=0;i<9;i++){fight=move(fight);if(i<8)fight=end(fight);}
  assert.equal(fight.opponents[0].health,50);assert.equal(fight.opponents[0].armour,2);
  fight=startDestinyRound(save(fight),1,rolls());fight.phase='end';fight=end(fight);assert.equal(fight.opponents[0].health,40);
});

test('opening attacks unlock at the first ordinary combat rather than during the path',()=>{
  let fight=begin(make({'first-blood':1}),{});
  assert.throws(()=>useDestinyOpening(fight,'first-blood',{target:0},rolls()),/before combat/);
  fight=exit(fight);fight=useDestinyOpening(fight,'first-blood',{target:0},rolls());
  assert.equal(fight.opponents[0].health,146);assert.equal(fight.history.at(-1).round,11);
  fight=startDestinyRound(fight,0,rolls());assert.throws(()=>useDestinyOpening(fight,'first-blood',{target:1},rolls()),/before combat/);
});

test('ordinary kills after the final arrow win without granting the early-board achievement',()=>{
  let fight=exit(begin(make(),{}));
  for(let i=0;i<4;i++){
    if(i)fight=move(fight);
    fight=startDestinyRound(fight,i,rolls());fight=resolveDestinySpeed(rollDestinySpeed(fight,rolls(6,6,1,1)));
    fight=resolveDestinyDamage(rollDestinyDamage(fight,rolls(1)),rolls());
    if(fight.phase==='death-move')fight=skipDestinyDeathMove(fight);
    if(fight.status==='active')fight=end(fight);
  }
  assert.equal(fight.status,'win');assert.equal(fight.encounter.pathProgress.achievementSection,undefined);
});
