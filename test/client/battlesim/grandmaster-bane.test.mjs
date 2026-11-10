import test from 'node:test';
import assert from 'node:assert/strict';
import {readRosterDocument} from '../../helpers/roster-db.cjs';
import {createMagnakaiCombat} from '../../../public/js/battlesim/engines/lone-wolf/magnakai-combat.js';
import {createMagnakaiState} from '../../../public/js/battlesim/engines/lone-wolf/magnakai-state.js';
import {definition} from '../../../public/js/battlesim/books/339/definition.js';
import {COMBAT_TABLE as established} from '../../../public/js/battlesim/engines/lone-wolf/combat-table.js';

const entries=readRosterDocument(339).enemies.map(row=>row.stats.entry);
const rules=Object.fromEntries(entries.map(entry=>[entry.key,entry.rules]));
const table=entries.find(entry=>entry.combatTable).combatTable;
function fixture(section=0,options={}){
  let run={},pick=1,core;
  const store=createMagnakaiState(definition,()=>({currentBookId:339,currentPlaythrough:()=>run,health:core._health}));
  core=createMagnakaiCombat(()=>({...core,COMBAT_TABLE:table,ENCOUNTER_RULES:rules,effectControls:definition.controls,
    numericEffectControls:definition.numericControls,combatOptions:definition.combatOptions,
    _data:store.data,_appendLog:store.appendLog,_recordOutcome:store.recordOutcome,_battleOver:store.battleOver,
    _pick10:()=>Array.isArray(pick)?pick.shift():pick,_renderAll(){},saveState(){},t:key=>key,escapeHtml:String,SVG_SKULL:'',SVG_TROPHY:''}),'battlesim339');
  const entry=entries.find(e=>e.section===section),data=store.data();
  Object.assign(data,{rolled:true,combatSkill:20,combatSkillInitial:20,endurance:100,enduranceInitial:100,
    nextSection:section,nextEncounterKey:entry?.key??'',...options});
  data.enemy={name:entry?.name??'Custom opponent',skill:entry?entry.skill:20,
    endurance:entry?entry.stamina:100,enduranceMax:entry?entry.stamina:100};
  core._captureFightEffects(data);
  return {get data(){return store.data();},core,pick(value){pick=value;},restore(){run=JSON.parse(JSON.stringify(run));}};
}

