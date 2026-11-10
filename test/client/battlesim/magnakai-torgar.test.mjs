import test from 'node:test';
import assert from 'node:assert/strict';
import {readRosterDocument} from '../../helpers/roster-db.cjs';
import {createMagnakaiCombat} from '../../../public/js/battlesim/engines/lone-wolf/magnakai-combat.js';
import {createMagnakaiState} from '../../../public/js/battlesim/engines/lone-wolf/magnakai-state.js';
import {definition} from '../../../public/js/battlesim/books/330/definition.js';
import {COMBAT_TABLE as established} from '../../../public/js/battlesim/engines/lone-wolf/combat-table.js';

const entries=readRosterDocument(330).enemies.map(row=>row.stats.entry);
const rules=Object.fromEntries(entries.map(entry=>[entry.key,entry.rules]));
const table=entries.find(entry=>entry.combatTable).combatTable;
function fixture(section=0,options={},slot=0){
  let run={},pick=1,core;
  const store=createMagnakaiState(definition,()=>({currentBookId:330,currentPlaythrough:()=>run,health:core._health}));
  core=createMagnakaiCombat(()=>({...core,COMBAT_TABLE:table,ENCOUNTER_RULES:rules,effectControls:definition.controls,
    _data:store.data,_appendLog:store.appendLog,_recordOutcome:store.recordOutcome,_battleOver:store.battleOver,
    _pick10:()=>pick,_renderAll(){},saveState(){},t:key=>key,escapeHtml:String,SVG_SKULL:'',SVG_TROPHY:''}),'battlesim330');
  const entry=entries.filter(e=>e.section===section)[slot],data=store.data();
  Object.assign(data,{rolled:true,combatSkill:20,combatSkillInitial:20,endurance:100,enduranceInitial:100,
    nextSection:section,nextEncounterKey:entry?.key??'',...options});
  data.enemy={name:entry?.name??'Custom opponent',skill:entry?.skill??20,endurance:entry?.stamina??100,enduranceMax:entry?.stamina??100};
  core._captureFightEffects(data);
  return {get data(){return store.data();},core,store,pick(value){pick=value;},restore(){run=JSON.parse(JSON.stringify(run));}};
}


