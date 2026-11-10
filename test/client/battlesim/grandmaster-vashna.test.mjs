import test from 'node:test';
import assert from 'node:assert/strict';
import {readRosterDocument} from '../../helpers/roster-db.cjs';
import {createMagnakaiCombat} from '../../../public/js/battlesim/engines/lone-wolf/magnakai-combat.js';
import {createMagnakaiState} from '../../../public/js/battlesim/engines/lone-wolf/magnakai-state.js';
import {definition} from '../../../public/js/battlesim/books/336/definition.js';
import {COMBAT_TABLE as established} from '../../../public/js/battlesim/engines/lone-wolf/combat-table.js';

const entries=readRosterDocument(336).enemies.map(row=>row.stats.entry);
const rules=Object.fromEntries(entries.map(entry=>[entry.key,entry.rules]));
const table=entries.find(entry=>entry.combatTable).combatTable;
function fixture(section=0,options={}){
  let run={},pick=1,core;
  const store=createMagnakaiState(definition,()=>({currentBookId:336,currentPlaythrough:()=>run,health:core._health}));
  core=createMagnakaiCombat(()=>({...core,COMBAT_TABLE:table,ENCOUNTER_RULES:rules,effectControls:definition.controls,
    numericEffectControls:definition.numericControls,combatOptions:definition.combatOptions,
    _data:store.data,_appendLog:store.appendLog,_recordOutcome:store.recordOutcome,_battleOver:store.battleOver,
    _pick10:()=>Array.isArray(pick)?pick.shift():pick,_renderAll(){},saveState(){},t:key=>key,escapeHtml:String,SVG_SKULL:'',SVG_TROPHY:''}),'battlesim336');
  const entry=entries.find(e=>e.section===section),data=store.data();
  Object.assign(data,{rolled:true,combatSkill:20,combatSkillInitial:20,endurance:100,enduranceInitial:100,
    nextSection:section,nextEncounterKey:entry?.key??'',...options});
  data.enemy={name:entry?.name??'Custom opponent',skill:entry?.skill??20,endurance:entry?.stamina??100,enduranceMax:entry?.stamina??100};
  core._captureFightEffects(data);
  return {get data(){return store.data();},core,pick(value){pick=value;},restore(){run=JSON.parse(JSON.stringify(run));}};
}

test('35 printed encounters retain the native combat chart and Grand Master starting stats',()=>{
  assert.equal(entries.length,35);assert.deepEqual(table,established);
  assert.deepEqual(definition.roll,{skill:25,endurance:30});
  assert.deepEqual(entries.filter(e=>[14,216,334,345].includes(e.section)).map(e=>[e.section,e.skill,e.stamina]),
    [[14,33,32],[216,55,42],[334,38,60],[345,40,45]]);
});
test('Sun Lord weapon flames add one only to successful, nonescape weapon rounds',()=>{
  for(const flame of [false,true]){
    const f=fixture(0,{nextFlame:flame});f.pick(1);f.core._runRound();
    assert.equal(f.data.enemy.endurance,97-(flame?1:0));
    const miss=fixture(0,{combatSkill:0,nextFlame:flame});miss.pick(1);miss.core._runRound();assert.equal(miss.data.enemy.endurance,100);
    const escape=fixture(0,{nextFlame:flame});escape.pick(1);escape.core._runRound(true);assert.equal(escape.data.enemy.endurance,100);
  }
});
test('Kai-blast uses two draws, counts zero as one and replaces every psychic CS bonus',()=>{
  const f=fixture(0,{nextPsychic:'kaiBlast'});assert.equal(f.core._effectiveSkill(f.data),20);
  f.pick([1,0,9]);f.core._runRound();assert.equal(f.data.enemy.endurance,87);assert.equal(f.data.endurance,91);
  f.restore();assert.equal(f.core._psychic(f.data),'kaiBlast');
  const low=fixture(0,{endurance:3,nextPsychic:'kaiBlast'});low.pick([1,0,0]);low.core._runRound();assert.equal(low.data.endurance,0);assert.equal(low.data.history[0].outcome,'loss');
});
test('Cheghath halve psychic CS and Kai-blast damage without inventing rounding',()=>{
  for(const section of [97,132]){
    for(const [mode,bonus]of [['blast',2],['surge',3],['kai',4]]){
      const f=fixture(section,{nextPsychic:mode});assert.equal(f.core._effectiveSkill(f.data),20+bonus);
    }
    const f=fixture(section,{combatSkill:37,nextPsychic:'kaiBlast'});f.pick([1,2,3]);f.core._runRound();assert.equal(f.data.enemy.endurance,34.5);
  }
});
test('Cadak permits Kai-surge and Kai-blast; Automatons permit only Kai-blast',()=>{
  for(const section of [54,123,135,267,334]){
    for(const mode of ['blast','surge']){const f=fixture(section,{nextPsychic:mode});assert.equal(f.core._psychic(f.data),'none');}
    const k=fixture(section,{nextPsychic:'kai'});assert.equal(k.core._psychic(k.data),section===334?'none':'kai');
    const b=fixture(section,{nextPsychic:'kaiBlast'});assert.equal(b.core._psychic(b.data),'kaiBlast');
  }
});
test('Vortexi rank bonus is explicit and entry wounds or healing are not silently applied',()=>{
  for(const section of [36,103,118,142,206,229,284,305]){
    const f=fixture(section,{nextRanksAboveGrandGuardian:2,nextSommerwerd:true});assert.equal(f.core._effectiveSkill(f.data),24);assert.equal(f.data.endurance,100);
  }
});
test('mounted combat, surprise and Crypt Spawn penalties retain their printed scope',()=>{
  for(const section of [11,99,208])for(const enabled of [false,true]){
    const f=fixture(section,{nextTrainedMountedCombat:enabled});assert.equal(f.core._effectiveSkill(f.data),enabled?20:15);
  }
  for(const [section,penalty,rounds]of [[39,-5,3],[48,-10,1],[257,-10,1],[306,-5,1],[336,-10,1],[232,-4,null]]){
    const f=fixture(section);assert.equal(f.core._effectiveSkill(f.data),20+penalty);
    if(rounds){f.data.roundsThisBattle=rounds;assert.equal(f.core._effectiveSkill(f.data),20);}
  }
  const f=fixture(39,{nextHuntmastery:true});assert.equal(f.core._effectiveSkill(f.data),20);
});
test('captain stops before a sixth round without awarding a scripted victory',()=>{
  const f=fixture(14,{combatSkill:33,roundsThisBattle:4});f.pick(1);f.core._runRound();assert.equal(f.data.combatEffects.route,145);assert.equal(f.data.history.length,0);
  const win=fixture(14,{combatSkill:100,roundsThisBattle:4});win.data.enemy.endurance=1;win.pick(0);win.core._runRound();assert.equal(win.data.combatEffects.route,25);assert.equal(win.data.history[0].outcome,'win');
});
test('Deathstaff adjustment and victory route use the captured weapon choice',()=>{
  for(const selected of [false,true]){
    const f=fixture(345,{nextDeathstaff:selected});assert.equal(f.core._effectiveSkill(f.data),selected?30:20);
    f.data.nextDeathstaff=!selected;f.restore();f.data.enemy.endurance=0;f.core._checkBattleEnd(f.data);
    assert.equal(f.data.combatEffects.route,selected?26:324);assert.equal(f.data.history[0].outcome,'win');
  }
});

