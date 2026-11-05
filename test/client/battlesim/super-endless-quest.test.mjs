import test from 'node:test';
import assert from 'node:assert/strict';
import {startQuestFight, questRoll, exitQuestFight, validateQuestFight, recoverQuestHp}
  from '../../../public/js/battlesim/engines/super-endless-quest/core.js';
import {emptyQuestState, rememberQuestFight, createQuestState}
  from '../../../public/js/battlesim/engines/super-endless-quest/state.js';

const player = {maxHp:36, hp:30, fighting:3, experience:4};
const opponent = {name:'Custom opponent', target:12, damageOnMiss:4, winSection:'2', loseSection:'3',
  fleeSection:'4', surrenderSection:'5', minimumHpToFlee:20};
const start = (p={}, e={}) => startQuestFight({...player,...p},{...opponent,...e});
const roll = (f,dice,spent=0) => questRoll(f,{expectedEvent:f.events.length,dice,spent});

test('all 36 attack rolls use the fighting bonus and one successful hit ends combat',()=>{
  for(let a=1;a<=6;a++)for(let b=1;b<=6;b++) {
    const original=start(),before=structuredClone(original),fight=roll(original,[a,b]);
    assert.deepEqual(original,before);assert.equal(fight.events[0].total,a+b+3);
    assert.equal(fight.status,a+b+3>=12?'win':'fighting');
    assert.equal(fight.player.hp,a+b+3>=12?30:26);
    assert.equal(fight.destination,a+b+3>=12?'2':undefined);
    assert.doesNotThrow(()=>validateQuestFight(JSON.parse(JSON.stringify(fight))));
  }
});

test('misses deduct damage, can repeat, or take the printed loss without an extra hit',()=>{
  let f=roll(start(),[1,1]);assert.equal(f.round,1);
  f=roll(f,[1,2]);assert.equal(f.player.hp,22);
  const loss=exitQuestFight(f,'loss',f.events.length);assert.equal(loss.player.hp,22);
  assert.equal(loss.destination,'3');assert.equal(loss.status,'loss');
  assert.throws(()=>exitQuestFight(start(),'loss',0));
  const dead=roll(start({hp:3}),[1,1]);assert.equal(dead.status,'loss');assert.equal(dead.player.hp,0);
  assert.equal(dead.destination,undefined);assert.throws(()=>roll(dead,[6,6]));
});

test('book experience must be declared and spent before dice, including unsuccessful rolls',()=>{
  const f=roll(start(),[1,1],4);assert.equal(f.player.experience,0);assert.equal(f.events[0].total,9);
  let calls=0;
  for(const spent of [-1,5,1.5,'1'])assert.throws(()=>questRoll(start(),{expectedEvent:0,spent},()=>{calls++;return 0;}));
  assert.equal(calls,0);assert.equal(roll(start(),[4,4],1).status,'win');
});

test('breath save has no fighting bonus or invented damage, happens once, and accepts declared experience',()=>{
  const save={dice:2,sides:6,successAtLeast:8,failureSection:'9'};
  for(let a=1;a<=6;a++)for(let b=1;b<=6;b++) {
    const f=roll(start({fighting:100},{preCombatSave:save}),[a,b]);
    assert.equal(f.round,0);assert.equal(f.player.hp,30);assert.equal(f.events[0].total,a+b);
    assert.equal(f.status,a+b>=8?'fighting':'loss');
    if(a+b>=8){assert.equal(f.phase,'attack');assert.equal(roll(f,[1,1]).status,'win');}
    else assert.equal(f.destination,'9');
    assert.doesNotThrow(()=>validateQuestFight(JSON.parse(JSON.stringify(f))));
  }
  const f=roll(start({}, {preCombatSave:save}),[2,2],4);assert.equal(f.phase,'attack');assert.equal(f.player.experience,0);
  assert.throws(()=>exitQuestFight(start({}, {preCombatSave:save}),'surrendered',0));
});

