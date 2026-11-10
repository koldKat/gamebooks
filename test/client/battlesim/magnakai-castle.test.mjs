import test from 'node:test';
import assert from 'node:assert/strict';
import {readRosterDocument} from '../../helpers/roster-db.cjs';
import {createMagnakaiCombat} from '../../../public/js/battlesim/engines/lone-wolf/magnakai-combat.js';
import {createMagnakaiState} from '../../../public/js/battlesim/engines/lone-wolf/magnakai-state.js';
import {COMBAT_TABLE as established} from '../../../public/js/battlesim/engines/lone-wolf/combat-table.js';

const entries=readRosterDocument(327).enemies.map(row=>row.stats.entry);
const rules=Object.fromEntries(entries.map(entry=>[entry.key,entry.rules]));
const table=entries.find(entry=>entry.combatTable).combatTable;
function fixture(section=8,options={},slot=0){
  let run={},pick=1,core;
  const store=createMagnakaiState({id:327,stateKey:'sim327'},()=>({currentBookId:327,currentPlaythrough:()=>run,health:core._health}));
  core=createMagnakaiCombat(()=>({...core,COMBAT_TABLE:table,ENCOUNTER_RULES:rules,_data:store.data,
    _appendLog:store.appendLog,_recordOutcome:store.recordOutcome,_battleOver:store.battleOver,
    _pick10:()=>pick,_renderAll(){},saveState(){},t:key=>key,escapeHtml:String,SVG_SKULL:'',SVG_TROPHY:''}),'battlesim327');
  const entry=entries.filter(e=>e.section===section)[slot],data=store.data();
  Object.assign(data,{rolled:true,combatSkill:20,combatSkillInitial:20,endurance:100,enduranceInitial:100,
    nextSection:section,nextEncounterKey:entry?.key??'',...options});
  data.enemy={name:entry?.name??'Custom opponent',skill:entry?.skill??20,endurance:entry?.stamina??100,enduranceMax:entry?.stamina??100};
  core._captureFightEffects(data);
  return {data,core,store,pick(value){pick=value;},restore(){run=JSON.parse(JSON.stringify(run));return store.data();}};
}

