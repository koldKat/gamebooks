import test from 'node:test';
import assert from 'node:assert/strict';
import {readRosterDocument} from '../../helpers/roster-db.cjs';
import {createMagnakaiCombat} from '../../../public/js/battlesim/engines/lone-wolf/magnakai-combat.js';
import {createMagnakaiState} from '../../../public/js/battlesim/engines/lone-wolf/magnakai-state.js';
import {definition} from '../../../public/js/battlesim/books/328/definition.js';
import {COMBAT_TABLE as established} from '../../../public/js/battlesim/engines/lone-wolf/combat-table.js';

const entries=readRosterDocument(328).enemies.map(row=>row.stats.entry);
const rules=Object.fromEntries(entries.map(entry=>[entry.key,entry.rules]));
const table=entries.find(entry=>entry.combatTable).combatTable;
function fixture(section=0,options={},slot=0){
  let run={},pick=1,core;
  const store=createMagnakaiState(definition,()=>({currentBookId:328,currentPlaythrough:()=>run,health:core._health}));
  core=createMagnakaiCombat(()=>({...core,COMBAT_TABLE:table,ENCOUNTER_RULES:rules,effectControls:definition.controls,
    _data:store.data,_appendLog:store.appendLog,_recordOutcome:store.recordOutcome,_battleOver:store.battleOver,
    _pick10:()=>pick,_renderAll(){},saveState(){},t:(key,values)=>key+JSON.stringify(values??{}),escapeHtml:String,SVG_SKULL:'',SVG_TROPHY:''}),'battlesim328');
  const entry=entries.filter(e=>e.section===section)[slot],data=store.data();
  Object.assign(data,{rolled:true,combatSkill:20,combatSkillInitial:20,endurance:100,enduranceInitial:100,
    nextSection:section,nextEncounterKey:entry?.key??'',...options});
  data.enemy={name:entry?.name??'Custom opponent',skill:entry?.skill??20,endurance:entry?.stamina??100,enduranceMax:entry?.stamina??100};
  core._captureFightEffects(data);
  return {data,core,store,pick(value){pick=value;},restore(){run=JSON.parse(JSON.stringify(run));return store.data();}};
}

test('the reviewed catalog has 37 encounters, 39 unique slots and one original chart',()=>{
  assert.equal(entries.length,39);assert.equal(new Set(entries.map(e=>e.section)).size,37);
  assert.equal(new Set(entries.map(e=>e.key)).size,39);assert.deepEqual(table,established);
  assert.equal(entries.filter(e=>e.combatTable).length,1);
  for(const section of[13,287])assert.deepEqual(entries.filter(e=>e.section===section).map(e=>[e.skill,e.stamina]),[[22,28],[21,26]]);
  assert.equal(definition.supportsArchery,false);assert.equal(definition.enduranceStep,.5);
});

test('disciplines are captured per fight and apply only to their printed encounters',()=>{
  for(const [section,flag,without,withFlag]of[
    [8,'nextAnimal',17,20],[101,'nextAnimal',17,20],[88,'nextAnimal',20,22],[106,'nextAnimal',20,22],[162,'nextAnimal',20,22],
    [13,'nextScreen',18,20],[287,'nextScreen',18,20],[333,'nextScreen',18,20],[30,'nextSpirit',20,22],
    [47,'nextSpirit',20,22],[183,'nextSpirit',20,22],[308,'nextSpirit',20,22],[313,'nextTracking',16,20],[339,'nextNexusPrimate',12,20]]){
    const f=fixture(section),g=fixture(section,{[flag]:true});
    assert.equal(f.core._effectiveSkill(f.data),without);assert.equal(g.core._effectiveSkill(g.data),withFlag);
    g.data[flag]=false;assert.equal(g.core._effectiveSkill(g.data),withFlag,'setup edits cannot change captured combat effects');
  }
  assert.equal(fixture(41).core._effectiveSkill(fixture(41).data),25);
  const miner=fixture(298);assert.equal(miner.core._effectiveSkill(miner.data),17);
  miner.data.roundsThisBattle=2;assert.equal(miner.core._effectiveSkill(miner.data),20);
});

test('unarmed reduction requires Weaponmastery at Tutelary rank, with printed round boundaries',()=>{
  for(const section of[169,252,323])for(const mastery of[false,true]){
    const f=fixture(section,{nextUnarmedMastery:mastery,nextScreen:true});
    assert.equal(f.core._effectiveSkill(f.data),mastery?18:16);
    f.data.roundsThisBattle=2;
    assert.equal(f.core._effectiveSkill(f.data),section===169?(mastery?18:16):20);
  }
});

