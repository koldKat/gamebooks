import test from 'node:test';
import assert from 'node:assert/strict';
import {createEffects} from '../../../public/js/battlesim/books/8/effects.js';

test('potion action tolerates a missing active run without saving or rendering', () => {
  const unexpected=()=>assert.fail('inactive action must not write or render');
  const effects=createEffects(()=>({_data:()=>null,saveState:unexpected,_renderInputs:unexpected,_renderLog:unexpected}));
  assert.doesNotThrow(()=>effects._usePotion());
});

test('potion heals once outside combat and leaves blocked actions unchanged', () => {
  const d={round:1,player:{life:1,lifeMax:7},enemy:{life:6},items:{potion:true}};
  let saves=0;
  const effects=createEffects(()=>({POTION_HEAL_BONUS:6,_data:()=>d,_appendLog(){},t:key=>key,saveState(){saves++;},_renderInputs(){},_renderLog(){}}));
  effects._usePotion();
  assert.equal(d.player.life,7);assert.equal(d.items.potion,false);assert.equal(saves,1);
  d.items.potion=true;d.player.life=1;d.round=2;
  const fighting=JSON.stringify(d);effects._usePotion();
  assert.equal(JSON.stringify(d),fighting);assert.equal(saves,1);
  d.round=1;d.player.life=0;
  const fallen=JSON.stringify(d);effects._usePotion();
  assert.equal(JSON.stringify(d),fallen);assert.equal(saves,1);
});
