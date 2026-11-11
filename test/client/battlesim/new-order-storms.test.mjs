import test from 'node:test';
import assert from 'node:assert/strict';
import {readRosterDocument} from '../../helpers/roster-db.cjs';
import {createMagnakaiCombat} from '../../../public/js/battlesim/engines/lone-wolf/magnakai-combat.js';
import {createMagnakaiState} from '../../../public/js/battlesim/engines/lone-wolf/magnakai-state.js';
import {definition} from '../../../public/js/battlesim/books/349/definition.js';
import {COMBAT_TABLE} from '../../../public/js/battlesim/engines/lone-wolf/combat-table.js';

const entries=readRosterDocument(349).enemies.map(row=>row.stats.entry);
const rules=Object.fromEntries(entries.map(entry=>[entry.key,entry.rules]));
function fixture(section=0,{losses,draws,...options}={}) {
  let run={},core;
  const store=createMagnakaiState(definition,()=>({currentBookId:349,currentPlaythrough:()=>run,health:core._health}));
  const entry=entries.find(e=>e.section===section);
  const table=losses?Array.from({length:10},()=>Array.from({length:13},()=>losses)):COMBAT_TABLE;
  core=createMagnakaiCombat(()=>({...core,COMBAT_TABLE:table,ENCOUNTER_RULES:rules,
    effectControls:definition.controls,combatOptions:definition.combatOptions,
    _data:store.data,_appendLog:store.appendLog,_recordOutcome:store.recordOutcome,_battleOver:store.battleOver,
    _pick10:()=>draws?.shift()??1,_renderAll(){},saveState(){},t:key=>key,escapeHtml:String,SVG_SKULL:'',SVG_TROPHY:''}),'battlesim349');
  const d=store.data();
  Object.assign(d,{rolled:true,combatSkill:entry?.skill??25,endurance:100,enduranceInitial:100,
    nextSection:section,nextEncounterKey:entry?.key??'',...options});
  d.enemy={name:entry?.name??'Custom opponent',skill:entry?.skill??25,
    endurance:entry?.stamina??100,enduranceMax:entry?.stamina??100};
  core._captureFightEffects(d);
  return {core,get data(){return store.data();},restore(){run=JSON.parse(JSON.stringify(run));}};
}

