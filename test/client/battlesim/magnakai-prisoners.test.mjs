import test from 'node:test';
import assert from 'node:assert/strict';
import {readRosterDocument} from '../../helpers/roster-db.cjs';
import {createMagnakaiCombat} from '../../../public/js/battlesim/engines/lone-wolf/magnakai-combat.js';
import {createMagnakaiState} from '../../../public/js/battlesim/engines/lone-wolf/magnakai-state.js';
import {definition} from '../../../public/js/battlesim/books/331/definition.js';
import {COMBAT_TABLE as established} from '../../../public/js/battlesim/engines/lone-wolf/combat-table.js';

const entries=readRosterDocument(331).enemies.map(row=>row.stats.entry);
const rules=Object.fromEntries(entries.map(entry=>[entry.key,entry.rules]));
const table=entries.find(entry=>entry.combatTable).combatTable;
function fixture(section=0,options={}){
  let run={},pick=1,core;
  const store=createMagnakaiState(definition,()=>({currentBookId:331,currentPlaythrough:()=>run,health:core._health}));
  core=createMagnakaiCombat(()=>({...core,COMBAT_TABLE:table,ENCOUNTER_RULES:rules,effectControls:definition.controls,
    numericEffectControls:definition.numericControls,
    _data:store.data,_appendLog:store.appendLog,_recordOutcome:store.recordOutcome,_battleOver:store.battleOver,
    _pick10:()=>pick,_renderAll(){},saveState(){},t:key=>key,escapeHtml:String,SVG_SKULL:'',SVG_TROPHY:''}),'battlesim331');
  const entry=entries.find(e=>e.section===section),data=store.data();
  Object.assign(data,{rolled:true,combatSkill:20,combatSkillInitial:20,endurance:100,enduranceInitial:100,
    nextSection:section,nextEncounterKey:entry?.key??'',...options});
  data.enemy={name:entry?.name??'Custom opponent',skill:entry?.skill??20,endurance:entry?.stamina??100,enduranceMax:entry?.stamina??100};
  core._captureFightEffects(data);
  return {get data(){return store.data();},core,pick(value){pick=value;},restore(){run=JSON.parse(JSON.stringify(run));}};
}