test('Helghast psychic loss precedes the table, Psi-surge threshold and death checks',()=>{
  for(const section of[30,47,183,308]){
    const f=fixture(section,{endurance:8,nextPsychic:'surge'});f.data.enemy.skill=20;f.pick(0);
    const loss=table[9][f.core._ratioCol(0)][1];f.core._runRound();
    assert.equal(f.data.endurance,Math.max(0,6-loss),'two pre-round EP can disable Psi-surge');
    const protectedFight=fixture(section,{nextScreen:true,nextPsychic:'surge'});protectedFight.data.enemy.skill=20;
    protectedFight.core._runRound();assert.equal(100-protectedFight.data.endurance,table[0][protectedFight.core._ratioCol(4)][1]+2);
    const dying=fixture(section,{endurance:2});const enemy=dying.data.enemy.endurance;dying.core._runRound();
    assert.equal(dying.data.endurance,0);assert.equal(dying.data.enemy.endurance,enemy);
    assert.equal(dying.data.roundsThisBattle,0);assert.equal(dying.data.history[0].outcome,'loss');
    dying.core._runRound();assert.equal(dying.data.history.length,1);
    const invalid=fixture(section);invalid.pick(10);const before=JSON.stringify(invalid.data);
    assert.throws(()=>invalid.core._runRound());assert.equal(JSON.stringify(invalid.data),before);
  }
});

test('Taan-spider triples psychic skill bonuses while keeping surge costs separate',()=>{
  for(const [psychic,skill]of[['none',20],['blast',26],['surge',32]]){
    const f=fixture(52,{nextPsychic:psychic});assert.equal(f.core._effectiveSkill(f.data),skill);
    f.data.enemy.skill=20;f.core._runRound();
    const loss=table[0][f.core._ratioCol(skill-20)][1];
    assert.equal(100-f.data.endurance,2*loss+(psychic==='surge'?2:0));
  }
});

test('fixed psychic duel ignores normal equipment and psychic modifiers/costs',()=>{
  const f=fixture(74,{combatSkill:40,attackModifier:100,nextPsychic:'surge'});
  assert.equal(f.core._effectiveSkill(f.data),15);assert.equal(f.core._psychic(f.data),'none');
  f.core._runRound();assert.equal(100-f.data.endurance,table[0][f.core._ratioCol(-5)][1]);
});

test('immunities, conditional Sommerswerd and first-round protections remain distinct',()=>{
  for(const section of[8,13,30,47,101,110,169,183,257,287,308,323,333]){
    const f=fixture(section,{nextPsychic:'blast'});assert.equal(f.core._psychic(f.data),'none');
    f.data.combatEffects.psychic='surge';assert.equal(f.core._psychic(f.data),'surge');
  }
  for(const section of[159,199,339])assert.equal(fixture(section,{nextPsychic:'surge'}).core._psychic(fixture(section,{nextPsychic:'surge'}).data),'none');
  for(const [section,sword,multiplier]of[[8,false,2],[101,false,1],[13,true,1],[287,false,2],[308,false,1],[308,true,2]]){
    const f=fixture(section,{nextSommerwerd:sword,nextScreen:true});f.data.enemy.endurance=f.data.enemy.enduranceMax=1000;f.data.enemy.skill=20;
    const damage=table[0][f.core._ratioCol(f.core._effectiveSkill(f.data)-20)][0];f.core._runRound();
    assert.equal(1000-f.data.enemy.endurance,damage*multiplier);
  }
  const delayed=fixture(183,{nextScreen:true});delayed.data.enemy.skill=20;delayed.core._runRound();assert.equal(delayed.data.enemy.endurance,48);
  delayed.core._runRound();assert(delayed.data.enemy.endurance<48);
  const bourn=fixture(251);bourn.core._runRound();assert.equal(bourn.data.endurance,100);
  bourn.core._runRound();assert(bourn.data.endurance<100);
});

