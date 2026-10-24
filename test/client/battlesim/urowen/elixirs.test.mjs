import { loadFixtureRoster } from '../roster-fixtures.mjs';
await loadFixtureRoster(550);
import test from 'node:test';
import assert from 'node:assert/strict';
import {drinkUrowenElixir} from '../../../../public/js/battlesim/engines/urowen/elixirs.js';
import {UROWEN_SOURCE} from '../../../../public/js/battlesim/engines/urowen/roster.js';
import {compileUrowenEncounters,createUrowenSimState,prepareUrowenEncounter} from '../../../../public/js/battlesim/engines/urowen/state.js';
import {startUrowenEncounter,resolveUrowenEncounterRound} from '../../../../public/js/battlesim/engines/urowen/rounds.js';
function prepared() {
  const state=prepareUrowenEncounter(createUrowenSimState(),compileUrowenEncounters(UROWEN_SOURCE).find(row=>row.section===27));
  state.character.elixirs={balkian:2,smallBalkian:2,mysticShield:2};
  state.fight.player.career=null;
  state.fight.player.attributes.SK=state.fight.enemies[0].attributeValue;
  return state;
}
function dice(...values){return ()=>{assert.ok(values.length,'Unexpected die');return values.shift();};}
test('fight-wide elixirs consume one dose, reject stacking and cannot be drunk after combat begins',()=>{
  const input=prepared(),next=drinkUrowenElixir(input,'balkian');
  assert.equal(input.character.elixirs.balkian,2);assert.equal(next.character.elixirs.balkian,1);
  assert.equal(next.fight.elixirAttackBonus,2);
  assert.throws(()=>drinkUrowenElixir(next,'balkian'),/already active/);
  assert.throws(()=>drinkUrowenElixir(startUrowenEncounter(next),'mysticShield'),/unavailable/);
});
test('small elixir lasts one opposed roll, including a tie, and never refills stock',()=>{
  let state=startUrowenEncounter(prepared());
  state=drinkUrowenElixir(state,'smallBalkian');
  assert.equal(state.character.elixirs.smallBalkian,1);
  const first=resolveUrowenEncounterRound(state,dice(1,3));
  assert.equal(first.result.playerAttack,first.result.enemyAttack);
  assert.equal(first.state.fight.nextElixirAttackBonus,0);
  const second=resolveUrowenEncounterRound(first.state,dice(3,3));
  assert.equal(second.result.playerAttack,second.result.enemyAttack);
  assert.equal(second.state.character.elixirs.smallBalkian,1);
});
test('mystic shield adds protection without persisting armour or masking permanent corrosion',()=>{
  let state=prepared();
  state.character.armor=[0,3,3,3,0,0];
  state.fight.player.armor=[0,3,3,3,0,0];
  state.fight.initialArmor=[0,3,3,3,0,0];
  state.fight.enemies[0].rules={rawDamage6PermanentChestArmorLoss:true};
  state.fight.enemies[0].damageBonus=0;
  state=startUrowenEncounter(drinkUrowenElixir(state,'mysticShield'));
  const output=resolveUrowenEncounterRound(state,dice(1,6,2,6));
  assert.equal(output.result.playerDamage,1);
  assert.deepEqual(output.state.character.armor,[0,2,2,2,0,0]);
  assert.equal(output.state.character.elixirs.mysticShield,1);
  output.state.fight.status='loss';
  const next=prepareUrowenEncounter(output.state,compileUrowenEncounters(UROWEN_SOURCE).find(row=>row.section===27));
  assert.equal(next.fight.elixirArmorBonus,undefined);
  assert.deepEqual(next.fight.player.armor,[0,2,2,2,0,0]);
});
test('unavailable stock and forbidden item scenes reject without consuming a dose',()=>{
  const state=prepared();state.character.elixirs.smallBalkian=0;
  assert.throws(()=>drinkUrowenElixir(startUrowenEncounter(state),'smallBalkian'),/No elixir/);
  state.fight.rules.items=false;
  assert.throws(()=>drinkUrowenElixir(state,'balkian'),/unavailable/);
  assert.equal(state.character.elixirs.balkian,2);
});
test('poison consumes one dose before combat and affects only the first wounded enemy',()=>{
  let state=prepared();state.character.elixirs.poison=1;
  state.fight.player.attributes.SK=20;state.fight.player.weapon.bonus=0;
  state=startUrowenEncounter(drinkUrowenElixir(state,'poison'));
  const first=resolveUrowenEncounterRound(state,dice(6,1,2,2));
  assert.equal(first.state.fight.enemies[0].weaponVenom,1);
  assert.equal(first.state.character.elixirs.poison,0);
  const oldLife=first.state.fight.enemies[0].life;
  first.state.fight.player.attributes.SK=first.state.fight.enemies[0].attributeValue;
  const second=resolveUrowenEncounterRound(first.state,dice(3,3));
  assert.equal(second.state.fight.enemies[0].life,oldLife-1);
  assert.equal(second.state.fight.poisonDelivered,true);
});
