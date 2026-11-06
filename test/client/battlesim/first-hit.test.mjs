import test from 'node:test';
import assert from 'node:assert/strict';
import {startFirstHitFight,firstHitAction,validateFirstHitFight} from '../../../public/js/battlesim/engines/first-hit/core.js';
import {createQuestState} from '../../../public/js/battlesim/engines/super-endless-quest/state.js';
const start=(player=8,enemy=7)=>startFirstHitFight({name:'Player',skill:player},{name:'Opponent',skill:enemy});
const attack=(fight,dice)=>firstHitAction(fight,{kind:'attack',expectedRevision:fight.revision,dice});

test('player attacks first and each exact threshold is inclusive for every two-dice result',()=>{
  for(let skill=1;skill<=13;skill++)for(let first=1;first<=6;first++)for(let second=1;second<=6;second++){
    const f=attack(start(8,skill),[first,second]);
    assert.equal(f.status,first+second>=skill?'win':'fighting');
    assert.equal(f.events[0].threshold,skill);assert.equal(f.events[0].actor,'player');
    assert.deepEqual(f.events[0].dice,[first,second]);
  }
});
test('enemy checks the current player SKILL after a miss, with equality counting as a hit',()=>{
  for(let skill=1;skill<=13;skill++)for(let first=1;first<=6;first++)for(let second=1;second<=6;second++){
    const f=attack(attack(start(skill,13),[1,1]),[first,second]);
    assert.equal(f.status,first+second>=skill?'loss':'fighting');
    assert.equal(f.events[1].threshold,skill);assert.equal(f.events[1].actor,'enemy');
    assert.equal(f.round,first+second>=skill?1:2);
  }
});
test('attacks alternate without adding the attacker SKILL or inventing HP',()=>{
  let f=start(99,7);f=attack(f,[1,1]);assert.equal(f.phase,'enemy');assert.equal(f.status,'fighting');
  f=attack(f,[6,6]);assert.equal(f.phase,'player');assert.equal(f.round,2);
  assert.equal(Object.hasOwn(f.player,'hp'),false);assert.equal(Object.hasOwn(f.opponent,'hp'),false);
});
test('a first hit is terminal and does not mutate the input or consume an enemy roll',()=>{
  const original=start(),before=structuredClone(original);let calls=0;
  const f=firstHitAction(original,{kind:'attack',expectedRevision:0},()=>{calls++;return .99;});
  assert.equal(f.status,'win');assert.equal(f.phase,'complete');assert.equal(calls,2);assert.deepEqual(original,before);
  assert.throws(()=>attack(f,[1,1]),/Stale/);
});
test('manual dice and random values must be complete and valid',()=>{
  for(const dice of [[],[1],[1,2,3],[0,2],[7,2],[1.5,2],['1',2]])assert.throws(()=>attack(start(),dice));
  for(const value of [-.1,1,NaN,Infinity])assert.throws(()=>firstHitAction(start(),{kind:'attack',expectedRevision:0},()=>value));
});
test('invalid stats, phases, revisions and logged results cannot become saved fights',()=>{
  for(const value of [0,-1,1.1,1001,NaN])assert.throws(()=>start(value));
  assert.throws(()=>startFirstHitFight({name:' ',skill:8},{name:'Opponent',skill:7}));
  const f=start();assert.throws(()=>firstHitAction(f,{kind:'attack',expectedRevision:1,dice:[6,6]}));
  assert.throws(()=>validateFirstHitFight({...f,phase:'unknown'}));
  const finished=attack(f,[6,6]);finished.events[0].total=2;assert.throws(()=>validateFirstHitFight(finished));
});
test('canceling is a distinct non-victory outcome and needs no dice',()=>{
  const f=firstHitAction(start(),{kind:'cancel',expectedRevision:0},()=>{throw Error('Unexpected dice');});
  assert.equal(f.status,'cancelled');assert.equal(f.phase,'complete');assert.equal(f.revision,1);
});
test('long encounters keep a bounded log while preserving turn and round counts',()=>{
  let f=start(13,13);for(let i=0;i<500;i++)f=attack(f,[6,6]);
  assert.equal(f.events.length,100);assert.equal(f.revision,500);assert.equal(f.round,251);assert.equal(f.phase,'player');
});
test('shared run storage records an outcome once and leaves unrelated state intact',()=>{
  const run={path:[1],inventory:[{name:'Kept'}],equipment:{weapon:'Original'},sim1608:{kept:true}};
  let saves=0,bookId=1622,current=run;
  const store=createQuestState(()=>({run:current,bookId,definition:{id:1622,stateKey:'sim1622'},saveState:()=>saves++}),{validateFight:validateFirstHitFight});
  const preserved=JSON.stringify(run);const original=store.snapshot();
  assert.equal(store.update(state=>{state.fight=start();return state;},original),true);
  const token=store.snapshot();assert.equal(store.update(state=>{state.fight=attack(state.fight,[6,6]);return state;},token),true);
  assert.equal(run.sim1622.history.length,1);assert.equal(run.sim1622.history[0].outcome,'win');
  assert.equal(store.update(state=>state,token),false);assert.equal(run.sim1622.history.length,1);
  assert.equal(store.update(state=>state),true);assert.equal(run.sim1622.history.length,1);
  assert.equal(JSON.stringify(run.sim1622).includes('"hp"'),false);
  const {sim1622,...unrelated}=run;assert.equal(JSON.stringify(unrelated),preserved);
  const live=store.snapshot();bookId=9999;assert.equal(store.update(state=>state,live),false);
  bookId=1622;current={path:[1]};assert.equal(store.update(state=>state,live),false);assert.equal(current.sim1622,undefined);
  assert.equal(saves,3);
});
