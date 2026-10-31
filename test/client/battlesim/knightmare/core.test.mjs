import test from 'node:test';
import assert from 'node:assert/strict';
import {LIFE_FORCE,startKnightmareFight,knightmareRound,validateKnightmareFight,cancelKnightmareFight} from '../../../../public/js/battlesim/engines/knightmare/core.js';
import {createKnightmareState,emptyKnightmareState,rememberKnightmareFight} from '../../../../public/js/battlesim/engines/knightmare/state.js';

const rules = {dieSides:6,playerHitMax:2};
const start = (player='GREEN',enemy='GREEN',luckCharges=0) => startKnightmareFight(
  {lifeForce:player},{displayName:'Custom opponent',lifeForce:enemy},rules,{luckCharges});
const roll = (fight,die) => knightmareRound(fight,{expectedRound:fight.round,die});

test('all faces wound exactly one side from every live grade pairing',()=>{
  for(const player of LIFE_FORCE.slice(0,3)) for(const enemy of LIFE_FORCE.slice(0,3)) for(let die=1;die<=6;die++) {
    const original=start(player,enemy),copy=structuredClone(original),fight=roll(original,die);
    assert.deepEqual(original,copy);assert.equal(fight.round,1);
    assert.equal(fight.player.lifeForce,die<=2?player:LIFE_FORCE[LIFE_FORCE.indexOf(player)+1]);
    assert.equal(fight.opponent.lifeForce,die<=2?LIFE_FORCE[LIFE_FORCE.indexOf(enemy)+1]:enemy);
    assert.equal(fight.status,fight.player.lifeForce==='DEAD'?'loss':fight.opponent.lifeForce==='DEAD'?'win':'fighting');
    assert.doesNotThrow(()=>validateKnightmareFight(JSON.parse(JSON.stringify(fight))));
  }
});

test('all complete GREEN duels finish within five rounds and have source probability 17/81',()=>{
  let wins=0,losses=0,max=0;
  function walk(fight,probability) {
    max=Math.max(max,fight.round);
    if(fight.status==='win'){wins+=probability;return;}
    if(fight.status==='loss'){losses+=probability;return;}
    for(let die=1;die<=6;die++)walk(roll(JSON.parse(JSON.stringify(fight)),die),probability/6);
  }
  walk(start(),1);assert.equal(max,5);assert.ok(Math.abs(wins-17/81)<1e-12);assert.ok(Math.abs(wins+losses-1)<1e-12);
});

test('RED is alive, and the next wound ends the duel immediately',()=>{
  assert.equal(roll(start('RED'),6).status,'loss');assert.equal(roll(start('GREEN','RED'),1).status,'win');
  const won=roll(roll(roll(start(),1),2),1);assert.equal(won.opponent.lifeForce,'DEAD');
  let calls=0;assert.throws(()=>knightmareRound(won,{expectedRound:3},()=>{calls++;return 0;}));assert.equal(calls,0);
});

test('luck is explicit, consumes one charge and never rolls or accepts a hidden die',()=>{
  let calls=0;const random=()=>{calls++;throw Error('Should not roll');};
  let fight=knightmareRound(start('RED','GREEN',2),{expectedRound:0,useLuck:true},random);
  assert.equal(fight.opponent.lifeForce,'AMBER');assert.equal(fight.player.lifeForce,'RED');assert.equal(fight.luckCharges,1);
  fight=knightmareRound(fight,{expectedRound:1,useLuck:true},random);assert.equal(fight.opponent.lifeForce,'RED');
  assert.throws(()=>knightmareRound(fight,{expectedRound:2,useLuck:true},random));assert.equal(calls,0);
  assert.throws(()=>knightmareRound(start('GREEN','GREEN',1),{expectedRound:0,useLuck:true,die:6}));
});

test('manual and random rolls agree; invalid inputs and stale actions consume no random roll',()=>{
  for(let die=1;die<=6;die++)assert.deepEqual(roll(start(),die),knightmareRound(start(),{expectedRound:0},()=>((die-1)+0.5)/6));
  for(const die of [null,0,7,1.5,'1',NaN])assert.throws(()=>roll(start(),die));
  let calls=0;const fight=roll(start(),1);assert.throws(()=>knightmareRound(fight,{expectedRound:0},()=>{calls++;return 0;}));assert.equal(calls,0);
  for(const value of [-1,1,NaN,Infinity])assert.throws(()=>knightmareRound(start(),{expectedRound:0},()=>value));
  for(const grade of ['DEAD','green',null])assert.throws(()=>start(grade));
  assert.throws(()=>startKnightmareFight({lifeForce:'GREEN'},{name:'',lifeForce:'GREEN'},rules));
});

test('restored transcripts reject altered dice, wounds, charges and post-outcome rounds',()=>{
  const fight=roll(roll(start('GREEN','GREEN',1),1),6);
  for(const change of [f=>f.round++,f=>f.player.lifeForce='GREEN',f=>f.rounds[0].die=6,
    f=>f.rounds[0].wounded='player',f=>f.luckCharges=0,f=>f.status='win',f=>f.initial.player='DEAD']) {
    const copy=structuredClone(fight);change(copy);assert.throws(()=>validateKnightmareFight(copy));
  }
  const lost=roll(start('RED'),6);lost.rounds.push({...lost.rounds[0],round:2});lost.round=2;
  assert.throws(()=>validateKnightmareFight(lost));
  const cancelled=cancelKnightmareFight(fight);assert.equal(cancelled.status,'cancelled');
  assert.doesNotThrow(()=>validateKnightmareFight(JSON.parse(JSON.stringify(cancelled))));assert.throws(()=>roll(cancelled,1));
});

test('history records each terminal result once, with monotonic timestamps',()=>{
  const state=emptyKnightmareState();state.fight=roll(start('RED'),6);
  rememberKnightmareFight(state,100);rememberKnightmareFight(state,100);assert.equal(state.history.length,1);
  assert.equal(state.playerLifeForce,'DEAD');assert.equal(state.history[0].outcome,'loss');
  state.fight=cancelKnightmareFight(start());rememberKnightmareFight(state,100);
  assert.equal(state.history.length,2);assert.equal(state.history[1].ts,101);assert.equal(state.history[1].outcome,'cancelled');
});

test('saved state is lazy and rejects stale run, book and action tokens without writes',()=>{
  let run={},bookId=1483,saves=0;const definition={id:1483,stateKey:'sim1483'};
  const store=createKnightmareState(()=>({run,bookId,definition,saveState:()=>saves++}));
  const first=store.snapshot();assert.equal(run.sim1483,undefined);
  const begin=state=>({...state,fight:start()});assert.equal(store.update(begin,first),true);assert.equal(saves,1);
  assert.equal(store.update(begin,first),false);const token=store.snapshot();bookId=1484;assert.equal(store.update(begin,token),false);
  bookId=1483;run={};assert.equal(store.update(begin,token),false);assert.equal(run.sim1483,undefined);assert.equal(saves,1);
});

test('callbacks cannot write to a newly selected run or initialize another book',()=>{
  let run={},bookId=1483,saves=0;const definition={id:1483,stateKey:'sim1483'};
  const store=createKnightmareState(()=>({run,bookId,definition,saveState:()=>saves++}));
  const original=run;
  assert.equal(store.update(state=>{run={};state.fight=start();return state;}),false);
  assert.equal(original.sim1483,undefined);assert.equal(run.sim1483,undefined);assert.equal(saves,0);
  assert.equal(store.update(state=>{bookId=1484;state.fight=start();return state;}),false);assert.equal(saves,0);
});
