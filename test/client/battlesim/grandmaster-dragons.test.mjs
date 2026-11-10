import test from 'node:test';
import assert from 'node:assert/strict';
import {readRosterDocument} from '../../helpers/roster-db.cjs';
import {createMagnakaiCombat} from '../../../public/js/battlesim/engines/lone-wolf/magnakai-combat.js';
import {createMagnakaiState} from '../../../public/js/battlesim/engines/lone-wolf/magnakai-state.js';
import {definition} from '../../../public/js/battlesim/books/338/definition.js';
import {COMBAT_TABLE as established} from '../../../public/js/battlesim/engines/lone-wolf/combat-table.js';

const entries=readRosterDocument(338).enemies.map(row=>row.stats.entry);
const rules=Object.fromEntries(entries.map(entry=>[entry.key,entry.rules]));
const table=entries.find(entry=>entry.combatTable).combatTable;
function fixture(section=0,options={}){
  let run={},pick=1,core;
  const store=createMagnakaiState(definition,()=>({currentBookId:338,currentPlaythrough:()=>run,health:core._health}));
  core=createMagnakaiCombat(()=>({...core,COMBAT_TABLE:table,ENCOUNTER_RULES:rules,effectControls:definition.controls,
    numericEffectControls:definition.numericControls,combatOptions:definition.combatOptions,
    _data:store.data,_appendLog:store.appendLog,_recordOutcome:store.recordOutcome,_battleOver:store.battleOver,
    _pick10:()=>Array.isArray(pick)?pick.shift():pick,_renderAll(){},saveState(){},t:key=>key,escapeHtml:String,SVG_SKULL:'',SVG_TROPHY:''}),'battlesim338');
  const entry=entries.find(e=>e.section===section),data=store.data();
  Object.assign(data,{rolled:true,combatSkill:20,combatSkillInitial:20,endurance:100,enduranceInitial:100,
    nextSection:section,nextEncounterKey:entry?.key??'',...options});
  data.enemy={name:entry?.name??'Custom opponent',skill:entry?.skill??20,endurance:entry?.stamina??100,enduranceMax:entry?.stamina??100};
  core._captureFightEffects(data);
  return {get data(){return store.data();},core,pick(value){pick=value;},restore(){run=JSON.parse(JSON.stringify(run));}};
}

test('all 34 printed encounters and the original chart retain distinct values',()=>{
  assert.equal(entries.length,34);assert.deepEqual(table,established);assert.deepEqual(definition.roll,{skill:25,endurance:30});
  assert.deepEqual(entries.filter(e=>[98,167,239,304,311].includes(e.section)).map(e=>[e.section,e.skill,e.stamina]),
    [[98,56,52],[167,30,30],[239,52,50],[304,45,40],[311,34,34]]);
  assert(!definition.controls.some(([key])=>key==='helshezag'));
});
test('single-round lavas combat compares losses, including a tie, without awarding an undefeated enemy win',()=>{
  for(const [pick,route,player,enemy]of [[1,263,5,3],[2,226,4,4],[9,226,0,11]]){
    const f=fixture(303,{combatSkill:45});f.pick(pick);f.core._runRound();
    assert.deepEqual(f.data.combatEffects.lastRoundLoss,{player,enemy});assert.equal(f.data.combatEffects.route,route);
    assert.equal(f.data.roundsThisBattle,1);assert.equal(f.data.history.length,0);
    f.restore();const saved=JSON.stringify(f.data);f.core._runRound();assert.equal(JSON.stringify(f.data),saved);
  }
});
test('single-round comparison includes psychic costs after damage resolution',()=>{
  const f=fixture(303,{combatSkill:45,nextPsychic:'kaiBlast'});f.pick([2,1,1]);f.core._runRound();
  assert.deepEqual(f.data.combatEffects.lastRoundLoss,{player:8,enemy:6});assert.equal(f.data.combatEffects.route,263);
});
test('single-round death and killing victories keep their proper combat outcomes',()=>{
  const dead=fixture(303,{combatSkill:0,endurance:2});dead.pick(1);dead.core._runRound();
  assert.equal(dead.data.history[0].outcome,'loss');assert.notEqual(dead.data.combatEffects.route,226);
  const won=fixture(303,{combatSkill:100});won.pick(0);won.core._runRound();
  assert.equal(won.data.history[0].outcome,'win');assert.equal(won.data.combatEffects.route,226);
});
test('the Plane of Darkness sword bonus and fall penalty apply only to their encounters',()=>{
  const sword=fixture(98,{attackModifier:13,nextSommerwerd:true});assert.equal(sword.core._effectiveSkill(sword.data),37);
  for(const [section,expected]of [[98,24],[239,20],[278,16],[107,20],[183,20]]){
    const f=fixture(section);assert.equal(f.core._effectiveSkill(f.data),expected);assert.equal(f.data.endurance,100);
  }
});
test('printed psychic immunity permits Kai-surge and Kai-blast',()=>{
  for(const section of [9,73,98,144,172,216,239,304,306]){
    for(const mode of ['blast','surge']){const f=fixture(section,{nextPsychic:mode});assert.equal(f.core._psychic(f.data),'none');}
    for(const mode of ['kai','kaiBlast']){const f=fixture(section,{nextPsychic:mode});assert.equal(f.core._psychic(f.data),mode);}
  }
});
test('Roark uses normal combat without automatic undead weapon doubling',()=>{
  for(const section of [39,253]){
    const ordinary=fixture(section,{combatSkill:48}),sword=fixture(section,{combatSkill:48,nextSommerwerd:true});
    ordinary.pick(1);sword.pick(1);ordinary.core._runRound();sword.core._runRound();
    assert.equal(ordinary.data.enemy.endurance,sword.data.enemy.endurance);
  }
});
test('timed horse-scout victory and four-round evasion windows follow the source',()=>{
  for(const [rounds,route]of [[3,85],[4,160]]){
    const f=fixture(33,{roundsThisBattle:rounds});f.data.enemy.endurance=0;f.core._checkBattleEnd(f.data);assert.equal(f.data.combatEffects.route,route);
  }
  for(const [section,route]of [[50,335],[63,182],[336,182]]){
    const f=fixture(section,{roundsThisBattle:3});assert.equal(f.core._escapeRoute(f.data),0);f.data.roundsThisBattle=4;assert.equal(f.core._escapeRoute(f.data),route);
  }
});
test('custom fights remain available without selecting a printed encounter',()=>{
  const f=fixture();f.data.enemy.endurance=1;f.pick(0);f.core._runRound();assert.equal(f.data.history[0].outcome,'win');
});
