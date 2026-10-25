import test from 'node:test';
import assert from 'node:assert/strict';
import {createState} from '../../../public/js/battlesim/books/246/state.js';
import {createCombat} from '../../../public/js/battlesim/books/246/combat.js';

function fixture(...rolls) {
  let saves=0;const run={},ctx={currentPlaythrough:()=>run,saveState(){saves++;},_renderAll(){},t:key=>key,escapeHtml:String};
  Object.assign(ctx,createState(()=>ctx),createCombat(()=>ctx));
  const die=()=>{assert.ok(rolls.length,'Unexpected dice');return rolls.shift();};ctx._roll2d6=die;ctx._roll1d6=die;
  const d=ctx._data();Object.assign(d,{rolled:true,roundsThisBattle:5,extension:{kept:true}});
  Object.assign(d.player,{skill:10,skillInitial:12,stamina:17,staminaInitial:24,luck:7,luckInitial:12,attackModifier:-1});
  Object.assign(d.enemy,{name:'Rival',skill:8,stamina:6,staminaMax:20});
  return {ctx,d,run,saves:()=>saves};
}
for(const defeated of ['enemy','player'])test('obsolete saved Luck cannot revive defeated '+defeated,()=>{
  const {ctx,d,run}=fixture(2);d[defeated].stamina=0;d.pendingLuckQueue=[{kind:defeated==='enemy'?'player-hit':'enemy-hit',extension:true}];d.history=[{outcome:defeated==='enemy'?'win':'loss',ts:1}];run.sim246=JSON.parse(JSON.stringify(d));ctx._testLuck();const loaded=run.sim246;
  assert.equal(loaded[defeated].stamina,0);assert.equal(loaded.player.luck,7);assert.deepEqual(loaded.pendingLuckQueue,[]);assert.equal(loaded.history.length,1);assert.equal(loaded.roundsThisBattle,5);
});
test('pending round lock and skip persistence survive serialization',()=>{
  const {ctx,d,run,saves}=fixture();d.pendingLuckQueue=[{kind:'enemy-hit',extension:true}];const before=JSON.stringify(d);ctx._runRound();assert.equal(JSON.stringify(d),before);assert.equal(saves(),0);ctx._skipLuck();assert.equal(saves(),1);run.sim246=JSON.parse(JSON.stringify(d));assert.deepEqual(ctx._data().pendingLuckQueue,[]);ctx._skipLuck();assert.equal(saves(),1);
});
test('all four ordinary Luck results keep their original adjustment',()=>{
  for(const kind of ['player-hit','enemy-hit'])for(const lucky of [false,true]){
    const {ctx,d}=fixture(lucky?2:12);d.pendingLuckQueue=[{kind}];ctx._testLuck();assert.equal(d.player.luck,6);assert.deepEqual(d.pendingLuckQueue,[]);assert.equal(d.enemy.stamina,kind==='player-hit'?(lucky?4:7):6);assert.equal(d.player.stamina,kind==='enemy-hit'?(lucky?18:16):17);
  }
});
test('required weapon and manually reduced wound controls keep original damage',()=>{
  for(const [weapon,reduced,damage] of [[true,0,2],[false,0,0],[false,1,1]]){
    const {ctx,d}=fixture(2,2);d.hasRequiredWeapon=weapon;d.reducedWoundDamage=reduced;ctx._runRound();assert.equal(d.enemy.stamina,6-damage);assert.equal(d.pendingLuckQueue.length,damage?1:0);assert.equal(d.roundsThisBattle,6);
  }
});
test('instant-kill success and failure use one follow-up roll without ordinary wounds',()=>{
  for(const [roll,health] of [[3,6],[4,0]]){
    const {ctx,d}=fixture(2,2,roll);d.instantKillThreshold=4;ctx._runRound();assert.equal(d.enemy.stamina,health);assert.deepEqual(d.pendingLuckQueue,[]);assert.equal(d.history.length,health?0:1);if(!health)ctx._runRound();
  }
});
test('fatal incoming Luck records once and reset retains encounter controls and history',()=>{
  const {ctx,d}=fixture(12);d.player.stamina=1;d.pendingLuckQueue=[{kind:'enemy-hit'}];d.hasRequiredWeapon=false;d.reducedWoundDamage=1;d.instantKillThreshold=4;ctx._testLuck();assert.equal(d.player.stamina,0);assert.equal(d.history.length,1);assert.equal(d.history[0].outcome,'loss');ctx._testLuck();ctx._resetBattle();assert.equal(d.player.stamina,24);assert.equal(d.enemy.stamina,20);assert.equal(d.player.attackModifier,-1);assert.equal(d.hasRequiredWeapon,false);assert.equal(d.reducedWoundDamage,1);assert.equal(d.instantKillThreshold,4);assert.equal(d.history.length,1);assert.equal(d.extension.kept,true);
});
