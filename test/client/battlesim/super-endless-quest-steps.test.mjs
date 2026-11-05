import test from 'node:test';
import assert from 'node:assert/strict';
import {startStagedQuestFight, stagedQuestAction, validateStagedQuestFight, normalizeStagedEncounter}
  from '../../../public/js/battlesim/engines/super-endless-quest/steps.js';
import {emptyQuestState, rememberQuestFight, createQuestState}
  from '../../../public/js/battlesim/engines/super-endless-quest/state.js';

const player = {maxHp:26, hp:20, fighting:3, agility:2, experience:4};
const end = (destination, outcome, damage=0) => ({destination, outcome, damage});
const next = destination => ({destination, next:destination});
const encounter = () => ({name:'Synthetic staged opponent', section:'1', steps:[
  {section:'1', dice:1, skill:'fighting', target:8, swordBonus:2, success:next('2'), failure:next('3')},
  {section:'2', dice:2, skill:'fighting', target:10, entryDamage:{base:3,gem:0}, success:end('4','win',{base:1,gem:0}), failure:next('2')},
  {section:'3', dice:1, skill:'agility', target:7, success:end('4','win'), failure:end('5','loss')}
]});
const start = (overrides={}, data=encounter(), acknowledged=false) => startStagedQuestFight({...player,...overrides},data,acknowledged);
const act = (fight, action, random) => stagedQuestAction(fight,{expectedEvent:fight.events.length,...action},random);
const roll = (fight,dice,spent=0) => act(fight,{kind:'roll',dice,spent});

test('single-die attacks preserve the declared skill, sword bonus and experience',()=>{
  for(let d=1;d<=6;d++)for(const sword of [false,true]) {
    const initial=start({sword}), saved=structuredClone(initial), f=roll(initial,[d],1);
    assert.deepEqual(initial,saved);assert.equal(f.events[0].total,d+3+1+(sword?2:0));
    assert.equal(f.player.experience,3);assert.equal(f.destination,f.events[0].total>=8?'2':'3');
    assert.equal(f.status,'fighting');assert.equal(f.phase,'continue');
    assert.doesNotThrow(()=>validateStagedQuestFight(JSON.parse(JSON.stringify(f))));
  }
});

test('intermediate attacks never record battle wins or losses and require explicit continuation',()=>{
  const state=emptyQuestState();state.fight=roll(start(),[6]);rememberQuestFight(state,1);
  assert.equal(state.history.length,0);assert.equal(state.fight.player.hp,20);
  assert.throws(()=>roll(state.fight,[6,6]));
  assert.throws(()=>act(state.fight,{kind:'continue',destination:'3'}));
  state.fight=act(state.fight,{kind:'continue',destination:'2'});rememberQuestFight(state,2);
  assert.equal(state.fight.player.hp,17);assert.equal(state.history.length,0);
  state.fight=roll(state.fight,[6,6]);rememberQuestFight(state,3);rememberQuestFight(state,4);
  assert.equal(state.fight.status,'win');assert.equal(state.fight.player.hp,16);
  assert.equal(state.history.length,1);assert.equal(state.history[0].outcome,'win');
});

test('opening damage acknowledgment applies only to the initial check, with repeats charged once',()=>{
  const e=encounter();e.section='2';
  assert.equal(start({},e).player.hp,17);assert.equal(start({},e,true).player.hp,20);
  let f=roll(start({},e,true),[1,1]);assert.equal(f.player.hp,20);
  f=act(f,{kind:'continue',destination:'2'});assert.equal(f.player.hp,17);
  assert.equal(start({gem:true},e).player.hp,20);
  assert.equal(roll(start({gem:true},e),[6,6]).player.hp,20);
});

test('two-die results and zero-damage repeat profiles use the exact threshold',()=>{
  const e=encounter();e.section='2';e.steps[1].entryDamage=0;
  for(let a=1;a<=6;a++)for(let b=1;b<=6;b++) {
    const f=roll(start({},e),[a,b]);assert.equal(f.events[0].total,a+b+3);
    assert.equal(f.status,a+b+3>=10?'win':'fighting');
    if(f.status==='fighting')assert.equal(act(f,{kind:'continue',destination:'2'}).player.hp,20);
  }
});

