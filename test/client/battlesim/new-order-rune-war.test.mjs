import test from 'node:test';
import assert from 'node:assert/strict';
import {readRosterDocument} from '../../helpers/roster-db.cjs';
import {createMagnakaiCombat} from '../../../public/js/battlesim/engines/lone-wolf/magnakai-combat.js';
import {createMagnakaiState} from '../../../public/js/battlesim/engines/lone-wolf/magnakai-state.js';
import {definition} from '../../../public/js/battlesim/books/344/definition.js';
import {COMBAT_TABLE} from '../../../public/js/battlesim/engines/lone-wolf/combat-table.js';

const entries=readRosterDocument(344).enemies.map(row=>row.stats.entry);
const rules=Object.fromEntries(entries.map(entry=>[entry.key,entry.rules]));
function fixture(section=0,{losses,...options}={}) {
  let run={},core;
  const store=createMagnakaiState(definition,()=>({currentBookId:344,currentPlaythrough:()=>run,health:core._health}));
  const entry=entries.find(e=>e.section===section);
  const table=losses?Array.from({length:10},()=>Array.from({length:13},()=>losses)):COMBAT_TABLE;
  core=createMagnakaiCombat(()=>({...core,COMBAT_TABLE:table,ENCOUNTER_RULES:rules,
    effectControls:definition.controls,combatOptions:definition.combatOptions,
    _data:store.data,_appendLog:store.appendLog,_recordOutcome:store.recordOutcome,_battleOver:store.battleOver,
    _pick10:()=>1,_renderAll(){},saveState(){},t:key=>key,escapeHtml:String,SVG_SKULL:'',SVG_TROPHY:''}),'battlesim344');
  const d=store.data();
  Object.assign(d,{rolled:true,combatSkill:entry?.skill??25,endurance:100,enduranceInitial:100,
    nextSection:section,nextEncounterKey:entry?.key??'',...options});
  d.enemy={name:entry?.name??'Custom opponent',skill:entry?.skill??25,
    endurance:entry?.stamina??100,enduranceMax:entry?.stamina??100};
  core._captureFightEffects(d);
  return {core,get data(){return store.data();},restore(){run=JSON.parse(JSON.stringify(run));}};
}

test('all 36 printed variants use the original chart and retain custom setup',()=>{
  assert.deepEqual(entries.map(e=>e.section),[4,9,24,29,31,52,53,68,73,75,80,84,92,101,126,136,138,154,160,161,182,185,196,206,211,217,223,245,264,265,277,282,299,304,312,317]);
  assert.ok(entries.every(e=>JSON.stringify(e.combatTable)===JSON.stringify(COMBAT_TABLE)));
  assert.deepEqual(definition.roll,{skill:25,endurance:30});
  assert.equal(fixture().data.enemy.endurance,100);
});

test('ambush protection ignores all player losses only for the printed number of rounds',()=>{
  for(const [section,rounds]of [[9,2],[138,2],[185,2],[211,2],[206,4]]){
    const f=fixture(section,{losses:[1,3],nextPsychic:'surge'});
    for(let i=0;i<rounds;i++)f.core._runRound();
    assert.equal(f.data.endurance,100);
    f.restore();f.core._runRound();assert.equal(f.data.endurance,section===206?97:96);
  }
});

test('guard dogs take no damage for two rounds; bare-handed fights suppress only weapon adjustments',()=>{
  for(const section of [101,265,312]){
    const f=fixture(section,{losses:[3,1],attackModifier:10});
    assert.equal(f.core._effectiveSkill(f.data),section===265?35:25);
    f.core._runRound();f.core._runRound();assert.equal(f.data.enemy.endurance,18);
    f.core._runRound();assert.equal(f.data.enemy.endurance,15);
  }
});

test('the farmer is subdued with halved losses without inventing a rounding rule',()=>{
  const f=fixture(53,{losses:[3,1]});f.core._runRound();
  assert.equal(f.data.enemy.endurance,22.5);assert.equal(f.data.endurance,99);
});

test('Vorka victory thresholds retain both source routes at their exact boundaries',()=>{
  for(const [section,rounds,early,late]of [[52,5,187,35],[160,5,187,35],[299,4,13,174]]){
    for(const [count,route]of [[rounds,early],[rounds+1,late]]){
      const f=fixture(section);f.data.roundsThisBattle=count;f.data.enemy.endurance=0;
      f.core._checkBattleEnd(f.data);assert.equal(f.data.combatEffects.route,route);
    }
  }
});

test('Zorkaan vial variants apply only their own psychic immunity and Kai-screen adjustments',()=>{
  for(const section of [75,136,154,182,92,264,282]){
    for(const screen of [false,true]){
      const f=fixture(section,{nextKaiScreen:screen,nextPsychic:'surge'});
      const psychic=[136,92,264,282].includes(section)?8:0;
      const adjustment=section===154?-7:[75,136].includes(section)?(screen?0:-3):(screen?3:0);
      assert.equal(f.core._effectiveSkill(f.data),f.data.combatSkill+psychic+adjustment);
    }
  }
  for(const section of [4,29,68,206,317,75,154,182])assert.equal(fixture(section,{nextPsychic:'surge'}).core._psychic(fixture(section,{nextPsychic:'surge'}).data),'none');
  const blue=fixture(136,{nextPsychic:'blast'});assert.equal(blue.core._psychic(blue.data),'none');
  blue.data.combatEffects.psychic='surge';blue.data.endurance=6;assert.equal(blue.core._psychic(blue.data),'none');
  for(const section of [161,299]){
    const f=fixture(section,{nextPsychic:'blast'});assert.equal(f.core._psychic(f.data),'none');
    f.data.combatEffects.psychic='surge';assert.equal(f.core._psychic(f.data),'surge');
  }
});

test('three-round confrontations stop without recording a killing victory',()=>{
  for(const section of [75,136,154,182]){
    const f=fixture(section,{losses:[1,1]});for(let i=0;i<3;i++)f.core._runRound();
    assert.equal(f.data.combatEffects.route,209);assert.equal(f.data.history.length,0);
    f.restore();f.core._runRound();assert.equal(f.data.roundsThisBattle,3);
  }
});

test('one-pass mounted combat distinguishes a higher player loss from equal or lower loss',()=>{
  for(const [enemy,player,route]of [[1,2,111],[2,1,64],[2,2,64]]){
    const f=fixture(80,{losses:[enemy,player]});f.core._runRound();
    assert.equal(f.data.combatEffects.route,route);assert.equal(f.data.history.length,0);
  }
});