test('the printed roster has 43 encounters, 44 opponents and the original chart',()=>{
 assert.equal(entries.length,44);assert.equal(new Set(entries.map(e=>e.section)).size,43);
 assert.equal(new Set(entries.map(e=>e.key)).size,44);assert.deepEqual(table,established);
 assert.equal(definition.enduranceStep,0.5);assert.equal(definition.supportsArchery,false);
 assert.deepEqual(entries.filter(e=>e.section===274).map(e=>[e.skill,e.stamina]),[[18,31],[17,29]]);
});
test('Akataz psychic bonuses double or triple only when the captured Spirit circle applies',()=>{
 for(const section of[81,254])for(const psychic of['none','blast','surge'])for(const spirit of[false,true]){
  const f=fixture(section,{nextPsychic:psychic,nextSpirit:spirit});
  assert.equal(f.core._effectiveSkill(f.data),20+(psychic==='blast'?2:psychic==='surge'?4:0)*(spirit?3:2));
  f.data.nextSpirit=!spirit;assert.equal(f.core._effectiveSkill(f.data),20+(psychic==='blast'?2:psychic==='surge'?4:0)*(spirit?3:2));
 }
 const tired=fixture(81,{nextSpirit:true,nextPsychic:'surge',endurance:6});assert.equal(tired.core._effectiveSkill(tired.data),20);
 const plain=fixture(2,{nextSpirit:true,nextPsychic:'surge'});assert.equal(plain.core._effectiveSkill(plain.data),24);
});
test('first-round surprise and attack bonuses expire while persistent allies remain',()=>{
 for(const tracking of[false,true]){const f=fixture(28,{nextTracking:tracking});assert.equal(f.core._effectiveSkill(f.data),tracking?20:17);f.data.roundsThisBattle=1;assert.equal(f.core._effectiveSkill(f.data),20);}
 const rush=fixture(251);assert.equal(rush.core._effectiveSkill(rush.data),22);rush.data.roundsThisBattle=1;assert.equal(rush.core._effectiveSkill(rush.data),20);
 for(const s of[168,245,288]){const f=fixture(s);f.data.roundsThisBattle=7;assert.equal(f.core._effectiveSkill(f.data),22);}
 assert.equal(fixture(118,{nextAnimal:true}).core._effectiveSkill(fixture(118,{nextAnimal:true}).data),22);
});
test('Lapillibore restrictions and the wolf first-round unarmed setup preserve equipment timing',()=>{
 for(const mastery of[false,true])for(const weapon of[false,true]){
  const f=fixture(54,{nextUnarmedMastery:mastery,nextWeapon:weapon});assert.equal(f.core._effectiveSkill(f.data),17-(weapon?0:mastery?2:4));
 }
 for(const mastery of[false,true]){const f=fixture(336,{attackModifier:8,nextUnarmedMastery:mastery});assert.equal(f.core._effectiveSkill(f.data),mastery?18:16);f.data.roundsThisBattle=1;assert.equal(f.core._effectiveSkill(f.data),28);}
 const hanging=fixture(304);assert.equal(hanging.core._effectiveSkill(hanging.data),17);
});
test('half table loss keeps fractional EP and leaves psychic expenditure and automatic death intact',()=>{
 const f=fixture(172,{combatSkill:29});f.pick(1);f.core._runRound();assert.equal(f.data.endurance,97.5);
 const surge=fixture(172,{combatSkill:25,nextPsychic:'surge'});surge.pick(1);surge.core._runRound();assert.equal(surge.data.endurance,95.5);
 const doomed=fixture(172,{combatSkill:1});doomed.pick(1);doomed.core._runRound();assert.equal(doomed.data.endurance,0);assert.equal(doomed.data.history[0].outcome,'loss');
});
test('printed round limits block extra rolls, permit last-round victories and retain death priority',()=>{
 for(const [section,limit,route,winRoute]of[[41,3,10,326],[187,4,234,202],[336,4,234,202],[349,4,234,202]]){
  const f=fixture(section,{combatSkill:30});f.data.enemy.endurance=f.data.enemy.enduranceMax=1000;f.pick(1);
  for(let i=0;i<limit;i++)f.core._runRound();assert.equal(f.data.roundsThisBattle,limit);assert.equal(f.data.combatEffects.route,route);assert.equal(f.data.history.length,0);
  const saved=JSON.stringify(f.data);f.pick(10);f.core._runRound();assert.equal(JSON.stringify(f.data),saved);
  const win=fixture(section,{combatSkill:100,roundsThisBattle:limit-1});win.pick(0);win.core._runRound();assert.equal(win.data.combatEffects.route,winRoute);assert.equal(win.data.history[0].outcome,'win');
  const dead=fixture(section,{combatSkill:1,endurance:1,roundsThisBattle:limit-1});dead.pick(1);dead.core._runRound();assert.equal(dead.data.history[0].outcome,'loss');assert.equal(dead.data.combatEffects.route,undefined);
 }
});
test('unlimited fights use their original early and late victory continuations',()=>{
 for(const [section,limit,early,late]of[[28,4,169,309],[126,4,11,321],[180,2,316,261],[245,4,169,309]])for(const [prior,route]of[[limit-1,early],[limit,late]]){
  const f=fixture(section,{combatSkill:100,roundsThisBattle:prior});f.pick(0);f.core._runRound();assert.equal(f.data.combatEffects.route,route);assert.equal(f.data.history[0].outcome,'win');
 }
});
test('Tagazin becomes a nonfatal reader continuation even after an automatic kill',()=>{
 const weakened=fixture(286);weakened.data.enemy.endurance=20;weakened.core._checkBattleEnd(weakened.data);assert.equal(weakened.data.combatEffects.route,20);assert.equal(weakened.data.history.length,0);
 const kill=fixture(286,{combatSkill:100});kill.pick(0);kill.core._runRound();assert.equal(kill.data.enemy.endurance,0);assert.equal(kill.data.combatEffects.route,20);assert.equal(kill.data.history.length,0);
 const dead=fixture(286,{combatSkill:1,endurance:1});dead.pick(1);dead.core._runRound();assert.equal(dead.data.history[0].outcome,'loss');assert.equal(dead.data.combatEffects.route,undefined);
});
test('two swordsmen continue by stable keys and record only one outcome after reload',()=>{
 for(const slot of[0,1]){const f=fixture(274,{combatSkill:100},slot);f.pick(0);f.data.enemy.name='Renamed';f.core._runRound();
 if(!slot){assert.equal(f.data.history.length,0);assert.equal(f.data.combatEffects.ruleKey,'section:274:slot:1');assert.equal(f.data.enemy.skill,17);f.restore();f.core._runRound();}
 assert.equal(f.data.history.length,1);assert.equal(f.data.combatEffects.route,68);f.core._runRound();assert.equal(f.data.history.length,1);}
});
test('immediate evasion skips the roll; gated evasion takes a normal player-only round',()=>{
 for(const [section,route]of[[81,340],[132,23],[216,23]]){const f=fixture(section);f.pick(10);f.core._escape();assert.equal(f.data.roundsThisBattle,0);assert.equal(f.data.endurance,100);assert.equal(f.data.combatEffects.route,route);assert.equal(f.data.history.length,0);}
 for(const [section,minimum,route]of[[113,3,229],[118,2,39]]){const f=fixture(section,{combatSkill:40});f.data.roundsThisBattle=minimum-1;assert.equal(f.core._escapeRoute(f.data),0);f.data.roundsThisBattle=minimum;const enemy=f.data.enemy.endurance;f.core._escape();assert.equal(f.data.roundsThisBattle,minimum+1);assert.equal(f.data.enemy.endurance,enemy);assert.equal(f.data.combatEffects.route,route);assert.equal(f.data.history.length,0);}
});
test('Mindblast immunity, undead damage and manual setup effects stay separate',()=>{
 for(const section of[76,113,133,148,168,180,211,252,286,311]){const blast=fixture(section,{nextPsychic:'blast'}),surge=fixture(section,{nextPsychic:'surge'});assert.equal(blast.core._psychic(blast.data),'none');assert.equal(surge.core._psychic(surge.data),'surge');}
 const ghost=fixture(133,{combatSkill:32});ghost.pick(1);ghost.core._runRound();assert.equal(ghost.data.enemy.endurance,34);
 for(const section of[208,254])assert.equal(fixture(section).data.endurance,100,'entry wounds remain a reader action');
 const invalid=fixture(2);invalid.pick(10);const saved=JSON.stringify(invalid.data);assert.throws(()=>invalid.core._runRound(),RangeError);assert.equal(JSON.stringify(invalid.data),saved);
});
