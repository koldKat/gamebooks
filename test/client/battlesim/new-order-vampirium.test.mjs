import test from 'node:test';
import assert from 'node:assert/strict';
import {readRosterDocument} from '../../helpers/roster-db.cjs';
import {createMagnakaiCombat} from '../../../public/js/battlesim/engines/lone-wolf/magnakai-combat.js';
import {createMagnakaiState} from '../../../public/js/battlesim/engines/lone-wolf/magnakai-state.js';
import {definition} from '../../../public/js/battlesim/books/347/definition.js';
import {COMBAT_TABLE} from '../../../public/js/battlesim/engines/lone-wolf/combat-table.js';

const entries=readRosterDocument(347).enemies.map(row=>row.stats.entry);
const rules=Object.fromEntries(entries.map(entry=>[entry.key,entry.rules]));
function fixture(section=0,{losses,draws,...options}={}) {
  let run={},core;
  const store=createMagnakaiState(definition,()=>({currentBookId:347,currentPlaythrough:()=>run,health:core._health}));
  const entry=entries.find(e=>e.section===section);
  const table=losses?Array.from({length:10},()=>Array.from({length:13},()=>losses)):COMBAT_TABLE;
  core=createMagnakaiCombat(()=>({...core,COMBAT_TABLE:table,ENCOUNTER_RULES:rules,
    effectControls:definition.controls,combatOptions:definition.combatOptions,
    _data:store.data,_appendLog:store.appendLog,_recordOutcome:store.recordOutcome,_battleOver:store.battleOver,
    _pick10:()=>draws?.shift()??1,_renderAll(){},saveState(){},t:key=>key,escapeHtml:String,SVG_SKULL:'',SVG_TROPHY:''}),'battlesim347');
  const d=store.data();
  Object.assign(d,{rolled:true,combatSkill:entry?.skill??25,endurance:100,enduranceInitial:100,
    nextSection:section,nextEncounterKey:entry?.key??'',...options});
  d.enemy={name:entry?.name??'Custom opponent',skill:entry?.skill??25,
    endurance:entry?.stamina??100,enduranceMax:entry?.stamina??100};
  core._captureFightEffects(d);
  return {core,get data(){return store.data();},restore(){run=JSON.parse(JSON.stringify(run));}};
}

test('all 11 printed encounter variants retain the original chart and editable custom setup',()=>{
 assert.deepEqual(entries.map(e=>e.section),[33,37,97,126,186,270,282,297,315,326,338]);
 assert.ok(entries.every(e=>JSON.stringify(e.combatTable)===JSON.stringify(COMBAT_TABLE)));
 assert.deepEqual(definition.roll,{skill:25,endurance:30});assert.equal(fixture().data.enemy.endurance,100);
});
test('the ranger support adds exactly two skill only to the printed group fights',()=>{
 for(const section of [37,186,297]){const f=fixture(section,{attackModifier:7});assert.equal(f.core._effectiveSkill(f.data),f.data.combatSkill+9);}
 const lone=fixture(33,{attackModifier:7});assert.equal(lone.core._effectiveSkill(lone.data),lone.data.combatSkill+7);
});
test('roughriders use the exact five-round victory boundary',()=>{
 for(const [rounds,route]of [[5,256],[6,105]]){const f=fixture(37);f.data.roundsThisBattle=rounds;f.data.enemy.endurance=0;f.core._checkBattleEnd(f.data);assert.equal(f.data.combatEffects.route,route);}
});
test('both Sligza variants and the winged leader retain their own health and psychic immunity',()=>{
 assert.equal(fixture(97).data.enemy.endurance,20);assert.equal(fixture(315).data.enemy.endurance,22);assert.equal(fixture(126).data.enemy.endurance,40);
 for(const section of [97,126,315]){const f=fixture(section,{nextPsychic:'blast'});assert.equal(f.core._psychic(f.data),'none');f.data.combatEffects.psychic='surge';assert.equal(f.core._psychic(f.data),'surge');f.data.combatEffects.psychic='kaiBlast';assert.equal(f.core._psychic(f.data),'kaiBlast');}
});
test('Gildas is subdued with normal printed losses and blocks every psychic mode',()=>{
 for(const mode of ['blast','surge','kaiBlast']){const f=fixture(338,{losses:[3,1],nextPsychic:mode});assert.equal(f.core._psychic(f.data),'none');f.core._runRound();assert.equal(f.data.enemy.endurance,37);assert.equal(f.data.endurance,99);}
 const f=fixture(338,{losses:[100,1]});f.core._runRound();assert.equal(f.data.combatEffects.route,117);
});
test('New Order Mindblast and Kai-surge never combine and retain the endurance cutoff',()=>{
 const blast=fixture(33,{nextPsychic:'blast'});assert.equal(blast.core._effectiveSkill(blast.data),blast.data.combatSkill+4);
 const surge=fixture(33,{losses:[1,1],nextPsychic:'surge'});assert.equal(surge.core._effectiveSkill(surge.data),surge.data.combatSkill+8);surge.core._runRound();assert.equal(surge.data.endurance,98);surge.data.endurance=6;assert.equal(surge.core._psychic(surge.data),'none');
});
test('Sun Lord Kai-blast draws two damage numbers with zero worth one, costing four endurance',()=>{
 for(const [draws,damage]of [[[1,0,0],2],[[1,9,9],18]]){
  const f=fixture(33,{losses:[2,1],nextPsychic:'kaiBlast',draws});assert.equal(f.core._effectiveSkill(f.data),f.data.combatSkill);f.core._runRound();assert.equal(f.data.enemy.endurance,40-2-damage);assert.equal(f.data.endurance,95);
 }
});
test('nonmagical metal weapon flames add one only when the weapon inflicts damage',()=>{
 const hit=fixture(33,{losses:[2,1],nextFlame:true});hit.core._runRound();assert.equal(hit.data.enemy.endurance,37);
 const miss=fixture(33,{losses:[0,1],nextFlame:true});miss.core._runRound();assert.equal(miss.data.enemy.endurance,40);
 const psychic=fixture(33,{losses:[0,1],nextFlame:true,nextPsychic:'kaiBlast',draws:[1,0,0]});psychic.core._runRound();assert.equal(psychic.data.enemy.endurance,38);
});
