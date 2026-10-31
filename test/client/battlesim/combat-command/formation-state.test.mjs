import test from 'node:test';
import assert from 'node:assert/strict';
import {createFormationState} from '../../../../public/js/battlesim/engines/combat-command/formation-state.js';

const definition={id:900001,stateKey:'syntheticFormation'};
function fixture(){
  let run={id:1,inventory:{coins:7},otherSim:{fight:{round:3}}},bookId=definition.id,saves=0;
  const state=createFormationState(()=>({run,bookId,definition,saveState:()=>saves++}));
  return {state,get run(){return run;},get saves(){return saves;},setRun:value=>{run=value;},setBook:value=>{bookId=value;}};
}
const fight=(status='fighting',round=1)=>({formationRulesVersion:1,status,round,section:null,
  config:{label:'Synthetic fight'},player:[{key:'p',count:2}],enemies:[{key:'e',count:3}],
  history:[{round,attacks:[{hits:1}],checks:[]}]});

test('reading an uninitialized state never creates or mutates a saved simulator',()=>{
  const f=fixture(),before=structuredClone(f.run);const first=f.state.read();first.custom.changed=true;
  assert.deepEqual(f.run,before);assert.equal(f.saves,0);assert.equal(f.state.read().custom.changed,undefined);
});
test('actions store only this simulator and snapshots remain detached',()=>{
  const f=fixture(),others=structuredClone(f.run);
  assert.equal(f.state.update(state=>({...state,encounter:'example'})),true);
  const snapshot=f.state.snapshot();snapshot.encounter='changed';
  assert.equal(f.state.read().encounter,'example');assert.deepEqual(f.run.inventory,others.inventory);
  assert.deepEqual(f.run.otherSim,others.otherSim);assert.equal(f.saves,1);
});
test('a fight transition preserves unrelated run data and records a win once',()=>{
  const f=fixture();f.state.update(state=>({...state,fight:fight('win')}));
  assert.equal(f.state.read().history.length,1);assert.equal(f.state.read().history[0].outcome,'win');
  f.state.update(state=>state);assert.equal(f.state.read().history.length,1);
  assert.deepEqual(f.run.inventory,{coins:7});assert.equal(f.state.read().fight.recorded,true);
});
test('a real opening-shot death counts even though its combat round is zero',()=>{
  const f=fixture();f.state.update(state=>({...state,fight:fight('loss',0)}));
  assert.equal(f.state.read().history[0].outcome,'loss');assert.equal(f.state.read().history.length,1);
});
test('paused or cancelled checkpoints and empty combat logs never claim victory rewards',()=>{
  for(const status of ['paused','cancelled']){
    const f=fixture();f.state.update(state=>({...state,fight:fight(status)}));
    assert.equal(f.state.read().history.length,0);assert.equal(f.state.read().fight.recorded,undefined);
  }
  const f=fixture(),unused=fight('win');unused.history[0].attacks=[];
  f.state.update(state=>({...state,fight:unused}));assert.equal(f.state.read().history.length,0);
});
test('escaping retains its distinct outcome and successive real outcomes get increasing timestamps',()=>{
  const f=fixture();f.state.update(state=>({...state,fight:fight('escaped')}));
  const first=f.state.read().history[0].ts;
  f.state.update(state=>({...state,fight:fight('loss')}));
  assert.equal(f.state.read().history[0].outcome,'escaped');assert.ok(f.state.read().history[1].ts>first);
});
test('a stale confirmation cannot replace a newer fight or a different active book',()=>{
  const f=fixture();f.state.update(state=>({...state,fight:fight()}));const previous=f.state.read().fight;
  f.state.update(state=>({...state,fight:fight('paused')}));const current=f.state.snapshot(),saves=f.saves;
  assert.equal(f.state.update(state=>({...state,fight:fight('cancelled')}),previous),false);
  assert.deepEqual(f.state.snapshot(),current);assert.equal(f.saves,saves);
  f.setBook(2);assert.equal(f.state.read(),null);assert.equal(f.state.update(state=>state),false);
});
test('a run or simulator replacement during an update rejects the stale callback result',()=>{
  const f=fixture(),original=f.run;
  assert.equal(f.state.update(state=>{f.setRun({id:2});return {...state,encounter:'stale'};}),false);
  assert.equal(original.syntheticFormation,undefined);assert.equal(f.run.syntheticFormation,undefined);assert.equal(f.saves,0);
  f.setRun(original);
  assert.equal(f.state.update(state=>{original.syntheticFormation={encounter:'newer'};return state;}),false);
  assert.equal(original.syntheticFormation.encounter,'newer');assert.equal(f.saves,0);
});