test('venom protection requires combined Curing rank and halved damage retains half EP',()=>{
  const normal=fixture(155),protectedFight=fixture(155,{nextCuringPrimate:true});
  normal.core._runRound();protectedFight.core._runRound();assert.equal(100-normal.data.endurance,2*(100-protectedFight.data.endurance));
  for(const section of[159,199]){
    const f=fixture(section,{nextPsychic:'surge'});f.data.enemy.skill=20;
    const col=f.core._ratioCol(0),row=table.findIndex(r=>Number.isInteger(r[col][1])&&r[col][1]%2===1);
    assert(row>=0);f.pick(row===9?0:row+1);f.core._runRound();
    assert.equal(f.data.endurance,100-table[row][col][1]/2);assert.equal(f.data.endurance%1,.5);
  }
});

test('Vordak pairs survive reload and finish with one victory, including explicit second-slot setup',()=>{
  for(const section of[13,287]){
    const f=fixture(section,{combatSkill:100});f.pick(0);f.data.enemy.name='Renamed first Vordak';f.core._runRound();
    assert.equal(f.data.enemy.skill,21);assert.equal(f.data.enemy.endurance,26);assert.equal(f.data.history.length,0);
    assert.equal(f.data.roundsThisBattle,1);assert.equal(f.data.combatEffects.followupUsed,true);
    const saved=f.restore();f.core._runRound();assert.equal(saved.history.length,1);assert.equal(saved.combatEffects.route,79);
    f.core._runRound();assert.equal(saved.history.length,1);
    const second=fixture(section,{combatSkill:100,roundsThisBattle:5},1);second.pick(0);second.core._runRound();
    assert.equal(second.data.history.length,1);assert.equal(second.data.combatEffects.route,79);
  }
});

test('six-round limit applies across opponents and never rolls a seventh round or creates a false win',()=>{
  const deadline=fixture(13,{combatSkill:100,roundsThisBattle:5});deadline.pick(0);deadline.core._runRound();
  assert.equal(deadline.data.roundsThisBattle,6);assert.equal(deadline.data.combatEffects.route,158);assert.equal(deadline.data.history.length,0);
  for(const slot of[0,1]){
    const f=fixture(13,{roundsThisBattle:6},slot);f.pick(10);f.core._runRound();
    assert.equal(f.data.roundsThisBattle,6);assert.equal(f.data.endurance,100);assert.equal(f.data.history.length,0);assert.equal(f.data.combatEffects.route,158);
    const before=JSON.stringify(f.data);f.core._runRound();assert.equal(JSON.stringify(f.data),before);
  }
  const fight=fixture(13,{roundsThisBattle:3});fight.data.enemy.endurance=1000;
  for(let i=0;i<3;i++)fight.core._runRound();assert.equal(fight.data.combatEffects.route,158);assert.equal(fight.data.history.length,0);
});

test('Boran handoff and evasion have no invented victory; death wins over handoffs',()=>{
  const f=fixture(257);f.data.enemy.endurance=1000;f.core._runRound();f.core._runRound();
  assert.equal(f.data.combatEffects.route,163);assert.equal(f.data.history.length,0);
  const win=fixture(257,{combatSkill:100,roundsThisBattle:1});win.pick(0);win.core._runRound();assert.equal(win.data.combatEffects.route,12);assert.equal(win.data.history.length,1);
  for(const section of[38,110,205,323,339,346]){
    const evade=fixture(section,{endurance:1000});evade.data.enemy.skill=evade.core._effectiveSkill(evade.data);evade.data.roundsThisBattle=2;assert.equal(evade.core._escapeRoute(evade.data),0);
    evade.data.roundsThisBattle=3;assert(evade.core._escapeRoute(evade.data));const enemy=evade.data.enemy.endurance;
    evade.core._escape();assert.equal(evade.data.enemy.endurance,enemy);assert.equal(evade.data.roundsThisBattle,4);assert.equal(evade.data.history.length,0);
  }
  const dying=fixture(257,{endurance:1,roundsThisBattle:1});dying.core._runRound();assert.equal(dying.data.history[0].outcome,'loss');assert.equal(dying.data.combatEffects.route,undefined);
});

test('reader entry injuries remain manual and custom names cannot opt into preset rules',()=>{
  for(const section of[40,159])assert.equal(fixture(section,{endurance:12}).data.endurance,12);
  const custom=fixture();custom.data.enemy.name='Gnaag Helghast §308';custom.core._captureFightEffects(custom.data);
  assert.deepEqual(custom.core._rulesFor(custom.data.combatEffects.ruleKey),{});
  assert.equal(custom.core._effectiveSkill(custom.data),20);
});
