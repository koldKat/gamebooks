import test from 'node:test';
import assert from 'node:assert/strict';
import {readRosterDocument} from '../../helpers/roster-db.cjs';
import {createMagnakaiCombat} from '../../../public/js/battlesim/engines/lone-wolf/magnakai-combat.js';
import {createMagnakaiState} from '../../../public/js/battlesim/engines/lone-wolf/magnakai-state.js';
import {definition} from '../../../public/js/battlesim/books/341/definition.js';
import {COMBAT_TABLE} from '../../../public/js/battlesim/engines/lone-wolf/combat-table.js';

const entries=readRosterDocument(341).enemies.map(row=>row.stats.entry);
const rules=Object.fromEntries(entries.map(entry=>[entry.key,entry.rules]));
function fixture(section=0,options={}) {
  let run={},core;
  const store=createMagnakaiState(definition,()=>({currentBookId:341,currentPlaythrough:()=>run,health:core._health}));
  core=createMagnakaiCombat(()=>({...core,COMBAT_TABLE,ENCOUNTER_RULES:rules,effectControls:definition.controls,
    combatOptions:definition.combatOptions,_data:store.data,_appendLog:store.appendLog,
    _recordOutcome:store.recordOutcome,_battleOver:store.battleOver,_pick10:()=>1,
    _renderAll(){},saveState(){},t:key=>key,escapeHtml:String,SVG_SKULL:'',SVG_TROPHY:''}),'battlesim341');
  const entry=entries.find(e=>e.section===section),d=store.data();
  Object.assign(d,{rolled:true,combatSkill:entry?.skill??20,endurance:100,enduranceInitial:100,
    nextSection:section,nextEncounterKey:entry?.key??'',...options});
  d.enemy={name:entry?.name??'Custom opponent',skill:entry?.skill??20,endurance:entry?.stamina??100,enduranceMax:entry?.stamina??100};
  core._captureFightEffects(d);
  return {core,get data(){return store.data();},restore(){run=JSON.parse(JSON.stringify(run));}};
}
test('New Order uses 23 printed encounters, the established chart and custom opponents',()=>{
  assert.equal(entries.length,23);assert.deepEqual(entries[0].combatTable,COMBAT_TABLE);
  assert.deepEqual(definition.roll,{skill:25,endurance:30});
  assert.equal(fixture().data.enemy.endurance,100);
});
test('Dar-Isun removes only weapon adjustment in round one, preserving psychic skill',()=>{
  for(const section of [5,230]) {
    const f=fixture(section,{attackModifier:10,nextPsychic:'surge'});
    assert.equal(f.core._effectiveSkill(f.data),47);
    f.data.roundsThisBattle=1;assert.equal(f.core._effectiveSkill(f.data),57);
    f.restore();assert.equal(f.core._effectiveSkill(f.data),57);
  }
});
test('Kai-surge needs more than six EP; Mindblast and Kai-surge never combine',()=>{
  for(const [ep,bonus]of [[6,0],[7,8]]) {
    const f=fixture(0,{endurance:ep,nextPsychic:'surge'});
    assert.equal(f.core._effectiveSkill(f.data),20+bonus);
  }
  const f=fixture(0,{nextPsychic:'blast'});assert.equal(f.core._effectiveSkill(f.data),24);
  f.data.combatEffects.psychic='surge';assert.equal(f.core._effectiveSkill(f.data),28);
});
test('printed psychic defenses allow only the attacks stated in the book',()=>{
  for(const section of [43,60,94,120,162,204,210,248,266,279,300,303]) {
    const f=fixture(section,{nextPsychic:'blast'});assert.equal(f.core._psychic(f.data),'none');
    f.data.combatEffects.psychic='surge';assert.equal(f.core._psychic(f.data),'surge');
  }
  const f=fixture(50,{nextPsychic:'surge'});assert.equal(f.core._psychic(f.data),'none');
});
test('stunned Deathstalker protection includes first-round Kai-surge cost',()=>{
  const f=fixture(94,{nextPsychic:'surge'});f.core._runRound();assert.equal(f.data.endurance,100);
  f.core._runRound();assert.ok(f.data.endurance<100);
});
test('Svolta opening bonuses expire and Otokh restricted movement lasts',()=>{
  const f=fixture(44);assert.equal(f.core._effectiveSkill(f.data),34);
  f.data.roundsThisBattle=2;assert.equal(f.core._effectiveSkill(f.data),37);
  for(const section of [192,257,261]) {
    const g=fixture(section);assert.equal(g.core._effectiveSkill(g.data),39);
    g.data.roundsThisBattle=1;assert.equal(g.core._effectiveSkill(g.data),37);
  }
  const g=fixture(162);g.data.roundsThisBattle=9;assert.equal(g.core._effectiveSkill(g.data),37);
});
test('henchmen victory routes depend on completed rounds without a forced stop',()=>{
  for(const [rounds,route]of [[4,289],[5,195]]) {
    const f=fixture(31);f.data.roundsThisBattle=rounds;f.data.enemy.endurance=0;
    f.core._checkBattleEnd(f.data);assert.equal(f.data.combatEffects.route,route);
  }
  assert.equal(rules['section:31:slot:0'].roundLimit,undefined);
});
test('Raiders allow evasion after three rounds and Deliverance has its printed threshold',()=>{
  const f=fixture(21);assert.equal(f.core._escapeRule(f.data),undefined);
  f.data.roundsThisBattle=3;assert.equal(f.core._escapeRule(f.data).route,13);
  const g=fixture(0,{endurance:8,nextDeliverance:true,nextCuringReady:true});
  assert.equal(g.core._healingAvailable(g.data),true);g.core._heal(g.data);
  assert.equal(g.data.endurance,28);assert.equal(g.core._healingAvailable(g.data),false);
});
