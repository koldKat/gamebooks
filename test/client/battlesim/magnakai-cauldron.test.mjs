import test from 'node:test';
import assert from 'node:assert/strict';
import {readRosterDocument} from '../../helpers/roster-db.cjs';
import {createMagnakaiCombat} from '../../../public/js/battlesim/engines/lone-wolf/magnakai-combat.js';
import {createMagnakaiState} from '../../../public/js/battlesim/engines/lone-wolf/magnakai-state.js';
import {definition} from '../../../public/js/battlesim/books/329/definition.js';
import {COMBAT_TABLE as established} from '../../../public/js/battlesim/engines/lone-wolf/combat-table.js';

const entries=readRosterDocument(329).enemies.map(row=>row.stats.entry);
const rules=Object.fromEntries(entries.map(entry=>[entry.key,entry.rules]));
const table=entries.find(entry=>entry.combatTable).combatTable;
function fixture(section=0,options={},slot=0){
  let run={},pick=1,core;
  const store=createMagnakaiState(definition,()=>({currentBookId:329,currentPlaythrough:()=>run,health:core._health}));
  core=createMagnakaiCombat(()=>({...core,COMBAT_TABLE:table,ENCOUNTER_RULES:rules,effectControls:definition.controls,
    _data:store.data,_appendLog:store.appendLog,_recordOutcome:store.recordOutcome,_battleOver:store.battleOver,
    _pick10:()=>pick,_renderAll(){},saveState(){},t:key=>key,escapeHtml:String,SVG_SKULL:'',SVG_TROPHY:''}),'battlesim329');
  const entry=entries.filter(e=>e.section===section)[slot],data=store.data();
  Object.assign(data,{rolled:true,combatSkill:20,combatSkillInitial:20,endurance:100,enduranceInitial:100,
    nextSection:section,nextEncounterKey:entry?.key??'',...options});
  data.enemy={name:entry?.name??'Custom opponent',skill:entry?.skill??20,endurance:entry?.stamina??100,enduranceMax:entry?.stamina??100};
  core._captureFightEffects(data);
  return {get data(){return store.data();},core,store,pick(value){pick=value;},restore(){run=JSON.parse(JSON.stringify(run));}};
}