test('all 40 printed encounters use the original chart and unique keys',()=>{
 assert.equal(entries.length,40);assert.equal(new Set(entries.map(e=>e.section)).size,40);
 assert.deepEqual(table,established);
 for(const e of entries){assert.equal(e.key,`section:${e.section}:slot:0`);assert.ok(e.skill>0&&e.stamina>0);assert.ok(e.name.endsWith('§'+e.section));}
 assert.deepEqual(entries.filter(e=>[204,341].includes(e.section)).map(e=>[e.skill,e.stamina]),[[38,54],[44,62]]);
});
test('Scarlet Warrior normal depletion and automatic kills follow different printed routes',()=>{
 for(const s of[22,97,206,274]){
  const f=fixture(s,{combatSkill:29});f.data.enemy.skill=29;f.data.enemy.endurance=21;f.pick(1);f.core._runRound();
  assert.equal(f.data.combatEffects.route,306);assert.equal(f.data.history.length,0);
  const k=fixture(s,{combatSkill:100});k.pick(0);k.core._runRound();assert.equal(k.data.combatEffects.route,123);assert.equal(k.data.history[0].outcome,'win');
  k.restore();k.core._runRound();assert.equal(k.data.history.length,1);
  const numeric=fixture(s,{combatSkill:29});numeric.data.enemy.skill=29;numeric.data.enemy.endurance=1;numeric.pick(1);numeric.core._runRound();assert.equal(numeric.data.combatEffects.route,306);
  const dead=fixture(s,{combatSkill:0,endurance:1});dead.pick(1);dead.core._runRound();assert.equal(dead.data.history[0].outcome,'loss');assert.equal(dead.data.combatEffects.route,undefined);
 }
});
test('unarmed opening rounds honor ordinary, Tutelary and Scion-kai penalties',()=>{
 for(const [section,rounds]of[[10,2],[220,1]])for(const [mastery,scion,penalty]of[[false,false,4],[true,false,2],[false,true,1],[true,true,1]]){
  const f=fixture(section,{attackModifier:8,nextUnarmedMastery:mastery,nextScion:scion});
  for(let i=0;i<rounds;i++){f.data.roundsThisBattle=i;assert.equal(f.core._effectiveSkill(f.data),20-penalty);}
  f.data.roundsThisBattle=rounds;assert.equal(f.core._effectiveSkill(f.data),28);
 }
});
test('Huntmastery prevents only the printed surprise penalties',()=>{
 for(const [section,rounds,penalty]of[[68,2,3],[77,2,3],[319,2,3],[256,1,2]])for(const tracking of[false,true]){
  const f=fixture(section,{nextTracking:tracking});assert.equal(f.core._effectiveSkill(f.data),20-(tracking?0:penalty));f.data.roundsThisBattle=rounds;assert.equal(f.core._effectiveSkill(f.data),20);
 }
});
test('Curing at Mentora prevents tentacle poison without suppressing Psi-surge cost',()=>{
 for(const s of[34,298])for(const curing of[false,true]){
  const f=fixture(s,{combatSkill:8,nextPsychic:'surge',nextCuringMentora:curing});f.pick(1);f.core._runRound();
  assert.equal(f.data.endurance,100-5-2-(curing?0:2));
 }
});
test('mind combat captures disciplines and rings, excludes weapon modifiers and survives reload',()=>{
 const f=fixture(270,{combatSkill:20,attackModifier:100,nextExtraDisciplines:5,nextPsychicRing:true,nextGreyRing:true,nextPsychic:'surge'});
 assert.equal(f.core._effectiveSkill(f.data),35);
 f.data.nextExtraDisciplines=0;f.data.nextPsychicRing=false;f.restore();assert.equal(f.core._effectiveSkill(f.data),35);
 f.data.endurance=6;assert.equal(f.core._effectiveSkill(f.data),31);
 const custom=fixture(0,{attackModifier:8,nextExtraDisciplines:7,nextPsychicRing:true,nextGreyRing:true});assert.equal(custom.core._effectiveSkill(custom.data),28);
});
test('hound weapon restrictions and early versus late victories stay encounter-specific',()=>{
 const f=fixture(201,{nextAwkwardWeapon:true});assert.equal(f.core._effectiveSkill(f.data),18);
 for(const [prior,route]of[[2,254],[3,37]]){const w=fixture(201,{combatSkill:100,roundsThisBattle:prior});w.pick(0);w.core._runRound();assert.equal(w.data.combatEffects.route,route);assert.equal(w.data.history.length,1);}
 const unrelated=fixture(31,{nextAwkwardWeapon:true});assert.equal(unrelated.core._effectiveSkill(unrelated.data),20);
});
test('psychic immunity and doubled Guakor bonuses preserve the normal surge expenditure',()=>{
 for(const psychic of['blast','surge']){const f=fixture(120,{nextPsychic:psychic});assert.equal(f.core._psychic(f.data),'none');assert.equal(f.core._effectiveSkill(f.data),20);}
 for(const [psychic,bonus]of[['blast',4],['surge',8]]){const f=fixture(227,{combatSkill:23-bonus,nextPsychic:psychic});assert.equal(f.core._effectiveSkill(f.data),23);f.pick(1);f.core._runRound();assert.equal(f.data.endurance,95-(psychic==='surge'?2:0));}
 assert.equal(fixture(204).core._effectiveSkill(fixture(204).data),28);
 for(const spirit of[false,true]){const f=fixture(341,{nextSpirit:spirit});assert.equal(f.core._effectiveSkill(f.data),spirit?22:20);}
});
test('evasion respects rounds and the manually supplied Baylon Tomb condition',()=>{
 for(const [section,route]of[[37,303],[103,298],[187,298]]){const f=fixture(section);f.data.roundsThisBattle=2;assert.equal(f.core._escapeRoute(f.data),0);f.data.roundsThisBattle=3;assert.equal(f.core._escapeRoute(f.data),route);}
 for(const visited of[false,true]){const f=fixture(298,{nextVisitedTomb:visited});assert.equal(f.core._escapeRoute(f.data),visited?0:166);}
 const ordinary=fixture(41);assert.equal(ordinary.core._escapeRoute(ordinary.data),0);
});