test('reviewed database roster has forty distinct slots, thirty-nine sections and one source chart',()=>{
  assert.equal(entries.length,40);assert.equal(new Set(entries.map(e=>e.section)).size,39);
  assert.equal(new Set(entries.map(e=>e.key)).size,40);assert.deepEqual(table,established);
  assert.equal(entries.filter(e=>e.combatTable).length,1);
  assert.deepEqual(entries.filter(e=>e.section===212).map(e=>[e.skill,e.stamina]),[[17,23],[16,21]]);
});
test('temporary penalties, disciplines and clothing apply only as printed',()=>{
  for(const [section,penalty,rounds]of[[19,-3,2],[27,-3,3],[219,-4,2]]){
    const f=fixture(section);assert.equal(f.core._effectiveSkill(f.data),20+penalty);
    f.data.roundsThisBattle=rounds;assert.equal(f.core._effectiveSkill(f.data),20);
  }
  for(const section of[19,27]){const f=fixture(section,{nextTracking:true});assert.equal(f.core._effectiveSkill(f.data),20);}
  for(const [section,flag,expected]of[[45,'nextCircleLight',22],[118,'nextTracking',22],[214,'nextNexus',20],[257,'nextCloth',19]]){
    const f=fixture(section,{[flag]:true});assert.equal(f.core._effectiveSkill(f.data),expected);
  }
  const wrapped=fixture(257,{nextTracking:true,nextCloth:true});assert.equal(wrapped.core._effectiveSkill(wrapped.data),21);
  assert.equal(fixture(27).data.combatEffects.mace,undefined);
});
test('Curing and Nexus suppress only their associated table damage multiplier',()=>{
  for(const [section,flag]of[[126,'nextNexus'],[178,'nextCuring'],[219,'nextCuring'],[285,'nextCuring'],[301,'nextCuring']]){
    const normal=fixture(section),protectedFight=fixture(section,{[flag]:true});
    normal.core._runRound();protectedFight.core._runRound();
    assert.equal(100-normal.data.endurance,2*(100-protectedFight.data.endurance));
  }
  const f=fixture(76);f.core._runRound();
  const ratio=20-16;assert.equal(100-f.data.endurance,3*table[0][f.core._ratioCol(ratio)][1]);
});
test('Psi-surge costs are separate from table multipliers and stop at six EP',()=>{
  const f=fixture(178,{nextPsychic:'surge'}),ratio=24-15;
  f.core._runRound();assert.equal(100-f.data.endurance,2*table[0][f.core._ratioCol(ratio)][1]+2);
  f.data.endurance=6;assert.equal(f.core._psychic(f.data),'none');assert.equal(f.core._effectiveSkill(f.data),20);
  for(const section of[8,78,118,126,198,202,235,245]){
    const f=fixture(section,{nextPsychic:'blast'});assert.equal(f.core._psychic(f.data),'none');
    f.data.combatEffects.psychic='surge';assert.equal(f.core._psychic(f.data),'surge');
  }
  for(const section of[93,174])assert.equal(fixture(section,{nextPsychic:'surge'}).core._psychic(fixture(section,{nextPsychic:'surge'}).data),'none');
});
test('psychic weakness and companion double enemy losses without doubling psychic costs',()=>{
  for(const [section,psychic,enabled]of[[233,'none',false],[233,'blast',true],[233,'surge',true],[290,'none',true]]){
    const f=fixture(section,{nextPsychic:psychic});const start=f.data.enemy.endurance;
    const expected=table[0][f.core._ratioCol(f.core._effectiveSkill(f.data)-f.data.enemy.skill)][0];
    f.core._runRound();assert.equal(start-f.data.enemy.endurance,Math.min(start,expected*(enabled?2:1)));
  }
  const oxygen=fixture(325);oxygen.core._runRound();
  assert.equal(100-oxygen.data.endurance,table[0][oxygen.core._ratioCol(10)][1]+2);
});
test('safe invisibility and abandoning the door use no combat round; ordinary evasion does',()=>{
  for(const [section,options,route]of[[221,{nextInvisibility:true},70],[214,{},277]]){
    const f=fixture(section,options);f.pick(10);f.core._escape();
    assert.equal(f.data.roundsThisBattle,0);assert.equal(f.data.endurance,100);
    assert.equal(f.data.combatEffects.route,route);assert.equal(f.data.history.length,0);
  }
  const zag=fixture(221);assert.equal(zag.core._escapeRoute(zag.data),0);
  zag.data.roundsThisBattle=2;assert.equal(zag.core._escapeRoute(zag.data),229);
  zag.core._escape();assert.equal(zag.data.roundsThisBattle,3);assert.equal(zag.data.enemy.endurance,28);
  for(const [section,rounds]of[[19,3],[45,3],[249,3],[257,3],[301,4]]){
    const f=fixture(section);f.data.roundsThisBattle=rounds-1;assert.equal(f.core._escapeRoute(f.data),0);
    f.data.roundsThisBattle=rounds;assert(f.core._escapeRoute(f.data));
  }
  for(const section of[253,314]){const f=fixture(section);f.core._escape();assert.equal(f.data.roundsThisBattle,1);assert.equal(f.data.combatEffects.route,277);}
  assert.equal(fixture(299).core._escapeRoute(fixture(299).data),0);
});
test('two explicit gaoler slots preserve a single fight and award one victory',()=>{
  const f=fixture(212,{combatSkill:100});f.pick(0);f.data.enemy.name='Renamed first opponent';f.core._runRound();
  assert.equal(f.data.enemy.skill,16);assert.equal(f.data.enemy.endurance,21);assert.equal(f.data.history.length,0);
  assert.equal(f.data.roundsThisBattle,1);assert.equal(f.data.combatEffects.followupUsed,true);
  const saved=f.restore();f.core._runRound();assert.equal(saved.history.length,1);assert.equal(saved.history[0].outcome,'win');assert.equal(saved.combatEffects.route,80);
  f.core._runRound();assert.equal(saved.history.length,1);
  const second=fixture(212,{combatSkill:100},1);second.pick(0);second.core._runRound();
  assert.equal(second.data.history.length,1);assert.equal(second.data.combatEffects.followupUsed,undefined);
});
test('the giant fist expires after four rounds without inventing a kill',()=>{
  const f=fixture(280);f.data.enemy.endurance=f.data.enemy.enduranceMax=1000;
  for(let n=0;n<4;n++)f.core._runRound();
  assert.equal(f.data.roundsThisBattle,4);assert.equal(f.data.combatEffects.route,156);assert.equal(f.data.history.length,0);
  const frozen=JSON.stringify(f.data);f.core._runRound();assert.equal(JSON.stringify(f.data),frozen);
  for(const [priorRounds,route]of[[0,291],[3,156]]){
    const win=fixture(280,{combatSkill:100});win.data.roundsThisBattle=priorRounds;win.pick(0);win.core._runRound();
    assert.equal(win.data.combatEffects.route,route);assert.equal(win.data.history.length,1);
  }
});
test('simultaneous deaths and stale rounds cannot award duplicate results',()=>{
  const f=fixture(0);f.data.enemy.endurance=f.data.endurance=1;f.core._runRound();
  assert.equal(f.data.history.length,1);assert.equal(f.data.history[0].outcome,'loss');
  f.core._runRound();assert.equal(f.data.history.length,1);
  const invalid=fixture(8);invalid.pick(10);const before=JSON.stringify(invalid.data);
  assert.throws(()=>invalid.core._runRound());assert.equal(JSON.stringify(invalid.data),before);
});
test('custom names do not select preset rules and reader entry effects are never applied twice',()=>{
  const custom=fixture(0);custom.data.enemy.name='Gaoler No. 1 §212';custom.core._captureFightEffects(custom.data);
  assert.equal(custom.data.combatEffects.section,0);assert.deepEqual(custom.core._rulesFor(custom.data.combatEffects.ruleKey),{});
  for(const section of[118,198,219,257])assert.equal(fixture(section,{endurance:12}).data.endurance,12);
});