test('the reviewed roster has 38 encounters, 42 explicit slots and one original chart',()=>{
  assert.equal(entries.length,42);assert.equal(new Set(entries.map(e=>e.section)).size,38);
  assert.equal(new Set(entries.map(e=>e.key)).size,42);assert.deepEqual(table,established);
  assert.equal(entries.filter(e=>e.combatTable).length,1);
  assert.deepEqual(entries.filter(e=>e.section===238).map(e=>[e.skill,e.stamina]),[[20,32],[18,32],[17,29]]);
  assert.deepEqual(entries.filter(e=>e.section===309).map(e=>[e.skill,e.stamina]),[[17,29],[18,32],[20,32]]);
  assert.equal(definition.supportsArchery,false);assert.equal(definition.enduranceStep,undefined);
});
test('the original three-round ambiguity never invents a continuation or removes a real win',()=>{
  for(const [prior,route]of[[1,117],[2,undefined],[3,276]]){
    const f=fixture(3,{combatSkill:100,roundsThisBattle:prior});f.pick(0);f.core._runRound();
    assert.equal(f.data.history.length,1);assert.equal(f.data.history[0].outcome,'win');assert.equal(f.data.combatEffects.route,route);
    f.core._runRound();assert.equal(f.data.history.length,1);
  }
  for(const [section,early,late]of[[104,228,322],[244,306,148]])for(const [prior,route]of[[2,early],[3,late]]){
    const f=fixture(section,{combatSkill:100,roundsThisBattle:prior});f.pick(0);f.core._runRound();assert.equal(f.data.combatEffects.route,route);
  }
});
test('either Huntmastery or Divination prevents the ghoul surprise penalty',()=>{
  for(const tracking of[false,true])for(const divination of[false,true]){
    const f=fixture(104,{nextTracking:tracking,nextDivination:divination});assert.equal(f.core._effectiveSkill(f.data),tracking||divination?20:17);
    f.data.nextTracking=f.data.nextDivination=false;assert.equal(f.core._effectiveSkill(f.data),tracking||divination?20:17);
  }
  for(const [section,flag,without,withFlag]of[[82,'nextTracking',18,20],[85,'nextAnimal',20,22],[97,'nextTracking',17,20],[129,'nextAnimal',18,20],[244,'nextAnimal',20,22]]){
    const a=fixture(section),b=fixture(section,{[flag]:true});assert.equal(a.core._effectiveSkill(a.data),without);assert.equal(b.core._effectiveSkill(b.data),withFlag);
  }
  assert.equal(fixture(32).core._effectiveSkill(fixture(32).data),18);
  assert.equal(fixture(327).core._effectiveSkill(fixture(327).data),16);
  assert.equal(fixture(166).core._effectiveSkill(fixture(166).data),22);
  assert.equal(fixture(191).core._effectiveSkill(fixture(191).data),16);
  assert.equal(fixture(214).core._effectiveSkill(fixture(214).data),28);
});
test('the net forbids equipment for four rounds and Weaponmastery reduces the unarmed penalty',()=>{
  for(const mastery of[false,true]){
    const f=fixture(182,{attackModifier:9,nextUnarmedMastery:mastery});
    for(const completed of[0,1,2,3]){f.data.roundsThisBattle=completed;assert.equal(f.core._effectiveSkill(f.data),mastery?18:16);}
    f.data.roundsThisBattle=4;assert.equal(f.core._effectiveSkill(f.data),29);
    const unarmed=fixture(316,{nextUnarmedMastery:mastery});unarmed.data.roundsThisBattle=12;assert.equal(unarmed.core._effectiveSkill(unarmed.data),mastery?18:16);
  }
  const psychic=fixture(182,{attackModifier:9,nextPsychic:'surge'});assert.equal(psychic.core._effectiveSkill(psychic.data),20,'psychic skill remains available while equipment is unusable');
  const falling=fixture(148);assert.equal(falling.core._effectiveSkill(falling.data),18);falling.data.roundsThisBattle=2;assert.equal(falling.core._effectiveSkill(falling.data),20);
});
test('three printed pairs continue by stable keys, survive reload and award only one victory',()=>{
  for(const section of[238,309])for(const slot of[0,1,2]){
    const f=fixture(section,{combatSkill:100},slot);f.pick(0);f.data.enemy.name='Renamed opponent';
    assert.equal(f.core._effectiveSkill(f.data),section===238||slot>0?102:100);
    for(let current=slot;current<3;current++){
      f.core._runRound();
      if(current<2){
        assert.equal(f.data.history.length,0);assert.equal(f.data.combatEffects.ruleKey,`section:${section}:slot:${current+1}`);
        assert.equal(f.core._effectiveSkill(f.data),102);f.restore();
      }
    }
    assert.equal(f.data.roundsThisBattle,3-slot);assert.equal(f.data.history.length,1);assert.equal(f.data.combatEffects.route,177);
    f.core._runRound();assert.equal(f.data.history.length,1);
  }
});
test('the sky-snake stops before round five, preserving real fourth-round wins and death priority',()=>{
  const f=fixture(82);f.pick(0);f.data.enemy.endurance=f.data.enemy.enduranceMax=1000;
  for(let i=0;i<4;i++)f.core._runRound();assert.equal(f.data.roundsThisBattle,4);assert.equal(f.data.combatEffects.route,151);assert.equal(f.data.history.length,0);
  const frozen=JSON.stringify(f.data);f.core._runRound();assert.equal(JSON.stringify(f.data),frozen);
  const resumed=fixture(82,{roundsThisBattle:4});resumed.pick(10);resumed.core._runRound();assert.equal(resumed.data.endurance,100);assert.equal(resumed.data.roundsThisBattle,4);assert.equal(resumed.data.combatEffects.route,151);
  const win=fixture(82,{combatSkill:100,roundsThisBattle:3});win.pick(0);win.core._runRound();assert.equal(win.data.combatEffects.route,247);assert.equal(win.data.history[0].outcome,'win');
  const dying=fixture(82,{endurance:1,roundsThisBattle:3});dying.core._runRound();assert.equal(dying.data.history[0].outcome,'loss');assert.equal(dying.data.combatEffects.route,undefined);
});
test('immediate escapes use no roll while Deldenian evasion waits for one completed round',()=>{
  for(const [section,route]of[[36,328],[86,328],[119,49],[217,334],[260,328]]){
    const f=fixture(section);f.pick(10);f.core._escape();assert.equal(f.data.roundsThisBattle,0);assert.equal(f.data.endurance,100);assert.equal(f.data.combatEffects.route,route);assert.equal(f.data.history.length,0);
  }
  for(const section of[98,127,308]){
    const f=fixture(section);assert.equal(f.core._escapeRoute(f.data),0);f.data.roundsThisBattle=1;const enemy=f.data.enemy.endurance;
    f.core._escape();assert.equal(f.data.enemy.endurance,enemy);assert.equal(f.data.roundsThisBattle,2);assert.equal(f.data.combatEffects.route,223);assert.equal(f.data.history.length,0);
  }
});
test('psychic immunity, table protection and psychic expenditure retain their printed distinctions',()=>{
  for(const section of[10,32,82,128,327])for(const psychic of['blast','surge'])assert.equal(fixture(section,{nextPsychic:psychic}).core._psychic(fixture(section,{nextPsychic:psychic}).data),'none');
  for(const section of[46,116,129,220,249,277,336]){
    const f=fixture(section,{nextPsychic:'blast'});assert.equal(f.core._psychic(f.data),'none');f.data.combatEffects.psychic='surge';assert.equal(f.core._psychic(f.data),'surge');
  }
  for(const section of[46,116,285]){
    const f=fixture(section,{nextPsychic:'surge'});f.data.enemy.skill=20;f.data.enemy.endurance=1000;
    f.core._runRound();f.core._runRound();assert.equal(f.data.endurance,96);f.core._runRound();assert.equal(100-f.data.endurance,6+table[0][f.core._ratioCol(4)][1]);
  }
});
test('Sommerswerd doubles only printed undead losses and sky-snake venom doubles table losses',()=>{
  for(const section of[97,104,166,191,254,301,322])for(const sword of[false,true]){
    const f=fixture(section,{nextSommerwerd:sword});f.data.enemy.skill=f.core._effectiveSkill(f.data);f.data.enemy.endurance=1000;f.core._runRound();assert.equal(1000-f.data.enemy.endurance,table[0][f.core._ratioCol(0)][0]*(sword?2:1));
  }
  const snake=fixture(82);snake.core._runRound();const expected=table[0][snake.core._ratioCol(-5)][1];assert.equal(100-snake.data.endurance,2*expected);
});
test('entry wounds remain manual, custom names select no rules, and invalid picks cannot mutate a fight',()=>{
  for(const section of[119,182,191,309])assert.equal(fixture(section,{endurance:12}).data.endurance,12);
  const f=fixture();f.data.enemy.name='Tower Guards 3 and 4 §309';f.core._captureFightEffects(f.data);assert.deepEqual(f.core._rulesFor(f.data.combatEffects.ruleKey),{});
  const invalid=fixture(309);invalid.pick(10);const original=JSON.stringify(invalid.data);assert.throws(()=>invalid.core._runRound());assert.equal(JSON.stringify(invalid.data),original);
});
