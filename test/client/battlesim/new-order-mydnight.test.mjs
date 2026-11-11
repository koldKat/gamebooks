import test from 'node:test';
import assert from 'node:assert/strict';
import {readRosterDocument} from '../../helpers/roster-db.cjs';
import {createMagnakaiCombat} from '../../../public/js/battlesim/engines/lone-wolf/magnakai-combat.js';
import {createMagnakaiState} from '../../../public/js/battlesim/engines/lone-wolf/magnakai-state.js';
import {definition} from '../../../public/js/battlesim/books/343/definition.js';
import {COMBAT_TABLE} from '../../../public/js/battlesim/engines/lone-wolf/combat-table.js';

const entries=readRosterDocument(343).enemies.map(row=>row.stats.entry);
const rules=Object.fromEntries(entries.map(entry=>[entry.key,entry.rules]));
function fixture(section=0,{table=COMBAT_TABLE,overrideRules,...options}={}) {
  let run={},core;
  const store=createMagnakaiState(definition,()=>({currentBookId:343,currentPlaythrough:()=>run,health:core._health}));
  const entry=entries.find(e=>e.section===section);
  core=createMagnakaiCombat(()=>({...core,COMBAT_TABLE:table,
    ENCOUNTER_RULES:overrideRules?{...rules,[entry.key]:overrideRules}:rules,
    effectControls:definition.controls,combatOptions:definition.combatOptions,
    _data:store.data,_appendLog:store.appendLog,_recordOutcome:store.recordOutcome,
    _battleOver:store.battleOver,_pick10:()=>1,_renderAll(){},saveState(){},
    t:key=>key,escapeHtml:String,SVG_SKULL:'',SVG_TROPHY:''}),'battlesim343');
  const d=store.data();
  Object.assign(d,{rolled:true,combatSkill:entry?.skill??25,endurance:100,enduranceInitial:100,
    nextSection:section,nextEncounterKey:entry?.key??'',...options});
  d.enemy={name:entry?.name??'Custom opponent',skill:entry?.skill??25,
    endurance:entry?.stamina??100,enduranceMax:entry?.stamina??100};
  core._captureFightEffects(d);
  return {core,get data(){return store.data();},restore(){run=JSON.parse(JSON.stringify(run));}};
}

test('seventeen printed encounters use the established chart and retain custom setup',()=>{
  assert.equal(entries.length,17);
  assert.deepEqual(entries.map(e=>e.section),[10,25,34,60,83,103,107,128,159,203,216,217,244,254,275,284,301]);
  assert.ok(entries.every(e=>JSON.stringify(e.combatTable)===JSON.stringify(COMBAT_TABLE)));
  assert.deepEqual(definition.roll,{skill:25,endurance:30});
  assert.equal(fixture().data.enemy.endurance,100);
});

test('Karvas joins the hunting fight after three rounds and persists across reload',()=>{
  const f=fixture(25,{attackModifier:8});
  for(let n=0;n<3;n++){f.data.roundsThisBattle=n;assert.equal(f.core._effectiveSkill(f.data),55);}
  f.data.roundsThisBattle=3;assert.equal(f.core._effectiveSkill(f.data),60);
  f.restore();assert.equal(f.core._effectiveSkill(f.data),60);
  assert.equal(f.core._escapeRule(f.data),undefined);
});

test('each bandit approach uses its own exact victory-round threshold',()=>{
  for(const [section,limit]of [[34,3],[128,5],[284,4]]){
    for(const [rounds,route]of [[limit,215],[limit+1,103]]){
      const f=fixture(section);assert.equal(f.core._effectiveSkill(f.data),45);
      f.data.roundsThisBattle=rounds;f.data.enemy.endurance=0;f.core._checkBattleEnd(f.data);
      assert.equal(f.data.combatEffects.route,route);
      assert.equal(f.data.history.length,1);
    }
  }
});

test('one-round joust distinguishes higher player loss, higher enemy loss and equal loss',()=>{
  for(const [enemy,player,route]of [[2,4,40],[4,2,297],[3,3,143]]){
    const table=Array.from({length:10},()=>Array.from({length:13},()=>[enemy,player]));
    const f=fixture(60,{table});f.core._runRound();
    assert.equal(f.data.combatEffects.route,route);
    assert.equal(f.data.roundsThisBattle,1);
    assert.equal(f.data.history.length,0,'nonfatal continuation is not a killing victory');
    f.restore();f.core._runRound();assert.equal(f.data.roundsThisBattle,1);
  }
});

test('legacy two-way loss comparisons retain their otherwise route',()=>{
  const overrideRules={roundLimit:{rounds:1,compareLosses:{playerMore:40,otherwise:297}}};
  for(const [enemy,player,route]of [[2,4,40],[4,2,297],[3,3,297]]){
    const f=fixture(60,{overrideRules});f.data.roundsThisBattle=1;
    f.data.combatEffects.lastRoundLoss={enemy,player};f.core._checkBattleEnd(f.data);
    assert.equal(f.data.combatEffects.route,route);
  }
});

test('unarmed and confiscated equipment suppress weapon bonuses; opening penalty lasts one round',()=>{
  for(const section of [203,216,275]){
    const f=fixture(section,{attackModifier:13,nextPsychic:'blast'});
    assert.equal(f.core._effectiveSkill(f.data),f.data.combatSkill+4);
  }
  const f=fixture(107,{attackModifier:8,nextPsychic:'blast'});
  assert.equal(f.core._effectiveSkill(f.data),31);
  f.data.roundsThisBattle=1;assert.equal(f.core._effectiveSkill(f.data),36);
});

test('psychic immunities, surge threshold and companion exclusions match the source',()=>{
  for(const section of [10,83,103,301]){
    const f=fixture(section,{nextPsychic:'blast'});assert.equal(f.core._psychic(f.data),'none');
    f.data.combatEffects.psychic='surge';f.data.endurance=6;assert.equal(f.core._psychic(f.data),'none');
    f.data.endurance=7;assert.equal(f.core._psychic(f.data),'surge');
  }
  for(const section of [217,244]){
    const f=fixture(section,{nextPsychic:'surge'});assert.equal(f.core._psychic(f.data),'none');
    f.data.combatEffects.psychic='blast';assert.equal(f.core._psychic(f.data),'none');
  }
  const s=fixture(83);assert.equal(s.core._effectiveSkill(s.data),54);
  assert.equal(fixture(10).data.enemy.endurance,30);
  assert.equal(fixture(301).data.enemy.endurance,35);
});
