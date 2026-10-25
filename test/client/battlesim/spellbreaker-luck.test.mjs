import test from 'node:test';
import assert from 'node:assert/strict';
import * as definition from '../../../public/js/battlesim/books/249/definition.js';
import {createState} from '../../../public/js/battlesim/books/249/state.js';
import {createCombat} from '../../../public/js/battlesim/books/249/combat.js';
import {createEffects} from '../../../public/js/battlesim/books/249/effects.js';
function fixture(...rolls){
  let saves=0;const run={},ctx={...definition,currentPlaythrough:()=>run,saveState(){saves++;},_renderAll(){},showAlert(){},t:key=>key,escapeHtml:String};
  Object.assign(ctx,createState(()=>ctx),createCombat(()=>ctx),createEffects(()=>ctx));ctx._roll2d6=()=>{assert.ok(rolls.length,'Unexpected dice');return rolls.shift();};
  const d=ctx._data();Object.assign(d,{rolled:true,roundsThisBattle:5,extension:{kept:true}});Object.assign(d.player,{skill:10,skillInitial:12,stamina:17,staminaInitial:24,luck:7,luckInitial:12,provisionsLeft:3});Object.assign(d.enemy,{name:'Rival',skill:8,stamina:6,staminaMax:20});
  return {ctx,d,run,saves:()=>saves};
}
for(const kind of ['player-hit','enemy-hit'])test('unresolved '+kind+' blocks another round',()=>{
  const {ctx,d}=fixture(2,2);d.pendingLuck=kind;const before=JSON.stringify(d);ctx._runRound();assert.equal(JSON.stringify(d),before);
});
test('skipping Luck saves its cleared value and a repeat skip writes nothing',()=>{
  const {ctx,d,saves}=fixture();d.pendingLuck='enemy-hit';ctx._skipLuck();assert.equal(d.pendingLuck,null);assert.equal(saves(),1);ctx._skipLuck();assert.equal(saves(),1);
});
for(const defeated of ['enemy','player'])test('obsolete saved choice cannot revive defeated '+defeated,()=>{
  const {ctx,d,run}=fixture(2);d[defeated].stamina=0;d.player.luck=defeated==='enemy'?1:7;d.pendingLuck=defeated==='enemy'?'player-hit':'enemy-hit';d.history=[{outcome:defeated==='enemy'?'win':'loss',ts:1}];run.sim249=JSON.parse(JSON.stringify(d));ctx._testLuck();const loaded=run.sim249;
  assert.equal(loaded[defeated].stamina,0);assert.equal(loaded.player.luck,defeated==='enemy'?1:7);assert.equal(loaded.pendingLuck,null);assert.equal(loaded.history.length,1);assert.equal(loaded.roundsThisBattle,5);
});
test('all four Luck results retain ordinary damage and one Luck cost',()=>{
  for(const kind of ['player-hit','enemy-hit'])for(const lucky of [false,true]){
    const {ctx,d}=fixture(lucky?2:12);d.pendingLuck=kind;ctx._testLuck();assert.equal(d.player.luck,6);assert.equal(d.pendingLuck,null);assert.equal(d.enemy.stamina,kind==='player-hit'?(lucky?4:7):6);assert.equal(d.player.stamina,kind==='enemy-hit'?(lucky?18:16):17);
  }
});
test('victory, meal and explicit reset retain supplies and lifetime history',()=>{
  const {ctx,d}=fixture(2,2);d.enemy.stamina=2;ctx._runRound();assert.equal(d.history.length,1);assert.equal(d.enemy.stamina,0);ctx._eatProvisions();assert.equal(d.player.stamina,21);assert.equal(d.player.provisionsLeft,2);ctx._resetBattle();assert.equal(d.history.length,1);assert.equal(d.player.provisionsLeft,2);assert.equal(d.player.stamina,24);assert.equal(d.enemy.stamina,20);assert.equal(d.extension.kept,true);
});
