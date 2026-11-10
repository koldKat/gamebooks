import test from 'node:test';
import assert from 'node:assert/strict';
import {readRosterDocument} from '../../helpers/roster-db.cjs';
import {createMagnakaiCombat} from '../../../public/js/battlesim/engines/lone-wolf/magnakai-combat.js';
import {createMagnakaiState} from '../../../public/js/battlesim/engines/lone-wolf/magnakai-state.js';
import {COMBAT_TABLE as established} from '../../../public/js/battlesim/engines/lone-wolf/combat-table.js';

const entries=readRosterDocument(326).enemies.map(row=>row.stats.entry);
const rules=Object.fromEntries(entries.map(entry=>[entry.section,entry.rules]));
const table=entries.find(entry=>entry.combatTable).combatTable;
function fixture(section=42, options={}) {
  let run={},book=326,pick=1,core;
  const store=createMagnakaiState({id:326,stateKey:'sim326'},()=>({currentBookId:book,currentPlaythrough:()=>run,health:core._health}));
  core=createMagnakaiCombat(()=>({...core,COMBAT_TABLE:table,ENCOUNTER_RULES:rules,_data:store.data,
    _appendLog:store.appendLog,_recordOutcome:store.recordOutcome,_battleOver:store.battleOver,
    _pick10:()=>pick,_renderAll(){},saveState(){},t:key=>key,escapeHtml:String,SVG_SKULL:'',SVG_TROPHY:''}),'battlesim326');
  const entry=entries.find(entry=>entry.section===section),data=store.data();
  Object.assign(data,{rolled:true,combatSkill:20,combatSkillInitial:20,endurance:100,enduranceInitial:100,nextSection:section,...options});
  data.enemy={name:entry?.name??'Custom opponent',skill:entry?.skill??20,endurance:entry?.stamina??100,enduranceMax:entry?.stamina??100};
  core._captureFightEffects(data);
  return{data,core,store,pick(value){pick=value;},book(value){book=value;},run(value){run=value;}};
}

