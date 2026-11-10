import test from 'node:test';
import assert from 'node:assert/strict';
import {readRosterDocument} from '../../helpers/roster-db.cjs';
import {createMagnakaiCombat} from '../../../public/js/battlesim/engines/lone-wolf/magnakai-combat.js';
import {createMagnakaiState} from '../../../public/js/battlesim/engines/lone-wolf/magnakai-state.js';
import {definition} from '../../../public/js/battlesim/books/335/definition.js';
import {COMBAT_TABLE as established} from '../../../public/js/battlesim/engines/lone-wolf/combat-table.js';

const entries=readRosterDocument(335).enemies.map(row=>row.stats.entry);
const rules=Object.fromEntries(entries.map(entry=>[entry.key,entry.rules]));
const table=entries.find(entry=>entry.combatTable).combatTable;
function fixture(section=0,options={}){
  let run={},pick=1,core;
  const store=createMagnakaiState(definition,()=>({currentBookId:335,currentPlaythrough:()=>run,health:core._health}));
  core=createMagnakaiCombat(()=>({...core,COMBAT_TABLE:table,ENCOUNTER_RULES:rules,effectControls:definition.controls,
    numericEffectControls:definition.numericControls,combatOptions:definition.combatOptions,
    _data:store.data,_appendLog:store.appendLog,_recordOutcome:store.recordOutcome,_battleOver:store.battleOver,
    _pick10:()=>pick,_renderAll(){},saveState(){},t:key=>key,escapeHtml:String,SVG_SKULL:'',SVG_TROPHY:''}),'battlesim335');
  const entry=entries.find(e=>e.section===section),data=store.data();
  Object.assign(data,{rolled:true,combatSkill:20,combatSkillInitial:20,endurance:100,enduranceInitial:100,
    nextSection:section,nextEncounterKey:entry?.key??'',...options});
  data.enemy={name:entry?.name??'Custom opponent',skill:entry?.skill??20,endurance:entry?.stamina??100,enduranceMax:entry?.stamina??100};
  core._captureFightEffects(data);
  return {get data(){return store.data();},core,pick(value){pick=value;},restore(){run=JSON.parse(JSON.stringify(run));}};
}

