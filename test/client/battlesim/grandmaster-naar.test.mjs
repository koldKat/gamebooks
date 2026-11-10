import test from 'node:test';
import assert from 'node:assert/strict';
import {readRosterDocument} from '../../helpers/roster-db.cjs';
import {createMagnakaiCombat} from '../../../public/js/battlesim/engines/lone-wolf/magnakai-combat.js';
import {createMagnakaiState} from '../../../public/js/battlesim/engines/lone-wolf/magnakai-state.js';
import {definition} from '../../../public/js/battlesim/books/340/definition.js';
import {COMBAT_TABLE} from '../../../public/js/battlesim/engines/lone-wolf/combat-table.js';

const entries=readRosterDocument(340).enemies.map(row=>row.stats.entry);
const rules=Object.fromEntries(entries.map(entry=>[entry.key,entry.rules]));
function fixture(section=0,options={}) {
  let run={},core,pick=1;
  const store=createMagnakaiState(definition,()=>({currentBookId:340,currentPlaythrough:()=>run,health:core._health}));
  core=createMagnakaiCombat(()=>({...core,COMBAT_TABLE,ENCOUNTER_RULES:rules,effectControls:definition.controls,
    numericEffectControls:definition.numericControls,combatOptions:definition.combatOptions,
    _data:store.data,_appendLog:store.appendLog,_recordOutcome:store.recordOutcome,_battleOver:store.battleOver,
    _pick10:()=>Array.isArray(pick)?pick.shift():pick,_renderAll(){},saveState(){},t:key=>key,escapeHtml:String,SVG_SKULL:'',SVG_TROPHY:''}),'battlesim340');
  const entry=entries.find(e=>e.section===section),d=store.data();
  Object.assign(d,{rolled:true,combatSkill:entry?.skill??20,combatSkillInitial:20,endurance:100,enduranceInitial:100,
    nextSection:section,nextEncounterKey:entry?.key??'',...options});
  d.enemy={name:entry?.name??'Custom opponent',skill:entry?.skill??20,endurance:entry?.stamina??100,enduranceMax:entry?.stamina??100};
  core._captureFightEffects(d);
  return {core,get data(){return store.data();},pick(value){pick=value;},restore(){run=JSON.parse(JSON.stringify(run));}};
}
test('26 printed encounters use the established chart and editable custom fights',()=>{
  assert.equal(entries.length,26);assert.deepEqual(entries[0].combatTable,COMBAT_TABLE);
  assert.equal(fixture().data.enemy.endurance,100);assert.equal(definition.allowCombatPsychicChanges,true);
});
test('Kai-ray deals fifteen extra damage once and costs four EP, including after restoration',()=>{
  const f=fixture(0,{nextPsychic:'kaiRay'});f.core._runRound();
  assert.equal(f.data.enemy.endurance,82);assert.equal(f.data.endurance,91);
  f.restore();assert.equal(f.core._psychic(f.data),'none');f.core._runRound();
  assert.equal(f.data.enemy.endurance,79);assert.equal(f.data.endurance,86);
  f.core._captureFightEffects(f.data);assert.equal(f.core._psychic(f.data),'kaiRay');
});
test('Kai-ray requires strictly more than ten EP',()=>{
  for(const [ep,power]of [[10,'none'],[11,'kaiRay']]) {
    const f=fixture(0,{endurance:ep,nextPsychic:'kaiRay'});assert.equal(f.core._psychic(f.data),power);
    f.core._runRound();assert.equal(f.data.endurance,ep-(power==='none'?5:9));
  }
});
test('evasion neither spends nor charges the limited attack',()=>{
  const f=fixture(0,{nextPsychic:'kaiRay'});f.core._runRound(true);
  assert.equal(f.data.enemy.endurance,100);assert.equal(f.data.endurance,95);
  assert.equal(f.core._psychic(f.data),'kaiRay');
});
test('changing psychic attacks never combines bonuses or resets a spent ray',()=>{
  const f=fixture(0,{nextPsychic:'kaiRay'});f.core._runRound();
  f.data.combatEffects.psychic='blast';assert.equal(f.core._effectiveSkill(f.data),24);
  f.core._runRound();assert.equal(f.data.enemy.endurance,77);assert.equal(f.data.endurance,87);
  f.data.combatEffects.psychic='kaiRay';assert.equal(f.core._psychic(f.data),'none');
});
test('Avagnids block Kai-blast but allow Kai-ray; explicit total immunity blocks both',()=>{
  for(const section of [30,94,197]) {
    assert.equal(fixture(section,{nextPsychic:'kaiBlast'}).core._psychic(fixture(section,{nextPsychic:'kaiBlast'}).data),'none');
    const f=fixture(section,{nextPsychic:'kaiRay'});assert.equal(f.core._psychic(f.data),'kaiRay');
  }
  for(const section of [32,147,254,310]) {
    const f=fixture(section,{nextPsychic:'kaiRay'});assert.equal(f.core._psychic(f.data),'none');
  }
});
test('Dragonlord thresholds return to the reader without a killing victory',()=>{
  for(const [section,route]of [[64,344],[185,70]]) {
    const f=fixture(section,{nextPsychic:'kaiRay'});f.data.enemy.endurance=21;f.core._runRound();
    assert.equal(f.data.combatEffects.route,route);assert.equal(f.data.history.length,0);
  }
  const f=fixture(64);assert.equal(f.core._escapeRule(f.data),undefined);
  f.data.roundsThisBattle=3;assert.equal(f.core._escapeRule(f.data).route,155);
  const locked=fixture(185);locked.data.roundsThisBattle=20;assert.equal(locked.core._escapeRule(locked.data),undefined);
});
test('printed sword, diamond, animal and burning-weapon bonuses remain distinct',()=>{
  const dragon=fixture(64,{nextBlueDiamond:true,nextSkarnSka:true});assert.equal(dragon.core._effectiveSkill(dragon.data),61);
  const vine=fixture(193,{nextAnimal:true});assert.equal(vine.core._effectiveSkill(vine.data),51);
  const fire=fixture(299,{nextAnimal:true});assert.equal(fire.core._effectiveSkill(fire.data),52);
  const sword=fixture(211);assert.equal(sword.core._effectiveSkill(sword.data),63);
});
test('Muntaag vulnerability and the Sommerswerd branch double direct psychic damage',()=>{
  for(const [section,expected]of [[212,7],[318,7],[121,22]]) {
    const f=fixture(section,{nextPsychic:'kaiRay'});f.core._runRound();assert.equal(f.data.enemy.endurance,expected);
  }
});
test('Kekataag protection includes psychic costs in the first two rounds',()=>{
  const f=fixture(282,{nextPsychic:'kaiRay'});f.core._runRound();assert.equal(f.data.endurance,100);
  f.core._runRound();assert.equal(f.data.endurance,100);f.core._runRound();assert.equal(f.data.endurance,95);
});