test('the complete reviewed encounter set uses the established source chart',()=>{
  assert.deepEqual(entries.map(e=>e.section).sort((a,b)=>a-b),[12,26,37,42,47,71,77,78,92,114,116,138,155,156,159,164,194,201,208,215,234,254,270,282,283,337,343,344]);
  assert.deepEqual(table,established);
  assert.equal(entries.filter(e=>e.combatTable).length,1);
});
test('temporary combat modifiers expire at their printed round boundaries',()=>{
  for(const[section,amount,rounds]of[[114,2,1],[155,-4,1],[254,-2,1],[270,-2,2]]){
    const f=fixture(section);assert.equal(f.core._effectiveSkill(f.data),20+amount);
    f.data.roundsThisBattle=rounds;assert.equal(f.core._effectiveSkill(f.data),20);
  }
  for(const section of[254,270]){const f=fixture(section,{nextTracking:true});assert.equal(f.core._effectiveSkill(f.data),20);}
});
test('the injured Yawshath cannot inflict table losses during its first two rounds',()=>{
  const f=fixture(12);f.core._runRound();f.core._runRound();assert.equal(f.data.endurance,100);
  f.core._runRound();assert(f.data.endurance<100);
});
test('Psi-surge costs two EP and switches off at six; immunities distinguish Mindblast',()=>{
  const f=fixture(42,{nextPsychic:'surge'});assert.equal(f.core._effectiveSkill(f.data),24);
  f.core._runRound();assert.equal(f.data.endurance,94);
  f.data.endurance=6;assert.equal(f.core._effectiveSkill(f.data),20);
  const berserker=fixture(77,{nextPsychic:'blast'});assert.equal(berserker.core._effectiveSkill(berserker.data),20);
  berserker.data.combatEffects.psychic='surge';assert.equal(berserker.core._effectiveSkill(berserker.data),24);
  const immune=fixture(344,{nextPsychic:'surge'});assert.equal(immune.core._effectiveSkill(immune.data),20);
});
test('undead cold, Huntmastery and Sommerswerd are separate printed effects',()=>{
  const normal=fixture(270,{nextTracking:true}),sword=fixture(270,{nextTracking:true,nextSommerwerd:true,nextNexus:true});
  normal.core._runRound();sword.core._runRound();
  assert.equal(normal.data.endurance+2,sword.data.endurance);
  assert.equal(35-sword.data.enemy.endurance,2*(35-normal.data.enemy.endurance));
});
test('Roark and the Dakomyd return to the reader without a false killing victory',()=>{
  for(const[section,route]of[[78,180],[344,310]]){
    const f=fixture(section,{combatSkill:100});f.pick(0);f.core._runRound();
    assert.equal(f.data.combatEffects.route,route);assert.equal(f.data.history.length,0);
    const before=JSON.stringify(f.data);f.core._runRound();assert.equal(JSON.stringify(f.data),before);
  }
});
test('the archery final uses target points and never changes actual ENDURANCE',()=>{
  const f=fixture(26,{nextBowMastery:true,nextPsychic:'surge',attackModifier:50,endurance:17});
  assert.equal(f.core._effectiveSkill(f.data),23);f.core._runRound();
  assert.equal(f.data.endurance,17);assert(f.data.combatEffects.targetPoints<50);
  const broken=fixture(26,{nextJackan:true});broken.pick(0);broken.core._runRound();
  assert.equal(broken.data.combatEffects.route,335);assert.equal(broken.data.endurance,100);assert.equal(broken.data.history.length,0);
});
test('evasion obeys first-round-only and completed-round limits',()=>{
  for(const section of[116,337]){const f=fixture(section);assert(f.core._escapeRoute(f.data));f.data.roundsThisBattle=1;assert.equal(f.core._escapeRoute(f.data),0);}
  for(const[section,rounds]of[[155,4],[215,2],[343,3]]){
    const f=fixture(section);f.data.roundsThisBattle=rounds-1;assert.equal(f.core._escapeRoute(f.data),0);
    f.data.roundsThisBattle=rounds;assert(f.core._escapeRoute(f.data));
  }
  const door=fixture(156);door.core._escape();assert.equal(door.data.roundsThisBattle,0);assert.equal(door.data.combatEffects.route,339);
});
test('simultaneous death is one loss and invalid picks cannot partially advance a fight',()=>{
  const f=fixture(42);f.data.combatSkill=f.data.enemy.skill;f.data.endurance=f.data.enemy.endurance=1;
  f.core._runRound();assert.equal(f.data.history.length,1);assert.equal(f.data.history[0].outcome,'loss');
  f.core._runRound();assert.equal(f.data.history.length,1);
  const invalid=fixture();invalid.pick(10);const before=JSON.stringify(invalid.data);
  assert.throws(()=>invalid.core._runRound());assert.equal(JSON.stringify(invalid.data),before);
});
test('custom names cannot secretly enable preset rules; starting again does not heal',()=>{
  const f=fixture(0,{endurance:12});f.data.enemy.name='Custom §26';f.core._captureFightEffects(f.data);
  assert.equal(f.data.combatEffects.section,0);assert.equal(f.data.endurance,12);assert.equal(f.core._health(f.data),12);
});
test('Laumspur consumes a carried dose after combat, caps healing, and cannot revive',()=>{
  const f=fixture(42,{potions:1,endurance:98});f.data.enemy.endurance=0;f.data.roundsThisBattle=1;
  assert.equal(f.store.potion(f.data),2);assert.equal(f.data.endurance,100);assert.equal(f.data.potions,0);
  f.data.potions=1;f.data.endurance=0;assert.throws(()=>f.store.potion(f.data));assert.equal(f.data.potions,1);
});
test('saved simulator state stays inside its book and original run',()=>{
  const f=fixture();const old=f.data;f.book(325);assert.equal(f.store.data(),null);
  f.book(326);f.run({});assert.notEqual(f.store.data(),old);assert.equal(old.endurance,100);
});
