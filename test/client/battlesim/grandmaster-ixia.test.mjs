import test from 'node:test';
import assert from 'node:assert/strict';
import {readRosterDocument} from '../../helpers/roster-db.cjs';
import {createMagnakaiCombat} from '../../../public/js/battlesim/engines/lone-wolf/magnakai-combat.js';
import {createMagnakaiState} from '../../../public/js/battlesim/engines/lone-wolf/magnakai-state.js';
import {definition} from '../../../public/js/battlesim/books/337/definition.js';
import {COMBAT_TABLE as established} from '../../../public/js/battlesim/engines/lone-wolf/combat-table.js';

const entries=readRosterDocument(337).enemies.map(row=>row.stats.entry);
const rules=Object.fromEntries(entries.map(entry=>[entry.key,entry.rules]));
const table=entries.find(entry=>entry.combatTable).combatTable;
function fixture(section=0,options={}){
  let run={},pick=1,core;
  const store=createMagnakaiState(definition,()=>({currentBookId:337,currentPlaythrough:()=>run,health:core._health}));
  core=createMagnakaiCombat(()=>({...core,COMBAT_TABLE:table,ENCOUNTER_RULES:rules,effectControls:definition.controls,
    numericEffectControls:definition.numericControls,combatOptions:definition.combatOptions,
    _data:store.data,_appendLog:store.appendLog,_recordOutcome:store.recordOutcome,_battleOver:store.battleOver,
    _pick10:()=>Array.isArray(pick)?pick.shift():pick,_renderAll(){},saveState(){},t:key=>key,escapeHtml:String,SVG_SKULL:'',SVG_TROPHY:''}),'battlesim337');
  const entry=entries.find(e=>e.section===section),data=store.data();
  Object.assign(data,{rolled:true,combatSkill:20,combatSkillInitial:20,endurance:100,enduranceInitial:100,
    nextSection:section,nextEncounterKey:entry?.key??'',...options});
  data.enemy={name:entry?.name??'Custom opponent',skill:entry?.skill??20,endurance:entry?.stamina??100,enduranceMax:entry?.stamina??100};
  core._captureFightEffects(data);
  return {get data(){return store.data();},core,pick(value){pick=value;},restore(){run=JSON.parse(JSON.stringify(run));}};
}

