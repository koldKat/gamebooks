import test from 'node:test';
import assert from 'node:assert/strict';
import {startFight,round} from '../../../public/js/battlesim/books/3196/combat.js';
import {createState} from '../../../public/js/battlesim/books/3196/state.js';
const enemy=(hp=4,rounds=5,injury=2)=>({displayName:'Cook',hp,rounds,injury});
const roll=(fight,target,attack,...dice)=>round(fight,target,attack,()=>dice.shift());
test('the printed four-round worked example ends with5health and a defeated cook',()=>{
  let f=startFight(9,[enemy()]);
  f=roll(f,0,9,3,4);assert.equal(f.hp,7);assert.equal(f.enemies[0].hp,4);
  f=roll(f,0,7,5,5);assert.equal(f.hp,7);assert.equal(f.enemies[0].hp,3);
  f=roll(f,0,9,2,3);assert.equal(f.hp,5);
  f=roll(f,0,9,4,5);assert.equal(f.hp,5);assert.equal(f.outcome,'win');assert.equal(f.rounds,4);
});
test('the chosen threshold controls damage even with a high roll; final round can win',()=>{
  const f=roll(startFight(12,[enemy(2,1)]),0,7,6,6);
  assert.equal(f.enemies[0].hp,1);assert.equal(f.outcome,'loss');assert.equal(f.hp,12);
  assert.equal(roll(startFight(12,[enemy(3,1)]),0,9,6,6).outcome,'win');
});
test('group targets retain independent health and remaining rounds',()=>{
  let f=startFight(12,[enemy(1,3,1),enemy(1,3,1),enemy(2,4,1)]);
  f=roll(f,2,7,3,4);assert.deepEqual(f.enemies.map(e=>e.rounds),[3,3,3]);
  f=roll(f,0,7,3,4);assert.equal(f.outcome,null);
  assert.throws(()=>roll(f,0,7,3,4));
  f=roll(f,1,7,3,4);f=roll(f,2,7,3,4);assert.equal(f.outcome,'win');
});
test('soldier advantage ends on first miss; plant penalty ends on first hit',()=>{
  let f=startFight(12,[enemy(5,9)],{bonusUntilMiss:true});
  f=roll(f,0,7,3,3);assert.equal(f.enemies[0].hp,4);
  f=roll(f,0,9,3,3);assert.equal(f.advantage,false);
  f=roll(f,0,7,3,3);assert.equal(f.enemies[0].hp,4);
  let p=startFight(12,[enemy(4,9)],{penaltyUntilHit:true});
  p=roll(p,0,7,3,4);assert.equal(p.restrained,true);assert.equal(p.hp,10);
  p=roll(p,0,7,4,4);assert.equal(p.restrained,false);
  p=roll(p,0,7,3,4);assert.equal(p.enemies[0].hp,2);
});
test('unarmed health rule and specific dice exception are applied separately',()=>{
  assert.equal(roll(startFight(12,[enemy()],{},0,true),0,7,4,4).hp,11);
  const f=roll(startFight(12,[enemy()],{rollModifier:-1,unarmedRollPenalty:true},0,true),0,7,4,4);
  assert.equal(f.hp,12);assert.equal(f.events[0].total,7);
});
test('lethal injuries and expired limits are losses; transitions never mutate inputs',()=>{
  const f=startFight(1,[enemy(4,5,2)],{loss:277}),before=structuredClone(f);
  const after=roll(f,0,9,1,1);assert.deepEqual(f,before);assert.equal(after.hp,0);assert.equal(after.destination,277);
  assert.throws(()=>roll(after,0,7,6,6));assert.throws(()=>roll(f,0,8,6,6));assert.throws(()=>roll(f,0,7,0,6));
});
test('one history outcome per fight and unrelated run data remains intact',()=>{
  let run={path:[1,2],characterSheet:{hp:99}},writes=0,id=3196;
  const s=createState(()=>({bookId:id,run:()=>run,save:()=>writes++}));
  s.change(d=>{d.fight=roll(startFight(12,[enemy(1,2)]),0,7,6,6);});
  s.change(()=>{});assert.equal(s.read().history.length,1);assert.deepEqual(run.path,[1,2]);assert.equal(run.characterSheet.hp,99);
  id=595;assert.equal(s.change(()=>{throw Error('must not execute');}),false);assert.equal(writes,2);
});
