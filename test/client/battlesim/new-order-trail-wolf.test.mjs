import test from 'node:test';
import assert from 'node:assert/strict';
import {readRosterDocument} from '../../helpers/roster-db.cjs';
import {createMagnakaiCombat} from '../../../public/js/battlesim/engines/lone-wolf/magnakai-combat.js';
import {createMagnakaiState} from '../../../public/js/battlesim/engines/lone-wolf/magnakai-state.js';
import {definition} from '../../../public/js/battlesim/books/345/definition.js';
import {COMBAT_TABLE} from '../../../public/js/battlesim/engines/lone-wolf/combat-table.js';

const entries=readRosterDocument(345).enemies.map(row=>row.stats.entry);
const rules=Object.fromEntries(entries.map(entry=>[entry.key,entry.rules]));
function fixture(section=0,{losses,...options}={}) {
  let run={},core;
  const store=createMagnakaiState(definition,()=>({currentBookId:345,currentPlaythrough:()=>run,health:core._health}));
  const entry=entries.find(e=>e.section===section);
  const table=losses?Array.from({length:10},()=>Array.from({length:13},()=>losses)):COMBAT_TABLE;
  core=createMagnakaiCombat(()=>({...core,COMBAT_TABLE:table,ENCOUNTER_RULES:rules,
    effectControls:definition.controls,combatOptions:definition.combatOptions,
    _data:store.data,_appendLog:store.appendLog,_recordOutcome:store.recordOutcome,_battleOver:store.battleOver,
    _pick10:()=>1,_renderAll(){},saveState(){},t:key=>key,escapeHtml:String,SVG_SKULL:'',SVG_TROPHY:''}),'battlesim345');
  const d=store.data();
  Object.assign(d,{rolled:true,combatSkill:entry?.skill??25,endurance:100,enduranceInitial:100,
    nextSection:section,nextEncounterKey:entry?.key??'',...options});
  d.enemy={name:entry?.name??'Custom opponent',skill:entry?.skill??25,
    endurance:entry?.stamina??100,enduranceMax:entry?.stamina??100};
  core._captureFightEffects(d);
  return {core,get data(){return store.data();},restore(){run=JSON.parse(JSON.stringify(run));}};
}

test('all 39 printed encounter variants retain the original combat chart and editable custom fights',()=>{
  assert.equal(entries.length,39);
  assert.deepEqual(entries.map(e=>e.section),[2,4,17,25,31,64,68,70,76,78,84,90,94,97,119,127,140,172,180,183,184,187,190,195,207,213,216,221,222,237,250,265,268,277,279,311,312,324,343]);
  assert.ok(entries.every(e=>JSON.stringify(e.combatTable)===JSON.stringify(COMBAT_TABLE)));
  assert.equal(fixture().data.enemy.endurance,100);
});
test('the Platinum Amulet prevents five total damage across the encounter, including after saved-state restoration',()=>{
  for(const section of [140,172,187,222]){
    const f=fixture(section,{losses:[1,3],nextPsychic:'surge',nextKaiScreen:false});
    assert.equal(f.core._psychic(f.data),'none');assert.equal(f.core._effectiveSkill(f.data),f.data.combatSkill-3);
    f.core._runRound();assert.equal(f.data.endurance,100);assert.equal(f.data.combatEffects.damageReductionUsed,3);
    f.restore();f.core._runRound();assert.equal(f.data.endurance,99);assert.equal(f.data.combatEffects.damageReductionUsed,5);
    f.core._runRound();assert.equal(f.data.endurance,96);assert.equal(f.data.combatEffects.route,260);assert.equal(f.data.history.length,0);
    f.core._runRound();assert.equal(f.data.roundsThisBattle,3);
    const protectedMind=fixture(section,{nextKaiScreen:true});assert.equal(protectedMind.core._effectiveSkill(protectedMind.data),protectedMind.data.combatSkill);
  }
});
test('the spider ambush doubles incoming damage and prevents enemy damage on round one only',()=>{
  const f=fixture(265,{losses:[3,2]});f.core._runRound();assert.equal(f.data.endurance,96);assert.equal(f.data.enemy.endurance,40);
  f.restore();f.core._runRound();assert.equal(f.data.endurance,94);assert.equal(f.data.enemy.endurance,37);
  assert.equal(f.data.combatEffects.damageReductionUsed,undefined);
});
test('amulet protection never negates an automatic death result',()=>{
  const f=fixture(140,{losses:[1,'K']});f.core._runRound();assert.equal(f.data.endurance,0);
});
test('printed psychic immunity, blindness and exact evasion thresholds remain distinct',()=>{
  const immune=fixture(183,{nextPsychic:'surge'});assert.equal(immune.core._psychic(immune.data),'none');
  const reptile=fixture(84,{nextPsychic:'blast'});assert.equal(reptile.core._psychic(reptile.data),'none');
  reptile.data.combatEffects.psychic='surge';assert.equal(reptile.core._psychic(reptile.data),'surge');
  const blind=fixture(312,{attackModifier:7});assert.equal(blind.core._effectiveSkill(blind.data),blind.data.combatSkill+7-15);
  for(const [section,rounds,route]of [[84,3,73],[97,5,21],[190,4,21],[207,4,21],[265,6,21],[279,5,21],[324,4,21]]){
    const f=fixture(section);f.data.roundsThisBattle=rounds-1;assert.equal(f.core._escapeRoute(f.data),0);
    f.data.roundsThisBattle=rounds;assert.equal(f.core._escapeRoute(f.data),route);
  }
});
test('the Akataz victory uses the original three-round boundary',()=>{
  for(const [rounds,route]of [[3,293],[4,184]]){const f=fixture(237);f.data.roundsThisBattle=rounds;f.data.enemy.endurance=0;f.core._checkBattleEnd(f.data);assert.equal(f.data.combatEffects.route,route);}
});
