import test from 'node:test';
import assert from 'node:assert/strict';
import {readRosterDocument} from '../../helpers/roster-db.cjs';
import {createMagnakaiCombat} from '../../../public/js/battlesim/engines/lone-wolf/magnakai-combat.js';
import {createMagnakaiState} from '../../../public/js/battlesim/engines/lone-wolf/magnakai-state.js';
import {definition} from '../../../public/js/battlesim/books/348/definition.js';
import {COMBAT_TABLE} from '../../../public/js/battlesim/engines/lone-wolf/combat-table.js';

const entries=readRosterDocument(348).enemies.map(row=>row.stats.entry);
const rules=Object.fromEntries(entries.map(entry=>[entry.key,entry.rules]));
function fixture(section=0,{losses,draws,...options}={}) {
  let run={},core;
  const store=createMagnakaiState(definition,()=>({currentBookId:348,currentPlaythrough:()=>run,health:core._health}));
  const entry=entries.find(e=>e.section===section);
  const table=losses?Array.from({length:10},()=>Array.from({length:13},()=>losses)):COMBAT_TABLE;
  core=createMagnakaiCombat(()=>({...core,COMBAT_TABLE:table,ENCOUNTER_RULES:rules,
    effectControls:definition.controls,combatOptions:definition.combatOptions,
    _data:store.data,_appendLog:store.appendLog,_recordOutcome:store.recordOutcome,_battleOver:store.battleOver,
    _pick10:()=>draws?.shift()??1,_renderAll(){},saveState(){},t:key=>key,escapeHtml:String,SVG_SKULL:'',SVG_TROPHY:''}),'battlesim348');
  const d=store.data();
  Object.assign(d,{rolled:true,combatSkill:entry?.skill??25,endurance:100,enduranceInitial:100,
    nextSection:section,nextEncounterKey:entry?.key??'',...options});
  d.enemy={name:entry?.name??'Custom opponent',skill:entry?.skill??25,
    endurance:entry?.stamina??100,enduranceMax:entry?.stamina??100};
  core._captureFightEffects(d);
  return {core,get data(){return store.data();},restore(){run=JSON.parse(JSON.stringify(run));}};
}

test('all 27 printed table encounters retain their exact stats, chart and optional custom setup',()=>{
 assert.deepEqual(entries.map(e=>e.section),[17,18,39,50,54,63,71,72,76,77,82,106,115,135,136,143,148,172,174,179,200,224,225,243,254,262,292]);
 assert.ok(entries.every(e=>JSON.stringify(e.combatTable)===JSON.stringify(COMBAT_TABLE)));
 assert.deepEqual(definition.roll,{skill:25,endurance:30});assert.equal(fixture().data.enemy.endurance,100);
 assert.equal(fixture(71).data.enemy.skill,52);assert.equal(fixture(136).data.enemy.skill,48);assert.equal(fixture(254).data.enemy.skill,44);
});
test('three-trooper and single-ally support apply only to the printed fights',()=>{
 for(const section of [63,77,143,179]){const f=fixture(section,{attackModifier:7});assert.equal(f.core._effectiveSkill(f.data),f.data.combatSkill+10);}
 for(const section of [72,82,106,115,174,224]){const f=fixture(section,{attackModifier:7});assert.equal(f.core._effectiveSkill(f.data),f.data.combatSkill+8);}
 const solo=fixture(292,{attackModifier:7});assert.equal(solo.core._effectiveSkill(solo.data),solo.data.combatSkill+7);
});
test('the signalman ladder penalty is four skill and survives saved-fight restoration',()=>{
 const f=fixture(39,{attackModifier:7});assert.equal(f.core._effectiveSkill(f.data),33);f.restore();assert.equal(f.core._effectiveSkill(f.data),33);
});
test('the two Chagarashi ambushes protect the enemy for exactly two or one rounds',()=>{
 for(const [section,rounds]of [[18,2],[243,1]]){const f=fixture(section,{losses:[3,1]});for(let n=0;n<rounds;n++){f.core._runRound();assert.equal(f.data.enemy.endurance,38);}f.core._runRound();assert.equal(f.data.enemy.endurance,35);}
});
test('stolen Illuminatus adds exactly two enemy skill only to the three robbers variants',()=>{
 for(const section of [71,136,254]){const base=fixture(section),extra=fixture(section,{nextStolenIlluminatus:true});assert.equal(base.core._combatRatio(base.data),0);assert.equal(extra.core._combatRatio(extra.data),-2);}
 const other=fixture(17,{nextStolenIlluminatus:true});assert.equal(other.core._combatRatio(other.data),0);
});
test('Brumalghast Elementalism or Grand Nexus gives one three-skill bonus',()=>{
 const f=fixture(200,{nextNexus:true,attackModifier:7});assert.equal(f.core._combatRatio(f.data),10);
 const other=fixture(17,{nextNexus:true});assert.equal(other.core._combatRatio(other.data),0);
});
test('the table-based trapdoor can be abandoned immediately without damage or battle rewards',()=>{
 const f=fixture(76,{losses:[5,5]});f.core._escape();assert.equal(f.data.endurance,100);assert.equal(f.data.enemy.endurance,25);assert.equal(f.data.roundsThisBattle,0);assert.equal(f.data.combatEffects.route,118);assert.equal(f.data.history.length,0);
});
test('opening the trapdoor uses printed fatigue losses without a battle victory',()=>{
 const f=fixture(76,{losses:[25,1]});f.core._runRound();assert.equal(f.data.endurance,99);assert.equal(f.data.combatEffects.route,69);assert.equal(f.data.history.length,0);
});
test('New Order psychic powers stay exclusive and Kai-blast preserves zero-as-one damage draws',()=>{
 const blast=fixture(17,{nextPsychic:'blast'});assert.equal(blast.core._effectiveSkill(blast.data),49);
 const surge=fixture(17,{nextPsychic:'surge'});assert.equal(surge.core._effectiveSkill(surge.data),53);surge.data.endurance=6;assert.equal(surge.core._psychic(surge.data),'none');
 const kai=fixture(17,{losses:[2,1],nextPsychic:'kaiBlast',draws:[1,0,0]});kai.core._runRound();assert.equal(kai.data.enemy.endurance,36);assert.equal(kai.data.endurance,95);
});
test('weapon flame adds one only on a weapon hit and Deliverance respects the printed threshold',()=>{
 const hit=fixture(17,{losses:[2,1],nextFlame:true});hit.core._runRound();assert.equal(hit.data.enemy.endurance,37);
 const miss=fixture(17,{losses:[0,1],nextFlame:true});miss.core._runRound();assert.equal(miss.data.enemy.endurance,40);
 const heal=fixture(17,{nextDeliverance:true,nextCuringReady:true});heal.data.endurance=9;assert.equal(heal.core._healingAvailable(heal.data),false);heal.data.endurance=8;heal.core._heal(heal.data);assert.equal(heal.data.endurance,28);assert.equal(heal.core._healingAvailable(heal.data),false);
});

