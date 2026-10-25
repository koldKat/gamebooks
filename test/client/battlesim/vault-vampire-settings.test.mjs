import test from 'node:test';
import assert from 'node:assert/strict';
import * as definition from '../../../public/js/battlesim/books/234/definition.js';
import {createCombat} from '../../../public/js/battlesim/books/234/combat.js';
import {createState} from '../../../public/js/battlesim/books/234/state.js';
import {createEffects} from '../../../public/js/battlesim/books/234/effects.js';
import {loadFixtureRoster} from './roster-fixtures.mjs';
await loadFixtureRoster(234);
function fixture(...rolls) {
  const run={},ctx={...definition,currentPlaythrough:()=>run,saveState(){},_renderAll(){},showAlert(){},t:key=>key,escapeHtml:String};
  Object.assign(ctx,createState(()=>ctx),createCombat(()=>ctx),createEffects(()=>ctx));
  ctx._roll2d6=()=>{assert.ok(rolls.length,'Unexpected roll');return rolls.shift();};ctx._roll1d6=()=>1;
  const d=ctx._data();Object.assign(d,{rolled:true,pairedFight:true,roundsThisBattle:5,extension:{kept:true}});
  Object.assign(d.player,{skill:10,skillInitial:12,stamina:17,staminaInitial:24,luck:7,luckInitial:12,enemyWoundDamage:5,faith:6,faithInitial:9,provisionsLeft:3});
  Object.assign(d.enemy,{name:'Main',skill:8,stamina:6,staminaMax:10,extension:{main:true}});
  Object.assign(d.sideEnemy,{name:'Side',skill:7,stamina:6,staminaMax:8,extension:{side:true}});
  return {ctx,d,run,rolls};
}
test('a defeated main opponent stops rolling and cannot attack while its partner lives',()=>{
  const {ctx,d,rolls}=fixture(2,2);d.enemy.stamina=0;d.enemy.skill=30;ctx._runRound();
  assert.equal(d.player.stamina,17);assert.equal(d.sideEnemy.stamina,4);assert.equal(rolls.length,0);
  assert.deepEqual(d.pendingLuckQueue,[{kind:'player-hit',hitSide:true}]);
});
test('a killing blow queues no Luck that could resurrect the dead target',()=>{
  const {ctx,d}=fixture(12,2,2);d.enemy.stamina=2;ctx._runRound();
  assert.equal(d.enemy.stamina,0);assert.equal(d.sideEnemy.stamina,6);assert.equal(d.history.length,0);
  assert.deepEqual(d.pendingLuckQueue,[]);
});
test('obsolete saved outgoing Luck clears without dice, Luck cost, resurrection or history',()=>{
  for(const hitSide of [false,true]){
    const {ctx,d,run}=fixture();(hitSide?d.sideEnemy:d.enemy).stamina=0;
    const incoming={kind:'drain-hit',extension:true};d.pendingLuckQueue=[{kind:'player-hit',hitSide,extension:true},incoming];
    run.sim234=JSON.parse(JSON.stringify(d));ctx._testLuck();const loaded=run.sim234;
    assert.equal((hitSide?loaded.sideEnemy:loaded.enemy).stamina,0);assert.equal(loaded.player.luck,7);
    assert.deepEqual(loaded.pendingLuckQueue,[incoming]);assert.equal(loaded.history.length,0);
  }
});
test('provisions remain blocked while either opponent is alive',()=>{
  const {ctx,d}=fixture();d.enemy.stamina=0;ctx._eatProvisions();assert.equal(d.player.stamina,17);assert.equal(d.player.provisionsLeft,3);
  d.sideEnemy.stamina=0;ctx._eatProvisions();assert.equal(d.player.stamina,21);assert.equal(d.player.provisionsLeft,2);
});
test('fatal drain on the winning round records loss once',()=>{
  const {ctx,d}=fixture(12,2);d.pairedFight=false;d.enemy.stamina=2;d.player.stamina=1;d.player.drainEffect=true;ctx._runRound();
  assert.equal(d.enemy.stamina,0);assert.equal(d.player.stamina,0);assert.equal(d.history.length,1);assert.equal(d.history[0].outcome,'loss');
  assert.deepEqual(d.pendingLuckQueue,[]);const saved=JSON.stringify(d);ctx._runRound();assert.equal(JSON.stringify(d),saved);
});
test('each drain die face remains independent of the ordinary exchange',()=>{
  for(let face=1;face<=6;face++){
    const {ctx,d}=fixture(2,2);d.pairedFight=false;d.player.drainEffect=true;ctx._roll1d6=()=>face;ctx._runRound();
    assert.equal(d.enemy.stamina,4);assert.equal(d.player.stamina,face<=3?16:17);
    assert.deepEqual(d.pendingLuckQueue,face<=3?[{kind:'player-hit'},{kind:'drain-hit'}]:[{kind:'player-hit'}]);
  }
});
test('random target keeps the exact target in its outgoing Luck event',()=>{
  for(const face of [3,4]){
    const {ctx,d}=fixture(12,2,2);d.randomTarget=true;ctx._roll1d6=()=>face;ctx._runRound();
    assert.equal(d.enemy.stamina,face===3?4:6);assert.equal(d.sideEnemy.stamina,face===4?4:6);
    assert.deepEqual(d.pendingLuckQueue,[{kind:'player-hit',hitSide:face===4}]);
  }
});
test('Nightstar uses its ordinary or vampire bonus while Faith stays a reference stat',()=>{
  for(const [owned,vampire,damage] of [[false,false,5],[true,false,0],[true,true,0]]){
    const {ctx,d}=fixture(2,2);d.pairedFight=false;d.player.skill=6;d.enemy.skill=7;d.player.hasNightstar=owned;d.player.vsVampire=vampire;d.player.faith=99;ctx._runRound();
    assert.equal(d.player.stamina,17-damage);assert.equal(d.enemy.stamina,owned&&vampire?4:6);
  }
});

test('database settings drive random targeting and drain threshold/damage',()=>{
  const saved={...definition.VAMPIRE_RULES};
  try{
    Object.assign(definition.VAMPIRE_RULES,{drainHitMax:5,drainDamage:3,randomTargetSideMin:2});
    const {ctx,d}=fixture(12,2,2);d.randomTarget=true;d.player.drainEffect=true;ctx._roll1d6=()=>2;ctx._runRound();
    assert.equal(d.enemy.stamina,6);assert.equal(d.sideEnemy.stamina,4);assert.equal(d.player.stamina,14);
    assert.deepEqual(d.pendingLuckQueue,[{kind:'player-hit',hitSide:true},{kind:'drain-hit'}]);
  }finally{Object.assign(definition.VAMPIRE_RULES,saved);}
});
