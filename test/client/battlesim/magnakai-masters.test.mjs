import test from 'node:test';
import assert from 'node:assert/strict';
import {readRosterDocument} from '../../helpers/roster-db.cjs';
import {createMagnakaiCombat} from '../../../public/js/battlesim/engines/lone-wolf/magnakai-combat.js';
import {createMagnakaiState} from '../../../public/js/battlesim/engines/lone-wolf/magnakai-state.js';
import {definition} from '../../../public/js/battlesim/books/332/definition.js';
import {COMBAT_TABLE as established} from '../../../public/js/battlesim/engines/lone-wolf/combat-table.js';

const entries=readRosterDocument(332).enemies.map(row=>row.stats.entry);
const rules=Object.fromEntries(entries.map(entry=>[entry.key,entry.rules]));
const table=entries.find(entry=>entry.combatTable).combatTable;
function fixture(section=0,options={}){
  let run={},pick=1,core;
  const store=createMagnakaiState(definition,()=>({currentBookId:332,currentPlaythrough:()=>run,health:core._health}));
  core=createMagnakaiCombat(()=>({...core,COMBAT_TABLE:table,ENCOUNTER_RULES:rules,effectControls:definition.controls,
    numericEffectControls:definition.numericControls,combatOptions:definition.combatOptions,
    _data:store.data,_appendLog:store.appendLog,_recordOutcome:store.recordOutcome,_battleOver:store.battleOver,
    _pick10:()=>pick,_renderAll(){},saveState(){},t:key=>key,escapeHtml:String,SVG_SKULL:'',SVG_TROPHY:''}),'battlesim332');
  const entry=entries.find(e=>e.section===section),data=store.data();
  Object.assign(data,{rolled:true,combatSkill:20,combatSkillInitial:20,endurance:100,enduranceInitial:100,
    nextSection:section,nextEncounterKey:entry?.key??'',...options});
  data.enemy={name:entry?.name??'Custom opponent',skill:entry?.skill??20,endurance:entry?.stamina??100,enduranceMax:entry?.stamina??100};
  core._captureFightEffects(data);
  return {get data(){return store.data();},core,pick(value){pick=value;},restore(){run=JSON.parse(JSON.stringify(run));}};
}