test('33 source table encounters retain the original chart and explicitly derived duel stats',()=>{
  assert.equal(entries.length,33);assert.deepEqual(table,established);assert.deepEqual(definition.roll,{skill:25,endurance:30});
  const duel=entries.find(e=>e.section===304);assert.equal(duel.skill,null);assert.equal(duel.stamina,null);
  assert.equal(entries.filter(e=>e.rules.noncombatChallenge).length,1);
  assert(definition.controls.some(([key])=>key==='helshezag'));
});
test('the duel mirrors current EP with the optional Bronze Disc deduction',()=>{
  for(const [disc,expected]of [[false,37],[true,33]]){
    const f=fixture(304,{endurance:37,enduranceInitial:100,nextBronzeDisc:disc});
    assert.equal(f.data.enemy.endurance,expected);assert.equal(f.data.enemy.enduranceMax,expected);
    assert.equal(f.data.endurance,37);assert.equal(f.data.enemy.skill,null);assert.equal(f.data.ratio,-4);
  }
});
test('fixed ratio includes all bonuses without extra psychic, flame or weapon costs',()=>{
  const f=fixture(304,{combatSkill:200,attackModifier:99,endurance:40,nextPsychic:'kaiBlast',
    nextFlame:true,nextSommerwerd:true,nextDessiStone:true,nextHelshezag:true});
  assert.equal(f.core._psychic(f.data),'none');assert.equal(f.core._combatRatio(f.data),-4);
  f.pick(1);f.core._runRound();assert.equal(f.data.enemy.endurance,39);assert.equal(f.data.endurance,34);
  f.pick(0);f.core._runRound();assert.equal(f.data.enemy.endurance,29);assert.equal(f.data.endurance,34);
  assert.equal(f.data.enduranceInitial,100);
});
test('duel stops at ten or less with a reader continuation and no victory',()=>{
  for(const remaining of [11,5]){
    const f=fixture(304,{endurance:40});f.data.enemy.endurance=remaining;f.pick(1);f.core._runRound();
    assert.equal(f.data.combatEffects.route,151);assert.equal(f.data.history.length,0);
    f.restore();const saved=JSON.stringify(f.data);f.core._runRound();assert.equal(JSON.stringify(f.data),saved);
  }
  const initial=fixture(304,{endurance:14,nextBronzeDisc:true});
  assert.equal(initial.data.combatEffects.route,151);assert.equal(initial.data.roundsThisBattle,0);
});
test('a fatal duel round records loss before the nonfatal threshold route',()=>{
  const f=fixture(304,{endurance:12});f.pick(1);f.core._runRound();f.core._runRound();
  assert.equal(f.data.endurance,0);assert.equal(f.data.history[0].outcome,'loss');
  assert.notEqual(f.data.combatEffects.route,151);
});
test('the portal exposure challenge records neither battle victories nor battle deaths',()=>{
  const won=fixture(283,{combatSkill:100});won.pick(0);won.core._runRound();
  assert.equal(won.data.combatEffects.route,157);assert.equal(won.data.history.length,0);
  const dead=fixture(283,{combatSkill:0,endurance:1});dead.pick(1);dead.core._runRound();
  assert.equal(dead.data.endurance,0);assert.equal(dead.data.history.length,0);
});
test('all three Golasyx encounters compare actual one-round losses, with ties favoring Lone Wolf',()=>{
  for(const section of [75,116,340])for(const [pick,favorable]of [[1,false],[2,true]]){
    const f=fixture(section,{combatSkill:49});f.pick(pick);f.core._runRound();
    assert.equal(f.data.combatEffects.route,section===116?(favorable?38:192):(favorable?163:221));
    assert.equal(f.data.roundsThisBattle,1);assert.equal(f.data.history.length,0);
  }
});
test('Bangrol combat stops before the next round, with earlier kills using the victory route',()=>{
  for(const [section,limit]of [[217,3],[241,2]]){
    const f=fixture(section,{combatSkill:34});f.pick(1);
    for(let i=0;i<limit;i++)f.core._runRound();
    assert.equal(f.data.combatEffects.route,19);assert.equal(f.data.history.length,0);
    const won=fixture(section,{combatSkill:34});won.data.enemy.endurance=1;won.pick(9);won.core._runRound();
    assert.equal(won.data.combatEffects.route,142);assert.equal(won.data.history[0].outcome,'win');
  }
});
test('underwater protection includes psychic costs for exactly two rounds; the other encounter applies -5 CS',()=>{
  const f=fixture(194,{combatSkill:40,nextPsychic:'kaiBlast'});
  for(let i=0;i<3;i++){f.pick([1,0,0]);f.core._runRound();assert.equal(f.data.endurance,i<2?100:91);}
  const unprotected=fixture(237);assert.equal(unprotected.core._effectiveSkill(unprotected.data),15);
});
test('the chained serpent permits Kai-surge but explicitly excludes Kai-blast',()=>{
  for(const section of [2,169])for(const mode of ['blast','surge','kai','kaiBlast']){
    const f=fixture(section,{nextPsychic:mode});assert.equal(f.core._psychic(f.data),mode==='kai'?'kai':'none');
  }
});
test('unarmed mastery and the optional Plane of Darkness sword bonus apply only to their printed encounters',()=>{
  const ordinary=fixture(276),master=fixture(276,{nextGrandCrownUnarmed:true});
  assert.equal(ordinary.core._effectiveSkill(ordinary.data),16);assert.equal(master.core._effectiveSkill(master.data),23);
  for(const [section,expected]of [[3,24],[201,24],[123,20]]){
    const f=fixture(section,{nextPlaneSword:true});assert.equal(f.core._effectiveSkill(f.data),expected);
  }
});
test('custom fights still work without choosing a printed encounter',()=>{
  const f=fixture();f.data.enemy.endurance=1;f.pick(0);f.core._runRound();
  assert.equal(f.data.history[0].outcome,'win');
});
