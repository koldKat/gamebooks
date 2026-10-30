import test from 'node:test';
import assert from 'node:assert/strict';
import {createFatemasterState, emptyFatemasterState, rememberFatemasterFight} from '../../../../public/js/battlesim/engines/fatemaster/state.js';
import {assignFatemasterDamage, attackFatemaster, cancelFatemasterFight, startFatemasterFight} from '../../../../public/js/battlesim/engines/fatemaster/battle.js';
const definition={id:12,stateKey:'sim12'};
const player={name:'Player',strength:8,agility:8,power:3,damage:10};
const enemy={name:'Synthetic opponent',strength:4,agility:4,power:0,attackBonus:0,defenceBonus:0,damage:2};
const fight=()=>startFatemasterFight(player,[enemy]);

test('reading a missing simulator state does not mutate the run or unrelated saved systems',()=>{
  const run={path:[1,2],inventory:{key:1},simOther:{fight:'retained'}},before=JSON.stringify(run);
  const state=createFatemasterState(()=>({run,bookId:12,definition,saveState:()=>assert.fail('Unexpected save')}));
  const read=state.read();read.encounter='changed';assert.equal(JSON.stringify(run),before);assert.equal(state.read().encounter,'');
});
test('state transactions touch only the selected simulator and keep pending choices across JSON reload',()=>{
  const run={path:[1,2],inventory:{key:1}},before=JSON.stringify(run);let saves=0;
  const api=createFatemasterState(()=>({run,bookId:12,definition,saveState:()=>saves++}));
  api.update(state=>{state.fight=startFatemasterFight(player,[enemy],{openingDamage:2});return state;});
  assert.equal(run.sim12.fight.pending.kind,'damage');const reloaded=JSON.parse(JSON.stringify(run));
  const restored=createFatemasterState(()=>({run:reloaded,bookId:12,definition,saveState:()=>saves++}));
  restored.update(state=>{state.fight=assignFatemasterDamage(state.fight,'agility');return state;});
  assert.equal(reloaded.sim12.player.agility,6);assert.equal(reloaded.sim12.fight.pending,null);assert.equal(saves,2);
  assert.equal(JSON.stringify({path:run.path,inventory:run.inventory}),before);
});
test('a delayed confirmation cannot write a fight into a different current run',()=>{
  let run={},saves=0;const first=run;
  const api=createFatemasterState(()=>({run,bookId:12,definition,saveState:()=>saves++})),token=api.snapshot();run={};
  assert.equal(api.update(state=>{state.fight=fight();return state;},token),false);assert.deepEqual(first,{});assert.deepEqual(run,{});assert.equal(saves,0);
});
test('a stale state token cannot replace a newer pending choice on the same run',()=>{
  const run={};let saves=0;const api=createFatemasterState(()=>({run,bookId:12,definition,saveState:()=>saves++})),old=api.snapshot();
  api.update(state=>{state.variant='current';return state;});assert.equal(api.update(state=>{state.variant='stale';return state;},old),false);
  assert.equal(run.sim12.variant,'current');assert.equal(saves,1);
});
test('switching books during a state callback rejects the write and preserves the original run',()=>{
  const run={};let bookId=12,saves=0;const api=createFatemasterState(()=>({run,bookId,definition,saveState:()=>saves++}));
  assert.equal(api.update(state=>{state.variant='wrong';bookId=13;return state;}),false);assert.deepEqual(run,{});assert.equal(saves,0);assert.equal(api.read(),null);
});
test('an exception in a transaction leaves all current saved fields unchanged',()=>{
  const run={sim12:emptyFatemasterState()},before=JSON.stringify(run);const api=createFatemasterState(()=>({run,bookId:12,definition,saveState:()=>assert.fail()}));
  assert.throws(()=>api.update(state=>{state.encounter='bad';throw Error('Invalid action');}));assert.equal(JSON.stringify(run),before);
});
test('a finished encounter creates one monotonic history result, including after JSON reload',()=>{
  const state=emptyFatemasterState();state.fight=attackFatemaster(fight(),'enemy-0',()=>6);state.fight.label='Synthetic fight';
  rememberFatemasterFight(state,50);assert.equal(state.history.length,1);assert.equal(state.history[0].outcome,'win');
  const resumed=JSON.parse(JSON.stringify(state));rememberFatemasterFight(resumed,60);assert.equal(resumed.history.length,1);
  resumed.fight=attackFatemaster(fight(),'enemy-0',()=>6);rememberFatemasterFight(resumed,40);assert.equal(resumed.history[1].ts,51);
});
test('a paused or cancelled encounter preserves casualties and cannot create XP outcome history',()=>{
  const state=emptyFatemasterState();state.fight=startFatemasterFight(player,[enemy],{openingDamage:2});
  state.fight=assignFatemasterDamage(state.fight,'strength');state.fight.status='paused';rememberFatemasterFight(state,5);
  assert.equal(state.history.length,0);assert.equal(state.player.strength,6);state.fight=cancelFatemasterFight(state.fight);rememberFatemasterFight(state,6);
  assert.equal(state.history.length,0);assert.equal(state.fight.status,'cancelled');assert.equal(state.player.strength,6);
});