test('defensive reactions use agility without adding fighting or a weapon bonus',()=>{
  const e=encounter();e.section='3';
  for(let d=1;d<=6;d++) {
    const f=roll(start({fighting:999,sword:true},e),[d]);assert.equal(f.events[0].total,d+2);
    assert.equal(f.status,d+2>=7?'win':'loss');
    assert.equal(f.player.hp,20); // A fatal narrative does not invent a numeric HP cost.
  }
});

test('death at an entry or terminal contact cost prevents a false victory',()=>{
  const e=encounter();e.section='2';assert.equal(start({hp:2},e).status,'loss');
  const f=roll(start({hp:1},e,true),[6,6]);assert.equal(f.status,'loss');assert.equal(f.player.hp,0);
  assert.throws(()=>act(f,{kind:'continue',destination:'2'}));
});

test('printed combat escape remains an explicit choice, without running its story test',()=>{
  const e=encounter();e.steps.push({section:'6',entryDamage:{base:1,gem:0},choices:[next('2'),end('9','fled')]});e.section='6';
  const initial=start({},e);assert.equal(initial.phase,'choice');assert.equal(initial.player.hp,19);
  assert.throws(()=>roll(initial,[6]));assert.throws(()=>act(initial,{kind:'choice',destination:'99'}));
  const escaped=act(initial,{kind:'choice',destination:'9'});assert.equal(escaped.status,'fled');assert.equal(escaped.destination,'9');
  const continued=act(initial,{kind:'choice',destination:'2'});assert.equal(continued.phase,'continue');
  assert.equal(act(continued,{kind:'continue',destination:'2'}).player.hp,16);
});

test('invalid or stale declarations never generate dice and saved events replay exactly',()=>{
  const f=start();let calls=0;const random=()=>{calls++;return .5;};
  for(const action of [{expectedEvent:1,kind:'roll'},{expectedEvent:0,kind:'roll',spent:5},{expectedEvent:0,kind:'roll',spent:-1},{expectedEvent:0,kind:'roll',dice:[1,2]}]) {
    assert.throws(()=>stagedQuestAction(f,action,random));
  }
  assert.equal(calls,0);
  const rolled=act(f,{kind:'roll',spent:0},random);assert.equal(calls,1);
  const tampered=structuredClone(rolled);tampered.events[0].total++;
  assert.throws(()=>validateStagedQuestFight(tampered));
  for(const key of ['phase','pending','destination','status']) {
    const changed=structuredClone(rolled);changed[key]='999';assert.throws(()=>validateStagedQuestFight(changed));
  }
});

test('cancellation and stale run snapshots preserve unrelated player runs',()=>{
  let run={},bookId=42,saves=0;const definition={id:42,stateKey:'testSim'};
  const store=createQuestState(()=>({run,bookId,definition,saveState:()=>saves++}));
  const token=store.snapshot();run={};
  assert.equal(store.update(state=>{state.fight=start();return state;},token),false);assert.equal(saves,0);
  assert.equal(store.update(state=>{state.fight=start();return state;}),true);
  const f=run.testSim.fight;assert.equal(store.update(state=>{state.fight=act(f,{kind:'cancel'});return state;}),true);
  assert.equal(run.testSim.history[0].outcome,'cancelled');assert.equal(run.testSim.player.hp,20);
});

test('catalog validation rejects absent continuations, duplicate sections and malformed dice',()=>{
  for(const mutate of [e=>{e.steps.pop();},e=>e.steps.push(e.steps[0]),e=>{e.steps[0].dice=3;},e=>{e.steps[0].success.destination='9';},e=>{e.steps[0].skill='stealth';}]) {
    const e=encounter();mutate(e);assert.throws(()=>normalizeStagedEncounter(e));
  }
});