test('printed flee and fight thresholds use current HP; no invented routes',()=>{
  assert.equal(exitQuestFight(start({hp:20}),'fled',0).destination,'4');
  assert.throws(()=>exitQuestFight(start({hp:19}),'fled',0));
  const f=roll(start({hp:22}),[1,1]);assert.throws(()=>exitQuestFight(f,'fled',1));
  const weak=start({hp:19},{minimumHpToFight:20,forcedSurrenderBelowHp:20});
  assert.throws(()=>roll(weak,[6,6]));assert.equal(exitQuestFight(weak,'surrendered',0).status,'surrendered');
  assert.throws(()=>exitQuestFight(start({}, {fleeSection:null,surrenderSection:null}),'fled',0));
  assert.throws(()=>exitQuestFight(start({}, {surrenderSection:null}),'surrendered',0));
  const same=start({}, {winSection:'4'});assert.equal(roll(same,[6,6]).destination,exitQuestFight(same,'fled',0).destination);
});

test('invalid manual dice, stale clicks and completed fights do not roll random dice',()=>{
  for(const dice of [null,[],[1],[1,7],[0,1],['1',1],[1.5,2]])assert.throws(()=>roll(start(),dice));
  let calls=0;const rng=()=>{calls++;return 0;};
  assert.throws(()=>questRoll(start(),{expectedEvent:1},rng));
  const won=roll(start(),[6,6]);assert.throws(()=>questRoll(won,{expectedEvent:1},rng));assert.equal(calls,0);
  for(const v of [-1,1,NaN,Infinity])assert.throws(()=>questRoll(start(),{expectedEvent:0},()=>v));
  assert.deepEqual(questRoll(start(),{expectedEvent:0},()=>0),roll(start(),[1,1]));
});

test('saved transcripts reject changed rolls, HP, experience, phases and post-outcome actions',()=>{
  const f=roll(start(),[1,2],2);
  for(const change of [f=>f.player.hp++,f=>f.player.experience++,f=>f.round++,f=>f.phase='save',
    f=>f.status='win',f=>f.events[0].dice=[6,6],f=>f.events[0].spent++,f=>f.events[0].total++]) {
    const bad=structuredClone(f);change(bad);assert.throws(()=>validateQuestFight(bad));
  }
  const cancelled=exitQuestFight(f,'cancelled',1);assert.doesNotThrow(()=>validateQuestFight(cancelled));
  assert.throws(()=>exitQuestFight(cancelled,'cancelled',2));
});

test('HP recovery caps at the original maximum without reviving a dead character',()=>{
  assert.equal(recoverQuestHp(player,100).hp,36);assert.equal(recoverQuestHp(player,2).hp,32);
  assert.throws(()=>recoverQuestHp({...player,hp:0},6));assert.throws(()=>recoverQuestHp(player,-1));
});

test('terminal history is recorded once; timestamps increase; stale run/book callbacks do not write',()=>{
  const state=emptyQuestState();state.fight=roll(start(),[6,6]);rememberQuestFight(state,100);rememberQuestFight(state,100);
  assert.equal(state.history.length,1);assert.equal(state.history[0].outcome,'win');
  state.fight=exitQuestFight(start(),'cancelled',0);rememberQuestFight(state,100);assert.equal(state.history[1].ts,101);
  let run={},bookId=1587,saves=0;const definition={id:1587,stateKey:'sim1587'};
  const store=createQuestState(()=>({run,bookId,definition,saveState:()=>saves++}));
  const token=store.snapshot();assert.equal(run.sim1587,undefined);
  assert.equal(store.update(s=>({...s,fight:start()}),token),true);assert.equal(saves,1);
  assert.equal(store.update(s=>s,token),false);const next=store.snapshot();bookId=1;assert.equal(store.update(s=>s,next),false);
  bookId=1587;const original=run;assert.equal(store.update(s=>{run={};return s;},next),false);
  assert.equal(original.sim1587.fight.round,0);assert.equal(run.sim1587,undefined);assert.equal(saves,1);
});