test('all 52 printed table encounters retain their original stats and combat chart',()=>{
  assert.equal(entries.length,52);assert.deepEqual(table,established);assert.deepEqual(definition.roll,{skill:25,endurance:30});
  assert.deepEqual(entries.filter(e=>[74,77,214,239,347].includes(e.section)).map(e=>[e.section,e.skill,e.stamina]),
    [[74,40,50],[77,60,39],[214,60,39],[239,46,55],[347,49,52]]);
});
test('Sommerswerd and Dessi Stone double weapon damage against undead without stacking',()=>{
  for(const [sommerwerd,dessi]of [[false,false],[true,false],[false,true],[true,true]]){
    const f=fixture(23,{combatSkill:46,nextSommerwerd:sommerwerd,nextDessiStone:dessi});f.pick(1);f.core._runRound();
    assert.equal(f.data.enemy.endurance,55-(sommerwerd||dessi?6:3));
    const living=fixture(27,{combatSkill:40,nextSommerwerd:sommerwerd,nextDessiStone:dessi});living.pick(1);living.core._runRound();assert.equal(living.data.enemy.endurance,41);
  }
});
test('weapon doubling leaves Kai-blast damage separate and works for custom undead',()=>{
  const f=fixture(23,{combatSkill:46,nextDessiStone:true,nextPsychic:'kaiBlast'});f.pick([1,1,2]);f.core._runRound();assert.equal(f.data.enemy.endurance,46);assert.equal(f.data.endurance,91);
  for(const undead of [false,true]){
    const custom=fixture(0,{nextDessiStone:true,nextEnemyUndead:undead});custom.pick(1);custom.core._runRound();assert.equal(custom.data.enemy.endurance,undead?94:97);
  }
});
test('Sommerswerd redirects forbidden Kajarda encounters to the reader without a fight or reward',()=>{
  for(const section of [96,287]){
    const f=fixture(section,{nextSommerwerd:true});assert.equal(f.data.combatEffects.route,238);assert.equal(f.data.roundsThisBattle,0);assert.equal(f.data.history.length,0);
    const saved=JSON.stringify(f.data);f.core._runRound();assert.equal(JSON.stringify(f.data),saved);f.restore();assert.equal(f.data.combatEffects.route,238);
    const ordinary=fixture(section);assert(!ordinary.data.combatEffects.finished);
  }
});
test('Tagazin threshold stops never award a killing victory, even for a table K',()=>{
  for(const section of [45,216,341])for(const skill of [55,100]){
    const f=fixture(section,{combatSkill:skill});f.data.enemy.endurance=27;f.pick(skill===100?0:1);f.core._runRound();assert.equal(f.data.combatEffects.route,168);assert.equal(f.data.history.length,0);
  }
});
test('one-round and two-round encounters preserve separate outcomes and resumed rounds',()=>{
  for(const [section,rounds,route,win]of [[53,2,218,252],[230,1,301,33]]){
    const f=fixture(section,{combatSkill:45,roundsThisBattle:rounds-1});f.pick(1);f.core._runRound();assert.equal(f.data.combatEffects.route,route);assert.equal(f.data.history.length,0);
    const killed=fixture(section,{combatSkill:100,roundsThisBattle:rounds-1});killed.data.enemy.endurance=1;killed.pick(0);killed.core._runRound();assert.equal(killed.data.combatEffects.route,win);assert.equal(killed.data.history[0].outcome,'win');
  }
});
test('Cabalah immunity, undead psychic vulnerability and opening protection retain printed scope',()=>{
  for(const section of [35,130,167,264,281])for(const mode of ['blast','surge','kai']){const f=fixture(section,{nextPsychic:mode});assert.equal(f.core._psychic(f.data),'none');}
  for(const section of [31,279]){const f=fixture(section,{nextPsychic:'kai'});assert.equal(f.core._effectiveSkill(f.data),36);}
  for(const section of [110,167]){const f=fixture(section,{combatSkill:0,nextPsychic:'kaiBlast'});f.pick([1,1,1]);f.core._runRound();assert.equal(f.data.endurance,100);f.pick([1,1,1]);f.core._runRound();assert.equal(f.data.endurance,100);}
});
test('door fatigue tables ignore equipment and psychic powers and never award a combat win',()=>{
  for(const section of [74,81]){
    const f=fixture(section,{combatSkill:40,attackModifier:99,nextDessiStone:true,nextFlame:true,nextPsychic:'kaiBlast'});assert.equal(f.core._effectiveSkill(f.data),40);assert.equal(f.core._psychic(f.data),'none');
    f.data.enemy.endurance=1;f.pick(0);f.core._runRound();assert.equal(f.data.combatEffects.route,327);assert.equal(f.data.history.length,0);
  }
});
test('unarmed guards and climbing combat exclude only the printed equipment and rank modifiers',()=>{
  for(const section of [243,336]){const f=fixture(section,{attackModifier:99,nextDessiStone:true,nextSommerwerd:true,nextFlame:true});assert.equal(f.core._effectiveSkill(f.data),20);}
  for(const section of [67,137])for(const rank of [false,true]){const f=fixture(section,{nextSunLord:rank});assert.equal(f.core._effectiveSkill(f.data),rank?20:16);}
});
test('timed Kajarda and marines victories, Cabalah weapon routes and distinct escape windows are retained',()=>{
  for(const [section,limit,early,late]of [[96,6,32,213],[125,6,32,213],[287,6,32,213],[260,5,37,124]])for(const rounds of [limit-1,limit]){
    const f=fixture(section,{combatSkill:100,roundsThisBattle:rounds});f.data.enemy.endurance=1;f.pick(0);f.core._runRound();assert.equal(f.data.combatEffects.route,rounds<limit?early:late);
  }
  for(const section of [35,281])for(const sword of [false,true]){const f=fixture(section,{nextSommerwerd:sword});f.data.enemy.endurance=0;f.core._checkBattleEnd(f.data);assert.equal(f.data.combatEffects.route,sword?173:293);}
  for(const [section,minimum]of [[89,3],[110,3],[275,4]]){const f=fixture(section,{roundsThisBattle:minimum-1});assert.equal(f.core._escapeRoute(f.data),0);f.data.roundsThisBattle++;assert.equal(f.core._escapeRoute(f.data),56);}
});