test('65 printed encounters retain the source chart, distinct variants and unique keys',()=>{
 assert.equal(entries.length,65);assert.equal(new Set(entries.map(e=>e.section)).size,65);assert.deepEqual(table,established);
 assert.deepEqual(entries.filter(e=>[35,75,88,133,192,230,275].includes(e.section)).map(e=>[e.section,e.skill,e.stamina]),[[35,10,100],[75,30,29],[88,50,70],[133,35,38],[192,32,100],[230,36,40],[275,36,38]]);
 assert.equal(new Set(entries.map(e=>e.key)).size,65);assert.ok(entries.every(e=>!e.name.includes('[')));
});
test('Archmaster psychic bonuses, thresholds and costs leave ordinary ranks unchanged',()=>{
 for(const [archmaster,skill,cost,threshold]of[[false,16,2,6],[true,14,1,4]]){
  const f=fixture(0,{combatSkill:skill,nextPsychic:'surge',nextArchmaster:archmaster});assert.equal(f.core._effectiveSkill(f.data),20);f.pick(1);f.core._runRound();assert.equal(f.data.endurance,95-cost);
  f.data.endurance=threshold;assert.equal(f.core._psychic(f.data),'none');f.data.endurance=threshold+1;assert.equal(f.core._psychic(f.data),'surge');
  const b=fixture(0,{nextPsychic:'blast',nextArchmaster:archmaster});assert.equal(b.core._effectiveSkill(b.data),archmaster?23:22);
 }
 const doubled=fixture(2,{nextPsychic:'surge',nextArchmaster:true});assert.equal(doubled.core._effectiveSkill(doubled.data),32);
 for(const s of[15,23,136,170,205,289]){const f=fixture(s,{nextPsychic:'surge',nextArchmaster:true});assert.equal(f.core._psychic(f.data),'none');}
});
test('Archmaster Curing is an explicit living-combat action, consumes readiness and survives reload',()=>{
 const f=fixture(0,{endurance:6,nextArchmaster:true,nextCuringReady:true});assert.equal(f.core._healingAvailable(f.data),true);f.core._heal(f.data);assert.equal(f.data.endurance,26);assert.equal(f.data.nextCuringReady,false);f.restore();assert.equal(f.core._healingAvailable(f.data),false);assert.throws(()=>f.core._heal(f.data),RangeError);
 for(const options of[{endurance:0},{endurance:7},{nextArchmaster:false},{nextCuringReady:false}]){const g=fixture(0,{endurance:6,nextArchmaster:true,nextCuringReady:true,...options});assert.equal(g.core._healingAvailable(g.data),false);}
 const capped=fixture(0,{endurance:6,enduranceInitial:14,nextArchmaster:true,nextCuringReady:true});capped.core._heal(capped.data);assert.equal(capped.data.endurance,14);
});
test('conditional unarmed openings respect Huntmastery, weapon timing and both mastery ranks',()=>{
 for(const [section,rounds]of[[23,1],[136,1],[259,2]])for(const tracking of[false,true]){
  const f=fixture(section,{attackModifier:8,nextTracking:tracking});assert.equal(f.core._effectiveSkill(f.data),tracking?28:16);f.data.roundsThisBattle=rounds;assert.equal(f.core._effectiveSkill(f.data),28);
 }
 for(const [mastery,scion,expected]of[[false,false,16],[true,false,18],[false,true,19],[true,true,19]]){
  const f=fixture(198,{attackModifier:20,nextUnarmedMastery:mastery,nextScion:scion});f.data.roundsThisBattle=20;assert.equal(f.core._effectiveSkill(f.data),expected);
 }
 const first=fixture(5,{attackModifier:8});assert.equal(first.core._effectiveSkill(first.data),16);first.data.roundsThisBattle=1;assert.equal(first.core._effectiveSkill(first.data),28);
});
test('Ictakko electricity costs EP only after a table wound and never for psychic expenditure alone',()=>{
 for(const s of[55,226,276])for(const nexus of[false,true]){
  const f=fixture(s,{combatSkill:s===276?28:25,nextNexusArchmaster:nexus});f.pick(1);f.core._runRound();assert.equal(f.data.endurance,95-(nexus?0:1));
  const clean=fixture(s,{combatSkill:s===276?28:25});clean.pick(0);clean.core._runRound();assert.equal(clean.data.endurance,100);
 }
 const psychic=fixture(55,{combatSkill:19,nextArchmaster:true,nextPsychic:'surge'});psychic.pick(0);psychic.core._runRound();assert.equal(psychic.data.endurance,99);
});
test('Kraagenskul first three rounds suppress even K results without the Dagger',()=>{
 const f=fixture(75,{combatSkill:100,attackModifier:8,nextOpeningModifier:-4});f.pick(0);
 for(let n=0;n<3;n++){f.core._runRound();assert.equal(f.data.enemy.endurance,29);assert.equal(f.data.history.length,0);}
 assert.equal(f.core._effectiveSkill(f.data),108);f.restore();f.core._runRound();assert.equal(f.data.combatEffects.route,240);assert.equal(f.data.history.length,1);
 const dagger=fixture(75,{combatSkill:20,attackModifier:8,nextOpeningModifier:3,nextDagger:true});assert.equal(dagger.core._effectiveSkill(dagger.data),30);dagger.pick(1);dagger.core._runRound();assert.equal(dagger.data.enemy.endurance,26);dagger.data.roundsThisBattle=3;assert.equal(dagger.core._effectiveSkill(dagger.data),28);
});
test('Helshezag permanently reduces both current and initial EP from round two',()=>{
 const f=fixture(0,{nextHelshezag:true});f.pick(1);f.core._runRound();assert.equal(f.data.endurance,95);assert.equal(f.data.enduranceInitial,100);f.restore();f.core._runRound();assert.equal(f.data.endurance,89);assert.equal(f.data.enduranceInitial,99);
 const forced=fixture(133,{combatSkill:28,roundsThisBattle:1});forced.pick(1);forced.core._runRound();assert.equal(forced.data.enduranceInitial,99);
 const sword=fixture(195,{nextHelshezag:true,roundsThisBattle:1,combatSkill:45});sword.pick(1);sword.core._runRound();assert.equal(sword.data.enduranceInitial,100);
 const unarmed=fixture(198,{nextHelshezag:true,roundsThisBattle:1,combatSkill:25});unarmed.pick(1);unarmed.core._runRound();assert.equal(unarmed.data.enduranceInitial,100);
});
test('Sea-scavenger lasting wounds begin after an unfavorable first round, retain armor accounting and exclude psychic cost',()=>{
 const f=fixture(268,{combatSkill:22});f.pick(1);f.core._runRound();assert.equal(f.data.combatEffects.lastingWounds,true);assert.equal(f.data.enduranceInitial,100);f.restore();f.core._runRound();assert.equal(f.data.enduranceInitial,95);assert.equal(f.data.endurance,90);
 const armored=fixture(268,{combatSkill:22,nextArmorEndurance:96});armored.pick(1);armored.core._runRound();armored.core._runRound();assert.equal(armored.data.endurance,0);assert.equal(armored.data.history[0].outcome,'loss');
 const safe=fixture(268,{combatSkill:22});safe.pick(0);safe.core._runRound();assert.equal(safe.data.combatEffects.lastingWounds,false);
 const ordinary=fixture(337,{combatSkill:22});ordinary.pick(1);ordinary.core._runRound();ordinary.core._runRound();assert.equal(ordinary.data.enduranceInitial,100);
 const psychic=fixture(268,{combatSkill:18,nextPsychic:'surge'});psychic.pick(3);psychic.core._runRound();assert.equal(psychic.data.endurance,94);assert.equal(psychic.data.combatEffects.lastingWounds,false);psychic.pick(1);psychic.core._runRound();assert.equal(psychic.data.enduranceInitial,100);
 const resumed=fixture(268,{combatSkill:22,roundsThisBattle:1,nextLastingWounds:true});resumed.pick(1);resumed.core._runRound();assert.equal(resumed.data.enduranceInitial,95);
});
test('round-specific escape windows close, while ordinary after-round opportunities remain available',()=>{
 for(const [s,round,route]of[[68,1,169],[224,2,58],[247,2,96]]){const f=fixture(s);f.data.roundsThisBattle=round-1;assert.equal(f.core._escapeRoute(f.data),0);f.data.roundsThisBattle=round;assert.equal(f.core._escapeRoute(f.data),route);f.data.roundsThisBattle++;assert.equal(f.core._escapeRoute(f.data),0);}
 for(const [s,route]of[[4,58],[213,274],[248,7]]){const f=fixture(s);f.data.roundsThisBattle=3;assert.equal(f.core._escapeRoute(f.data),route);}
});
test('Ligan psychic drain occurs before combat, permits Psi-screen and retains death priority',()=>{
 for(const s of[160,348]){const f=fixture(s,{endurance:1});f.core._runRound();assert.equal(f.data.roundsThisBattle,0);assert.equal(f.data.history[0].outcome,'loss');const safe=fixture(s,{combatSkill:25,nextScreen:true});safe.pick(1);safe.core._runRound();assert.equal(safe.data.endurance,95);}
});
test('temporary bonuses, protected rounds and printed early or late continuations remain specific',()=>{
 for(const flag of['nextTracking','nextDivination']){const f=fixture(8,{[flag]:true});assert.equal(f.core._effectiveSkill(f.data),20);}
 for(const s of[83,292]){const f=fixture(s,{combatSkill:s===83?24:21});f.pick(1);f.core._runRound();f.core._runRound();assert.equal(f.data.endurance,100);f.core._runRound();assert.equal(f.data.endurance,95);}
 for(const [s,rounds,early,late]of[[5,4,232,148],[8,3,311,252],[57,3,6,195],[67,4,228,121],[239,3,272,155],[259,3,272,155],[291,5,95,199]])for(const [prior,route]of[[rounds-1,early],[rounds,late]]){const f=fixture(s,{combatSkill:100,roundsThisBattle:prior});f.pick(0);f.core._runRound();assert.equal(f.data.combatEffects.route,route);}
 for(const [s,bonus]of[[88,12],[133,7],[171,7],[230,7]]){const f=fixture(s);assert.equal(f.core._effectiveSkill(f.data),20+bonus);}
});
