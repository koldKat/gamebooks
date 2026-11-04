import test from 'node:test';
import assert from 'node:assert/strict';
import {createState} from '../../../public/js/battlesim/books/1577/state.js';

function harness(){
  let run={other:{keep:true}},book=1577,saves=0;
  const store=createState(()=>({currentBookId:book,currentPlaythrough:()=>run,saveState:()=>saves++}));
  return {store,get run(){return run;},set run(value){run=value;},set book(value){book=value;},get saves(){return saves;}};
}

test('rendering reads do not initialize or modify player state',()=>{
  const h=harness();assert.equal(h.store.read(),null);assert.deepEqual(h.run,{other:{keep:true}});assert.equal(h.saves,0);
  h.store.change(()=>{});assert.equal(h.saves,1);assert.deepEqual(h.run.other,{keep:true});
});

test('pending dice persist exactly; each terminal battle is recorded only once',()=>{
  const h=harness();h.store.change(data=>{data.fight={name:'Synthetic fight',section:'test',jediPoints:3,pending:{kind:'strike',die:5}};});
  assert.deepEqual(h.store.read().fight.pending,{kind:'strike',die:5});
  h.store.change(data=>{data.fight.outcome='win';data.fight.pending=null;});
  assert.equal(h.store.read().history.length,1);assert.equal(h.store.read().history[0].outcome,'win');
  h.store.change(()=>{});assert.equal(h.store.read().history.length,1);
  h.store.change(data=>{data.fight={name:'Next fight',section:'test',outcome:'loss'};});
  assert.equal(h.store.read().history.length,2);assert.ok(h.store.read().history[1].ts>h.store.read().history[0].ts);
});

test('timed phases, third-party results and stopping a fight generate no reward history',()=>{
  const h=harness();
  for(const outcome of ['phase','cancelled'])h.store.change(data=>{data.fight={name:'Phase',section:'test',outcome,jediPoints:2};});
  assert.deepEqual(h.store.read().history,[]);assert.equal(h.store.read().fight.jediPoints,2);
});

test('a stale dialog cannot write to another run or book and failed updates are atomic',()=>{
  const h=harness();h.store.change(()=>{});const original=structuredClone(h.run);
  assert.throws(()=>h.store.change(data=>{data.setup.jediPoints=50;throw Error('invalid');}));
  assert.deepEqual(h.run,original);
  const previous=h.run;const replacement={other:'new'};
  assert.equal(h.store.change(()=>{h.run=replacement;}),false);assert.deepEqual(h.run,replacement);assert.deepEqual(previous,original);
  h.book=1;assert.equal(h.store.read(),null);assert.equal(h.store.change(()=>{}),false);
});