test('all printed fights, the fatigue ordeal and two continuations use the original chart',()=>{
 assert.equal(entries.length,43);
 assert.deepEqual(entries.map(e=>e.section),[2,23,28,48,49,50,51,54,60,66,70,83,100,101,109,116,118,121,131,150,157,158,161,174,194,195,207,222,230,242,256,257,262,265,268,296,304,307,319,324,328,342,347]);
 assert.ok(entries.every(e=>JSON.stringify(e.combatTable)===JSON.stringify(COMBAT_TABLE)));
 assert.equal(fixture(66).data.enemy.endurance,37);assert.equal(fixture(265).data.enemy.endurance,38);
 assert.equal(fixture().data.enemy.endurance,100);
});
test('Chagarashi continues after round three without resetting wounds or awarding a victory',()=>{
 const f=fixture(66,{losses:[1,1]});
 for(let i=0;i<3;i++)f.core._runRound();
 assert.equal(f.data.enemy.endurance,34);assert.equal(f.data.endurance,97);
 assert.equal(f.data.combatEffects.route,49);assert.equal(f.data.history.length,0);
 f.restore();f.core._continueCombat(f.data);f.core._runRound();
 assert.equal(f.data.roundsThisBattle,4);assert.equal(f.data.enemy.endurance,33);assert.equal(f.data.endurance,96);
 f.data.enemy.endurance=1;f.core._runRound();assert.equal(f.data.combatEffects.route,90);assert.equal(f.data.history.length,1);
 assert.throws(()=>f.core._continueCombat(f.data));
});
test('Zashnor round seven gains five EP once, round eight loses only the temporary five CS',()=>{
 const f=fixture(100,{losses:[1,1]});for(let i=0;i<6;i++)f.core._runRound();
 assert.equal(f.data.enemy.endurance,46);assert.equal(f.data.endurance,88);assert.equal(f.data.combatEffects.route,50);
 f.core._continueCombat(f.data);f.restore();f.core._runRound();
 assert.equal(f.data.enemy.skill,59);assert.equal(f.data.enemy.endurance,50);assert.equal(f.data.enemy.enduranceMax,57);
 assert.equal(f.data.endurance,86);f.core._runRound();assert.equal(f.data.enemy.skill,54);assert.equal(f.data.enemy.endurance,49);
 f.restore();f.core._runRound();assert.equal(f.data.enemy.endurance,48);assert.equal(f.data.history.length,0);
});
test('direct continuation setup respects entered remaining EP and does not charge Power Strike twice',()=>{
 const f=fixture(50,{nextPowerStrike:true,endurance:23,enduranceInitial:50});
 assert.equal(f.data.endurance,23);assert.equal(f.data.roundsThisBattle,6);
 const g=fixture(49,{nextPowerStrike:true,endurance:23,enduranceInitial:50});assert.equal(g.data.endurance,23);assert.equal(g.data.roundsThisBattle,3);
});
test('ordinary and enhanced Kirusami use distinct undead multipliers and first-round costs',()=>{
 for(const [enhanced,remaining,cost]of [[false,46,3],[true,44,4]]){
  const f=fixture(2,{losses:[2,1],nextKirusami:true,nextEnhancedKirusami:enhanced});
  assert.equal(f.core._effectiveSkill(f.data),51);f.core._runRound();
  assert.equal(f.data.enemy.endurance,remaining);assert.equal(f.data.endurance,99-cost);
  f.core._runRound();assert.equal(f.data.endurance,98-cost);
 }
 const living=fixture(347,{losses:[2,1],nextKirusami:true,nextEnhancedKirusami:true});living.core._runRound();assert.equal(living.data.enemy.endurance,36);
});
test('Wardstone affects printed undead and custom undead, never living opponents',()=>{
 assert.equal(fixture(2,{nextWardstone:true}).core._combatRatio(fixture(2,{nextWardstone:true}).data),3);
 const living=fixture(347,{nextWardstone:true});assert.equal(living.core._combatRatio(living.data),0);
 const custom=fixture(0,{nextWardstone:true,nextEnemyUndead:true});assert.equal(custom.core._combatRatio(custom.data),3);
});
test('Power Strike costs three EP once and adds one CS and one EP only to an actual wound',()=>{
 const f=fixture(2,{losses:[2,1],nextPowerStrike:true});assert.equal(f.data.endurance,97);assert.equal(f.core._effectiveSkill(f.data),51);
 f.core._runRound();assert.equal(f.data.enemy.endurance,47);assert.equal(f.data.endurance,96);
 const miss=fixture(2,{losses:[0,1],nextPowerStrike:true});miss.core._runRound();assert.equal(miss.data.enemy.endurance,50);
 const dead=fixture(2,{nextPowerStrike:true,endurance:3});assert.equal(dead.data.endurance,0);assert.equal(dead.data.history[0].outcome,'loss');
});
test('Malavan adds two CS to an active eligible psychic attack, never an inactive attack or Kai-blast',()=>{
 for(const [section,mode,bonus]of [[2,'none',0],[2,'blast',6],[2,'surge',10],[116,'psiSurge',8],[2,'kaiBlast',0]]){
  const f=fixture(section,{nextMalavan:true,nextPsychic:mode});assert.equal(f.core._effectiveSkill(f.data),f.data.combatSkill+bonus);
 }
 const low=fixture(2,{nextMalavan:true,nextPsychic:'surge',endurance:6});assert.equal(low.core._effectiveSkill(low.data),50);
});
test('the three spectral duels retain their different printed psychic powers and costs',()=>{
 for(const [section,mode,bonus,cost]of [[70,'surge',8,0],[116,'psiSurge',6,2],[222,'surge',8,1]]){
  const f=fixture(section,{losses:[1,1],nextPsychic:mode,attackModifier:20,nextKirusami:true,nextPowerStrike:true});
  assert.equal(f.core._effectiveSkill(f.data),45+bonus);assert.equal(f.data.endurance,100);f.core._runRound();assert.equal(f.data.endurance,99-cost);
 }
 assert.equal(fixture(116,{nextPsychic:'surge'}).core._psychic(fixture(116,{nextPsychic:'surge'}).data),'none');
});
test('Zashnor limits Kai-blast to one draw, without inventing a once-per-fight restriction',()=>{
 const f=fixture(100,{losses:[1,1],nextPsychic:'kaiBlast',draws:[1,0,1,4]});
 f.core._runRound();assert.equal(f.data.enemy.endurance,50);assert.equal(f.data.endurance,94);
 f.core._runRound();assert.equal(f.data.enemy.endurance,45);assert.equal(f.data.endurance,88);
 const immune=fixture(100,{nextPsychic:'blast'});assert.equal(immune.core._psychic(immune.data),'none');
 const surge=fixture(100,{nextPsychic:'surge'});assert.equal(surge.core._effectiveSkill(surge.data),58);
});
test('Anseng assists from round two, while printed opening protection lasts exactly its stated rounds',()=>{
 const ally=fixture(131,{losses:[1,1]});assert.equal(ally.core._effectiveSkill(ally.data),38);ally.core._runRound();assert.equal(ally.core._effectiveSkill(ally.data),43);
 const group=fixture(174,{losses:[1,4]});group.core._runRound();group.core._runRound();assert.equal(group.data.endurance,100);group.core._runRound();assert.equal(group.data.endurance,96);
 const ghoul=fixture(54,{losses:[3,2]});ghoul.core._runRound();assert.equal(ghoul.data.enemy.endurance,38);assert.equal(ghoul.data.endurance,97);ghoul.core._runRound();assert.equal(ghoul.data.endurance,95);
});
test('the stunned Doomwolf opening blocks psychic and flame damage as well as table wounds',()=>{
 const f=fixture(257,{losses:[3,1],nextPsychic:'kaiBlast',nextFlame:true,draws:[1,2,3,1,2,3,1,2,3]});
 for(let i=0;i<2;i++){f.core._runRound();assert.equal(f.data.enemy.endurance,30);}
 f.core._runRound();assert.equal(f.data.enemy.endurance,21);
 assert.equal(fixture(257,{attackModifier:2}).core._effectiveSkill(fixture(257,{attackModifier:2}).data),34);
});
test('one-round passages retain equal-loss omissions and the stunned scout overlap',()=>{
 for(const section of [48,194]){const f=fixture(section,{losses:[2,2]});f.core._runRound();assert.equal(f.data.combatEffects.finished,true);assert.equal(f.data.combatEffects.route,undefined);}
 const scout=fixture(157,{losses:[2,2]});scout.core._runRound();assert.equal(scout.data.combatEffects.route,142);
 const overlap=fixture(324,{losses:[1,2]});overlap.core._runRound();assert.equal(overlap.data.combatEffects.finished,true);assert.equal(overlap.data.combatEffects.route,null);
});
test('the estuary uses six-round threshold and records neither a battle win nor loss',()=>{
 const f=fixture(101,{losses:[10,1],attackModifier:20,nextPsychic:'surge'});assert.equal(f.core._effectiveSkill(f.data),32);
 for(let i=0;i<5;i++)f.core._runRound();assert.equal(f.data.combatEffects.route,294);assert.equal(f.data.history.length,0);
 const g=fixture(101,{losses:[1,100]});g.core._runRound();assert.equal(g.data.history.length,0);
});
test('Kluz signed printed rule adds one only to losses greater than minus three',()=>{
 for(const [loss,remaining]of [[0,48],[1,46],[2,45],[3,45],[4,44]]){
  const f=fixture(342,{losses:[loss,1]});f.core._runRound();assert.equal(f.data.enemy.endurance,remaining);
 }
});

