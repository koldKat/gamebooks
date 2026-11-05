import test from 'node:test';
import assert from 'node:assert/strict';
import {readRosterDocument} from '../../helpers/roster-db.cjs';
import {ENCOUNTERS, RULES, loadRoster} from '../../../public/js/battlesim/books/1589/definition.js';
import {startStagedQuestFight, stagedQuestAction} from '../../../public/js/battlesim/engines/super-endless-quest/steps.js';
import {emptyQuestState, rememberQuestFight} from '../../../public/js/battlesim/engines/super-endless-quest/state.js';

const document=readRosterDocument(1589);
await loadRoster(async()=>({ok:true,json:async()=>document.enemies}));
const entry=section=>ENCOUNTERS.find(e=>e.section===section);
const hero={maxHp:100,hp:90,fighting:20,agility:20,experience:10};
const act=(f,a)=>stagedQuestAction(f,{expectedEvent:f.events.length,...a});
const roll=(f,dice,spent=0)=>act(f,{kind:'roll',dice,spent});

test('every installed entry completes only its printed combat continuation and records one outcome',()=>{
  assert.equal(document.family,'super-endless-quest');assert.equal(ENCOUNTERS.length,43);
  assert.equal(RULES.skillsTotal,7);assert.equal(RULES.minimumSkill,1);
  for(const preset of ENCOUNTERS){
    assert.ok(preset.sourcePdfPages.length);const state=emptyQuestState();state.fight=startStagedQuestFight(hero,preset);
    let actions=0;
    while(state.fight.status==='fighting'){
      assert.ok(++actions<30);let f=state.fight;
      if(f.phase==='attack'){const s=f.opponent.steps.find(s=>s.section===f.step);f=roll(f,Array(s.dice).fill(6));}
      else if(f.phase==='continue')f=act(f,{kind:'continue',destination:f.pending});
      else f=act(f,{kind:'choice',destination:'126'});
      state.fight=f;rememberQuestFight(state,actions);
      if(f.status==='fighting')assert.equal(state.history.length,0,preset.section);
    }
    assert.equal(state.history.length,1);assert.equal(state.fight.status,preset.section==='105'?'fled':'win');
  }
  for(const section of ['59','159','179'])assert.equal(entry(section),undefined);
});

test('original single-die and threshold exceptions are present in the installed catalog',()=>{
  for(const section of ['11','70','123'])assert.equal(entry(section).dice,1);
  for(const section of ['105','111'])assert.equal(entry(section).skill,'agility');
  for(const [a,b]of [['14','97'],['89','155'],['174','106']]){
    assert.equal(entry(a).target,10);assert.equal(entry(b).target,9);
  }
  assert.equal(entry('96').target,13);assert.equal(entry('156').target,12);
  assert.equal(entry('11').target,11);assert.equal(entry('36').target,10);
});

test('the zero-damage zombie repeat and equipment-specific damage stay distinct',()=>{
  const weak={...hero,fighting:1};let f=startStagedQuestFight(weak,entry('117'));
  for(let i=0;i<3;i++){f=roll(f,[1,1]);f=act(f,{kind:'continue',destination:'117'});}
  assert.equal(f.player.hp,90);assert.equal(f.status,'fighting');
  assert.equal(startStagedQuestFight({...weak,gem:true},entry('17')).player.hp,87);
  assert.equal(startStagedQuestFight({...weak,gem:true},entry('72')).player.hp,88);
  assert.equal(startStagedQuestFight({...weak,cloak:true},entry('97')).player.hp,86);
  assert.equal(startStagedQuestFight({...weak,cloak:true},entry('181')).player.hp,87);
});

test('wizard intermediate successes and both flying-boat outcomes never count as battle outcomes',()=>{
  for(const [section,dice,destination]of [['123',[6],'34'],['123',[1],'70'],['18',[6,6],'34']]){
    const f=roll(startStagedQuestFight({...hero,fighting:4},entry(section)),dice);
    assert.equal(f.status,'fighting');assert.equal(f.phase,'continue');assert.equal(f.destination,destination);
  }
});

test('terminal contact damage, capture costs and defensive escapes match their printed outcomes',()=>{
  let f=roll(startStagedQuestFight({...hero,hp:1},entry('22'),true),[6,6]);
  assert.equal(f.status,'loss');assert.equal(f.player.hp,0);
  f=roll(startStagedQuestFight({...hero,fighting:1},entry('87')),[1,1]);
  assert.equal(f.status,'loss');assert.equal(f.player.hp,86);assert.equal(f.destination,'56');
  f=roll(startStagedQuestFight({...hero,fighting:1,cloak:true},entry('24')),[1,1]);
  assert.equal(f.status,'loss');assert.equal(f.player.hp,87);assert.equal(f.destination,'85');
  f=roll(startStagedQuestFight(hero,entry('105')),[6]);assert.equal(f.status,'fled');assert.equal(f.destination,'19');
});
