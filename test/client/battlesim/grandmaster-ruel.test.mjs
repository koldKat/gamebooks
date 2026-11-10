import test from 'node:test';
import assert from 'node:assert/strict';
import {readRosterDocument} from '../../helpers/roster-db.cjs';
import {createMagnakaiCombat} from '../../../public/js/battlesim/engines/lone-wolf/magnakai-combat.js';
import {createMagnakaiState} from '../../../public/js/battlesim/engines/lone-wolf/magnakai-state.js';
import {definition} from '../../../public/js/battlesim/books/333/definition.js';
import {COMBAT_TABLE as established} from '../../../public/js/battlesim/engines/lone-wolf/combat-table.js';

const entries=readRosterDocument(333).enemies.map(row=>row.stats.entry);
const rules=Object.fromEntries(entries.map(entry=>[entry.key,entry.rules]));
const table=entries.find(entry=>entry.combatTable).combatTable;
function fixture(section=0,options={}){
  let run={},pick=1,core;
  const store=createMagnakaiState(definition,()=>({currentBookId:333,currentPlaythrough:()=>run,health:core._health}));
  core=createMagnakaiCombat(()=>({...core,COMBAT_TABLE:table,ENCOUNTER_RULES:rules,effectControls:definition.controls,
    numericEffectControls:definition.numericControls,combatOptions:definition.combatOptions,
    _data:store.data,_appendLog:store.appendLog,_recordOutcome:store.recordOutcome,_battleOver:store.battleOver,
    _pick10:()=>pick,_renderAll(){},saveState(){},t:key=>key,escapeHtml:String,SVG_SKULL:'',SVG_TROPHY:''}),'battlesim333');
  const entry=entries.find(e=>e.section===section),data=store.data();
  Object.assign(data,{rolled:true,combatSkill:20,combatSkillInitial:20,endurance:100,enduranceInitial:100,
    nextSection:section,nextEncounterKey:entry?.key??'',...options});
  data.enemy={name:entry?.name??'Custom opponent',skill:entry?.skill??20,endurance:entry?.stamina??100,enduranceMax:entry?.stamina??100};
  core._captureFightEffects(data);
  return {get data(){return store.data();},core,pick(value){pick=value;},restore(){run=JSON.parse(JSON.stringify(run));}};
}

