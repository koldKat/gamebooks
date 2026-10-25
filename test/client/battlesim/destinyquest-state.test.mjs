import test from 'node:test';
import assert from 'node:assert/strict';
import {createState} from '../../../public/js/battlesim/books/1285/state.js';

test('reading the current run never creates or migrates simulator data',()=>{
  const run={notebook:'keep'},before=structuredClone(run);let writes=0;
  const state=createState(()=>({getRun:()=>run,getBookId:()=>1285,saveState:()=>writes++}));
  assert.equal(state.read(),null);state.capture();assert.deepEqual(run,before);assert.equal(writes,0);
});

test('committing a simulator update preserves every unrelated run field',()=>{
  const run={notebook:'keep',party:{members:[1,2]},sim1285:{fight:null,unknown:{value:3}}};let writes=0;
  const state=createState(()=>({getRun:()=>run,getBookId:()=>1285,saveState:()=>writes++}));
  const snapshot=state.capture(),next={...state.read(),fight:{phase:'speed'}};
  assert.equal(state.commit(snapshot,next),true);assert.equal(writes,1);assert.equal(run.notebook,'keep');
  assert.deepEqual(run.party,{members:[1,2]});assert.deepEqual(run.sim1285.unknown,{value:3});
});

for(const change of ['book','run','session','fight'])test('stale context cannot commit after changing '+change,()=>{
  let book=1285,run={sim1285:{fight:{phase:'speed'}}},writes=0;
  const state=createState(()=>({getRun:()=>run,getBookId:()=>book,saveState:()=>writes++}));const snapshot=state.capture();
  if(change==='book')book=999;
  if(change==='run')run={sim1285:{fight:{phase:'speed'}}};
  if(change==='session')run.sim1285={fight:{phase:'speed'}};
  if(change==='fight')run.sim1285.fight={phase:'damage'};
  const before=structuredClone(run);assert.equal(state.commit(snapshot,{fight:null}),false);
  assert.deepEqual(run,before);assert.equal(writes,0);
});
