import test from 'node:test';
import assert from 'node:assert/strict';
import {readRosterDocument} from '../../helpers/roster-db.cjs';
import {createMagnakaiCombat} from '../../../public/js/battlesim/engines/lone-wolf/magnakai-combat.js';
import {createMagnakaiState} from '../../../public/js/battlesim/engines/lone-wolf/magnakai-state.js';
import {definition} from '../../../public/js/battlesim/books/334/definition.js';
import {COMBAT_TABLE as established} from '../../../public/js/battlesim/engines/lone-wolf/combat-table.js';

const entries=readRosterDocument(334).enemies.map(row=>row.stats.entry);
const rules=Object.fromEntries(entries.map(entry=>[entry.key,entry.rules]));
const table=entries.find(entry=>entry.combatTable).combatTable;
function fixture(section=0,options={}){
  let run={},pick=1,core;
  const store=createMagnakaiState(definition,()=>({currentBookId:334,currentPlaythrough:()=>run,health:core._health}));
  core=createMagnakaiCombat(()=>({...core,COMBAT_TABLE:table,ENCOUNTER_RULES:rules,effectControls:definition.controls,
    numericEffectControls:definition.numericControls,combatOptions:definition.combatOptions,
    _data:store.data,_appendLog:store.appendLog,_recordOutcome:store.recordOutcome,_battleOver:store.battleOver,
    _pick10:()=>pick,_renderAll(){},saveState(){},t:key=>key,escapeHtml:String,SVG_SKULL:'',SVG_TROPHY:''}),'battlesim334');
  const entry=entries.find(e=>e.section===section),data=store.data();
  Object.assign(data,{rolled:true,combatSkill:20,combatSkillInitial:20,endurance:100,enduranceInitial:100,
    nextSection:section,nextEncounterKey:entry?.key??'',...options});
  data.enemy={name:entry?.name??'Custom opponent',skill:entry?.skill??20,endurance:entry?.stamina??100,enduranceMax:entry?.stamina??100};
  core._captureFightEffects(data);
  return {get data(){return store.data();},core,pick(value){pick=value;},restore(){run=JSON.parse(JSON.stringify(run));}};
}

test('all 41 printed encounters retain their chart and Grand Master starting stats',()=>{
  assert.equal(entries.length,41);assert.equal(new Set(entries.map(e=>e.section)).size,41);
  assert.deepEqual(table,established);assert.deepEqual(definition.roll,{skill:25,endurance:30});
  assert.deepEqual(entries.filter(e=>[62,128,229].includes(e.section)).map(e=>[e.section,e.skill,e.stamina]),
    [[62,52,60],[128,52,60],[229,42,40]]);
});
test('Zavaghar stops below 12 living EP before victory without awarding a battle win',()=>{
  for(const ep of [1,11])for(const enemyEP of [0,60]){
    const f=fixture(128,{endurance:ep});f.data.enemy.endurance=enemyEP;f.core._checkBattleEnd(f.data);
    assert.equal(f.data.combatEffects.route,105);assert.equal(f.data.history.length,0);
    f.restore();f.core._runRound();assert.equal(f.data.history.length,0);
  }
  const alive=fixture(128,{endurance:12});alive.core._checkBattleEnd(alive.data);assert.equal(alive.data.combatEffects.finished,undefined);
  alive.data.enemy.endurance=0;alive.core._checkBattleEnd(alive.data);assert.equal(alive.data.combatEffects.route,248);assert.equal(alive.data.history[0].outcome,'win');
  const dead=fixture(128,{endurance:0});dead.core._checkBattleEnd(dead.data);assert.equal(dead.data.history[0].outcome,'loss');assert.notEqual(dead.data.combatEffects.route,105);
});
test('psychic immunities and half-strength Kai-surge use the selected power only',()=>{
  for(const s of [14,126])for(const power of ['blast','surge','kai']){
    const f=fixture(s,{nextPsychic:power});assert.equal(f.core._psychic(f.data),'none');
  }
  for(const [power,bonus]of [['blast',0],['surge',0],['kai',4]]){
    const f=fixture(229,{nextPsychic:power});assert.equal(f.core._effectiveSkill(f.data),20+bonus);
  }
});
test('vulnerable creatures double psychic bonuses, with the Kraan rank requirement',()=>{
  for(const s of [135,286,318,334])for(const [power,bonus]of [['blast',4],['surge',6],['kai',8]]){
    const f=fixture(s,{nextPsychic:power});assert.equal(f.core._effectiveSkill(f.data),20+2*bonus);
  }
  for(const s of [279,303])for(const flag of [false,true])for(const [power,bonus]of [['blast',4],['surge',6],['kai',8]]){
    const f=fixture(s,{nextGuardianKai:flag,nextPsychic:power});assert.equal(f.core._effectiveSkill(f.data),20+bonus*(flag?2:1));
  }
});
test('Sommerswerd adds the extra eight only and defending Banedon costs three CS',()=>{
  for(const s of [62,263])for(const sword of [false,true]){
    const f=fixture(s,{attackModifier:13,nextSommerwerd:sword});assert.equal(f.core._effectiveSkill(f.data),33+(sword?8:0));
  }
  const f=fixture(182,{attackModifier:5,nextPsychic:'blast'});assert.equal(f.core._effectiveSkill(f.data),26);
});
test('Nadziran psychic assault costs two every round, including rounds with zero table wounds',()=>{
  for(const s of [169,211])for(const screen of [false,true]){
    const f=fixture(s,{combatSkill:100,nextScreen:screen});f.pick(0);f.core._runRound();assert.equal(f.data.endurance,screen?100:98);
  }
});
test('winning speed chooses the printed continuation at its exact round boundary',()=>{
  for(const [s,boundary,early,late]of [[118,3,79,284],[135,4,13,264],[195,3,295,206],[286,4,13,264],[334,4,13,264]]){
    for(const [rounds,route]of [[boundary-1,early],[boundary,late]]){
      const f=fixture(s,{combatSkill:100,roundsThisBattle:rounds});f.pick(0);f.core._runRound();assert.equal(f.data.combatEffects.route,route);assert.equal(f.data.history.length,1);
    }
  }
});
test('Plaak evasion becomes optional after three rounds and does not record a win',()=>{
  const f=fixture(126,{combatSkill:39,roundsThisBattle:2});assert.equal(f.core._escapeRoute(f.data),0);
  f.data.roundsThisBattle=3;assert.equal(f.core._escapeRoute(f.data),138);f.core._escape();
  assert.equal(f.data.endurance,95);assert.equal(f.data.enemy.endurance,20);assert.equal(f.data.combatEffects.route,138);assert.equal(f.data.history.length,0);
});