test('51 distinct encounters use the original chart and Grand Master starting stats',()=>{
  assert.equal(entries.length,51);assert.equal(new Set(entries.map(e=>e.section)).size,51);
  assert.deepEqual(table,established);assert.deepEqual(definition.roll,{skill:25,endurance:30});
  assert.deepEqual(entries.filter(e=>[38,80,131,221,325].includes(e.section)).map(e=>[e.section,e.skill,e.stamina]),
    [[38,50,80],[80,38,60],[131,46,36],[221,32,36],[325,36,34]]);
});
test('three exclusive psychic powers have separate bonuses, costs and EP thresholds',()=>{
  for(const [power,bonus,cost,threshold]of[['blast',4,0,-1],['surge',6,1,4],['kai',8,1,6]]){
    const f=fixture(0,{combatSkill:20-bonus,nextPsychic:power});assert.equal(f.core._effectiveSkill(f.data),20);
    f.core._runRound();assert.equal(f.data.endurance,95-cost);f.restore();
    if(threshold>=0){f.data.endurance=threshold;assert.equal(f.core._psychic(f.data),'none');f.data.endurance++;assert.equal(f.core._psychic(f.data),power);}
  }
  const special=fixture(301,{nextPsychic:'kai'});assert.equal(special.core._effectiveSkill(special.data),30);
  const ordinary=fixture(301,{nextPsychic:'surge'});assert.equal(ordinary.core._effectiveSkill(ordinary.data),26);
});
test('printed immunities distinguish Mindblast, Psi-surge and Kai-surge',()=>{
  for(const section of[31,45,120,156,157,186,212,243])for(const power of['blast','surge','kai']){
    const f=fixture(section,{nextPsychic:power});assert.equal(f.core._psychic(f.data),power==='kai'?'kai':'none');
  }
  for(const section of[47,56,202,291,339])for(const power of['blast','surge','kai']){
    const f=fixture(section,{nextPsychic:power});assert.equal(f.core._psychic(f.data),'none');
  }
  for(const power of['blast','surge','kai']){const f=fixture(295,{nextPsychic:power});assert.equal(f.core._psychic(f.data),power==='blast'?'none':power);}
});
test('Deliverance is an explicit living-combat action at eight EP, once per readiness',()=>{
  const f=fixture(0,{endurance:8,nextDeliverance:true,nextCuringReady:true});assert.equal(f.core._healingAvailable(f.data),true);
  f.core._heal(f.data);assert.equal(f.data.endurance,28);assert.equal(f.data.nextCuringReady,false);f.restore();assert.equal(f.core._healingAvailable(f.data),false);
  for(const options of[{endurance:0},{endurance:9},{nextDeliverance:false},{nextCuringReady:false}]){
    const g=fixture(0,{endurance:8,nextDeliverance:true,nextCuringReady:true,...options});assert.equal(g.core._healingAvailable(g.data),false);
  }
});
test('unarmed, awkward weapons and surprise modifiers apply for their printed rounds',()=>{
  const f=fixture(27,{attackModifier:8});assert.equal(f.core._effectiveSkill(f.data),20);f.data.roundsThisBattle=2;assert.equal(f.core._effectiveSkill(f.data),20);
  f.data.roundsThisBattle=3;assert.equal(f.core._effectiveSkill(f.data),28);
  for(const [s,penalty]of[[47,4],[339,4],[243,9],[295,8]]){
    const g=fixture(s,{nextNonEdged:true,nextLongWeapon:true});assert.equal(g.core._effectiveSkill(g.data),20-penalty);
  }
  for(const [s,penalty,rounds]of[[272,20,1],[291,3,2]]){
    const g=fixture(s);assert.equal(g.core._effectiveSkill(g.data),20-penalty);g.data.roundsThisBattle=rounds;assert.equal(g.core._effectiveSkill(g.data),20);
  }
  for(const s of[221,325]){const g=fixture(s,{nextScreen:true}),unprotected=fixture(s);assert.equal(g.core._effectiveSkill(g.data),20);assert.equal(unprotected.core._effectiveSkill(unprotected.data),17);}
});
test('Giganite escape is optional at36 EP and still costs an ordinary evasion round',()=>{
  for(const s of[38,80]){
    const f=fixture(s,{combatSkill:entries.find(e=>e.section===s).skill});assert.equal(f.core._escapeRoute(f.data),0);
    f.data.enemy.endurance=37;assert.equal(f.core._escapeRoute(f.data),0);f.data.enemy.endurance=36;assert.equal(f.core._escapeRoute(f.data),13);
    f.core._escape();assert.equal(f.data.enemy.endurance,36);assert.equal(f.data.endurance,95);assert.equal(f.data.combatEffects.route,13);assert.equal(f.data.history.length,0);
    const win=fixture(s,{combatSkill:100});win.data.enemy.endurance=36;win.pick(0);win.core._runRound();assert.equal(win.data.combatEffects.route,286);assert.equal(win.data.history[0].outcome,'win');
  }
  for(const [s,rounds,route]of[[125,4,2],[295,6,63]]){const f=fixture(s);f.data.roundsThisBattle=rounds-1;assert.equal(f.core._escapeRoute(f.data),0);f.data.roundsThisBattle++;assert.equal(f.core._escapeRoute(f.data),route);}
});
test('Sommerswerd doubles undead loss, while Helshezag keeps its permanent cost',()=>{
  const a=fixture(131,{combatSkill:49}),b=fixture(131,{combatSkill:49,nextSommerwerd:true});a.core._runRound();b.core._runRound();
  assert.equal(36-b.data.enemy.endurance,2*(36-a.data.enemy.endurance));
  const h=fixture(0,{nextHelshezag:true});h.core._runRound();assert.equal(h.data.enduranceInitial,100);h.core._runRound();assert.equal(h.data.enduranceInitial,99);assert.equal(h.data.endurance,89);
});
test('winning speed selects only the printed continuation and records one outcome',()=>{
  for(const [s,boundary,early,late]of[[100,5,254,37],[221,4,64,114],[325,4,64,114]])for(const [rounds,route]of[[boundary-1,early],[boundary,late]]){
    const f=fixture(s,{combatSkill:100,roundsThisBattle:rounds});f.pick(0);f.core._runRound();assert.equal(f.data.combatEffects.route,route);assert.equal(f.data.history.length,1);
    f.core._runRound();assert.equal(f.data.history.length,1);
  }
});
