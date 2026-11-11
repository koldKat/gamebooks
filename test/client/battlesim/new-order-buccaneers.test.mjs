import test from 'node:test';
import assert from 'node:assert/strict';
import {readRosterDocument} from '../../helpers/roster-db.cjs';
import {createMagnakaiCombat} from '../../../public/js/battlesim/engines/lone-wolf/magnakai-combat.js';
import {createMagnakaiState} from '../../../public/js/battlesim/engines/lone-wolf/magnakai-state.js';
import {definition} from '../../../public/js/battlesim/books/342/definition.js';
import {COMBAT_TABLE} from '../../../public/js/battlesim/engines/lone-wolf/combat-table.js';

const entries=readRosterDocument(342).enemies.map(row=>row.stats.entry);
const rules=Object.fromEntries(entries.map(entry=>[entry.key,entry.rules]));
function fixture(section=0,options={}) {
  let run={},core;
  const store=createMagnakaiState(definition,()=>({currentBookId:342,currentPlaythrough:()=>run,health:core._health}));
  core=createMagnakaiCombat(()=>({...core,COMBAT_TABLE,ENCOUNTER_RULES:rules,effectControls:definition.controls,
    combatOptions:definition.combatOptions,_data:store.data,_appendLog:store.appendLog,
    _recordOutcome:store.recordOutcome,_battleOver:store.battleOver,_pick10:()=>1,
    _renderAll(){},saveState(){},t:key=>key,escapeHtml:String,SVG_SKULL:'',SVG_TROPHY:''}),'battlesim342');
  const entry=entries.find(e=>e.section===section),d=store.data();
  Object.assign(d,{rolled:true,combatSkill:entry?.skill??20,endurance:100,enduranceInitial:100,
    nextSection:section,nextEncounterKey:entry?.key??'',...options});
  d.enemy={name:entry?.name??'Custom opponent',skill:entry?.skill??20,endurance:entry?.stamina??100,enduranceMax:entry?.stamina??100};
  core._captureFightEffects(d);
  return {core,get data(){return store.data();},restore(){run=JSON.parse(JSON.stringify(run));}};
}
test('25 printed presets use the reviewed chart and permit custom opponents',()=>{
  assert.equal(entries.length,25);assert.deepEqual(entries[0].combatTable,COMBAT_TABLE);
  assert.deepEqual(definition.roll,{skill:25,endurance:30});assert.equal(fixture().data.enemy.endurance,100);
});
test('Kholo doubles Kai-surge while the Mindblast footnote remains an explicit choice',()=>{
  for(const section of [86,269]) {
    const f=fixture(section,{attackModifier:5,nextPsychic:'surge'});
    assert.equal(f.core._effectiveSkill(f.data),61);
    f.data.combatEffects.psychic='blast';assert.equal(f.core._effectiveSkill(f.data),49);
    f.data.combatEffects.kholoFootnote=true;assert.equal(f.core._effectiveSkill(f.data),53);
    f.restore();assert.equal(f.core._effectiveSkill(f.data),53);
    f.data.combatEffects.psychic='none';assert.equal(f.core._effectiveSkill(f.data),45);
  }
});
test('psychic vulnerability does not multiply its EP cost or weapon adjustment',()=>{
  const f=fixture(86,{nextPsychic:'surge',attackModifier:5});
  assert.equal(f.core._psychicProfile(f.data).cost,1);
  f.data.combatEffects.psychic='none';assert.equal(f.core._effectiveSkill(f.data),45);
});
test('underwater oxygen penalty requires the appropriate route and missing Grand Nexus',()=>{
  assert.equal(fixture(67).core._effectiveSkill(fixture(67).data),36);
  const f=fixture(67,{nextNexus:true});assert.equal(f.core._effectiveSkill(f.data),40);
  const g=fixture(166);assert.equal(g.core._effectiveSkill(g.data),40);
  for(const section of [67,166]) {
    const h=fixture(section,{nextPsychic:'surge'});assert.equal(h.core._psychic(h.data),'none');
  }
});
test('Tzoog rejects Mindblast but allows Kai-surge at strictly more than six EP',()=>{
  for(const section of [19,74,122,169,224]) {
    const f=fixture(section,{nextPsychic:'blast'});assert.equal(f.core._psychic(f.data),'none');
    f.data.combatEffects.psychic='surge';f.data.endurance=6;assert.equal(f.core._psychic(f.data),'none');
    f.data.endurance=7;assert.equal(f.core._psychic(f.data),'surge');
  }
});
test('Zhürc opening protection includes psychic costs for precisely the printed rounds',()=>{
  for(const [section,rounds]of [[11,1],[96,2],[131,1],[176,1]]) {
    const f=fixture(section,{nextPsychic:'surge'});f.data.enemy.endurance=1000;
    for(let i=0;i<rounds;i++){f.core._runRound();assert.equal(f.data.endurance,100);}
    f.core._runRound();assert.ok(f.data.endurance<100);
  }
});
test('unarmed opening and completely unarmed fights suppress only weapon adjustment',()=>{
  const f=fixture(105,{attackModifier:8,nextPsychic:'blast'});assert.equal(f.core._effectiveSkill(f.data),38);
  f.data.roundsThisBattle=1;assert.equal(f.core._effectiveSkill(f.data),46);
  for(const section of [207,222]) {
    const g=fixture(section,{attackModifier:10,nextPsychic:'surge'});g.data.roundsThisBattle=9;
    assert.equal(g.core._effectiveSkill(g.data),44);
  }
});
test('Sesketera returns after two rounds without recording a survival victory',()=>{
  for(const section of [106,245]) {
    const f=fixture(section);f.core._runRound();f.core._runRound();
    assert.equal(f.data.combatEffects.route,215);assert.equal(f.data.history.length,0);
    assert.equal(f.data.roundsThisBattle,2);
  }
});