test('34 printed encounters retain the original combat chart and starting stats',()=>{
  assert.equal(entries.length,34);assert.equal(new Set(entries.map(e=>e.section)).size,34);
  assert.deepEqual(table,established);assert.deepEqual(definition.roll,{skill:25,endurance:30});
  assert.deepEqual(entries.filter(e=>[121,154,179,297].includes(e.section)).map(e=>[e.section,e.skill,e.stamina]),
    [[121,43,50],[154,34,36],[179,50,36],[297,38,50]]);
});
test('Mawtaw ignores Mindblast/Psi-surge and permits only one Kai-surge skill point',()=>{
  for(const s of [121,297])for(const [power,bonus]of [['blast',0],['surge',0],['kai',1]]){
    const f=fixture(s,{nextPsychic:power});assert.equal(f.core._effectiveSkill(f.data),20+bonus);
  }
});
test('Strength adds five CS/current EP/maximum EP once and survives saved-fight restoration',()=>{
  for(const s of [121,297]){
    const f=fixture(s,{endurance:8,nextStrength:true});assert.equal(f.data.endurance,13);assert.equal(f.data.enduranceInitial,105);assert.equal(f.core._effectiveSkill(f.data),25);
    f.restore();assert.equal(f.data.endurance,13);assert.equal(f.core._effectiveSkill(f.data),25);
    const plain=fixture(s);assert.equal(plain.data.enduranceInitial,100);assert.equal(plain.core._effectiveSkill(plain.data),20);
  }
  for(const s of [0,6]){const f=fixture(s,{nextStrength:true});assert.equal(f.data.endurance,100);assert.equal(f.data.enduranceInitial,100);assert.equal(f.core._effectiveSkill(f.data),s===6?23:20);}
});
test('Strength expires after victory with a living minimum of one, and never revives a loss',()=>{
  for(const ep of [1,5,6,8]){
    const f=fixture(121,{nextStrength:true});f.data.endurance=ep;f.data.enemy.endurance=0;f.core._checkBattleEnd(f.data);
    assert.equal(f.data.endurance,Math.max(1,ep-5));assert.equal(f.data.enduranceInitial,100);assert.equal(f.core._effectiveSkill(f.data),20);
    assert.equal(f.data.combatEffects.route,24);assert.equal(f.data.history[0].outcome,'win');
    f.restore();f.core._finishCombatEffects(f.data);assert.equal(f.data.endurance,Math.max(1,ep-5));
  }
  const dead=fixture(297,{nextStrength:true});dead.data.endurance=0;dead.core._checkBattleEnd(dead.data);
  assert.equal(dead.data.endurance,0);assert.equal(dead.data.enduranceInitial,100);assert.equal(dead.data.history[0].outcome,'loss');
});
test('manual completion removes Strength once while preserving permanent ENDURANCE loss',()=>{
  const f=fixture(121,{nextStrength:true});f.core._permanentLoss(f.data,2);assert.equal(f.data.enduranceInitial,103);
  f.data.endurance=20;f.data.combatEffects.finished=true;f.core._finishCombatEffects(f.data);
  assert.equal(f.data.enduranceInitial,98);assert.equal(f.data.endurance,15);assert.equal(f.data.history.length,0);
  f.core._finishCombatEffects(f.data);assert.equal(f.data.endurance,15);
  const base=fixture(121,{endurance:1,enduranceInitial:1,nextStrength:true});base.core._permanentLoss(base.data,1);assert.equal(base.data.endurance,0);
});
test('Sergeant surprise ignores every first-round EP loss, including psychic cost and table K',()=>{
  for(const s of [198,232])for(const power of ['none','blast','surge','kai']){
    const f=fixture(s,{combatSkill:0,nextPsychic:power});f.core._runRound();assert.equal(f.data.endurance,100);
    assert.equal(f.data.history.length,0);f.core._runRound();assert(f.data.endurance<100);
  }
});
test('Gorodons stop after six unfinished rounds without awarding the scripted rescue as a win',()=>{
  const f=fixture(44,{combatSkill:46,roundsThisBattle:5});f.core._runRound();assert.equal(f.data.combatEffects.route,155);assert.equal(f.data.history.length,0);
  const ep=f.data.endurance;f.core._runRound();assert.equal(f.data.endurance,ep);
  const win=fixture(44,{combatSkill:100,roundsThisBattle:5});win.data.enemy.endurance=1;win.pick(0);win.core._runRound();assert.equal(win.data.combatEffects.route,264);assert.equal(win.data.history[0].outcome,'win');
  for(const [rounds,route]of [[2,35],[3,160]]){const g=fixture(254,{combatSkill:100,roundsThisBattle:rounds});g.pick(0);g.core._runRound();assert.equal(g.data.combatEffects.route,route);}
});
test('position, surprise and Animal Mastery modifiers last only their printed rounds',()=>{
  for(const [s,delta,rounds]of [[6,3,null],[244,-10,2],[335,-3,1]]){
    const f=fixture(s);assert.equal(f.core._effectiveSkill(f.data),20+delta);
    if(rounds){f.data.roundsThisBattle=rounds;assert.equal(f.core._effectiveSkill(f.data),20);}
  }
  for(const flag of [false,true]){
    const f=fixture(305,{nextPathsmanship:flag});assert.equal(f.core._effectiveSkill(f.data),flag?20:17);f.data.roundsThisBattle=1;assert.equal(f.core._effectiveSkill(f.data),20);
    const a=fixture(249,{nextAnimal:flag});assert.equal(a.core._effectiveSkill(a.data),flag?22:20);
  }
});
test('Akataz double psychic bonuses and Antah Wasps reject every psychic power',()=>{
  for(const s of [32,250])for(const [power,bonus]of [['blast',4],['surge',6],['kai',8]]){
    const f=fixture(s,{nextPsychic:power});assert.equal(f.core._effectiveSkill(f.data),20+bonus*2);
  }
  for(const power of ['blast','surge','kai']){const f=fixture(281,{nextPsychic:power});assert.equal(f.core._psychic(f.data),'none');}
});
