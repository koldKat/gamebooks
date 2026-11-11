import test from 'node:test';
import assert from 'node:assert/strict';
import {readRosterDocument} from '../../helpers/roster-db.cjs';
import {createMagnakaiCombat} from '../../../public/js/battlesim/engines/lone-wolf/magnakai-combat.js';
import {createMagnakaiState} from '../../../public/js/battlesim/engines/lone-wolf/magnakai-state.js';
import {definition} from '../../../public/js/battlesim/books/346/definition.js';
import {COMBAT_TABLE} from '../../../public/js/battlesim/engines/lone-wolf/combat-table.js';

const entries=readRosterDocument(346).enemies.map(row=>row.stats.entry);
const rules=Object.fromEntries(entries.map(entry=>[entry.key,entry.rules]));
function fixture(section=0,{losses,...options}={}) {
  let run={},core;
  const store=createMagnakaiState(definition,()=>({currentBookId:346,currentPlaythrough:()=>run,health:core._health}));
  const entry=entries.find(e=>e.section===section);
  const table=losses?Array.from({length:10},()=>Array.from({length:13},()=>losses)):COMBAT_TABLE;
  core=createMagnakaiCombat(()=>({...core,COMBAT_TABLE:table,ENCOUNTER_RULES:rules,
    effectControls:definition.controls,combatOptions:definition.combatOptions,
    _data:store.data,_appendLog:store.appendLog,_recordOutcome:store.recordOutcome,_battleOver:store.battleOver,
    _pick10:()=>1,_renderAll(){},saveState(){},t:key=>key,escapeHtml:String,SVG_SKULL:'',SVG_TROPHY:''}),'battlesim346');
  const d=store.data();
  Object.assign(d,{rolled:true,combatSkill:entry?.skill??25,endurance:100,enduranceInitial:100,
    nextSection:section,nextEncounterKey:entry?.key??'',...options});
  d.enemy={name:entry?.name??'Custom opponent',skill:entry?.skill??25,
    endurance:entry?.stamina??100,enduranceMax:entry?.stamina??100};
  core._captureFightEffects(d);
  return {core,get data(){return store.data();},restore(){run=JSON.parse(JSON.stringify(run));}};
}

test('all 46 original chart presets distinguish 44 battles from the two tomb challenges',()=>{
 assert.equal(entries.length,46);assert.equal(entries.filter(e=>e.rules.noncombatChallenge).length,2);
 assert.deepEqual(entries.map(e=>e.section),[8,24,25,26,27,31,33,40,45,47,50,57,89,91,93,108,109,111,113,119,127,128,136,143,146,156,163,179,183,196,208,215,226,234,244,282,292,293,298,299,302,316,328,340,342,348]);
 assert.ok(entries.every(e=>JSON.stringify(e.combatTable)===JSON.stringify(COMBAT_TABLE)));
 assert.deepEqual(definition.controls,[['deliverance','nextDeliverance'],['curingReady','nextCuringReady']]);
 assert.equal(fixture().data.enemy.endurance,100);
});
test('Prince Leomin adds five skill only to the printed joint fight',()=>{
 const f=fixture(109,{attackModifier:7});assert.equal(f.core._effectiveSkill(f.data),f.data.combatSkill+12);
 for(const section of [108,127]){const f=fixture(section,{attackModifier:7});assert.equal(f.core._effectiveSkill(f.data),f.data.combatSkill+7);}
});
test('every printed victory threshold uses the exact boundary and destination',()=>{
 for(const [sections,rounds,early,late]of [[[25,45,111,119,196,208,293,342,348],3,65,189],[[127,163,292],4,82,236],[[316],4,255,271]]){
  for(const section of sections)for(const [count,route]of [[rounds,early],[rounds+1,late]]){
   const f=fixture(section);f.data.roundsThisBattle=count;f.data.enemy.endurance=0;f.core._checkBattleEnd(f.data);assert.equal(f.data.combatEffects.route,route);
  }
 }
});
test('the surprise attack prevents enemy losses for exactly two rounds',()=>{
 for(const section of [146,215]){const f=fixture(section,{losses:[3,1]});f.core._runRound();f.restore();f.core._runRound();assert.equal(f.data.enemy.endurance,38);assert.equal(f.data.endurance,98);f.core._runRound();assert.equal(f.data.enemy.endurance,35);}
});
test('tomb challenges never record battle wins or battle deaths',()=>{
 for(const section of [27,299]){
  const win=fixture(section,{losses:[100,1],nextPsychic:'surge'});assert.equal(win.core._psychic(win.data),'none');assert.equal(win.core._escapeRoute(win.data),230);win.core._runRound();assert.equal(win.data.combatEffects.route,110);assert.equal(win.data.history.length,0);
  const loss=fixture(section,{losses:[1,'K']});loss.core._runRound();assert.equal(loss.data.endurance,0);assert.equal(loss.data.history.length,0);
 }
 const normal=fixture(40,{losses:[100,1]});normal.core._runRound();assert.equal(normal.data.history.length,1);
});
test('printed full immunity and Mindblast-only immunity remain distinct',()=>{
 for(const section of [27,33,50,113,282,299,328,340]){const f=fixture(section,{nextPsychic:'surge'});assert.equal(f.core._psychic(f.data),'none');}
 for(const section of [8,24,26,31,57,91,143,183,226,244,298]){const f=fixture(section,{nextPsychic:'blast'});assert.equal(f.core._psychic(f.data),'none');f.data.combatEffects.psychic='surge';assert.equal(f.core._psychic(f.data),'surge');}
});
test('the lone lancer permits evasion only after three completed rounds',()=>{
 const f=fixture(136);f.data.roundsThisBattle=2;assert.equal(f.core._escapeRoute(f.data),0);f.data.roundsThisBattle=3;assert.equal(f.core._escapeRoute(f.data),205);
 for(const section of [89,93,156,179,234]){const f=fixture(section);f.data.roundsThisBattle=20;assert.equal(f.core._escapeRoute(f.data),0);}
});
