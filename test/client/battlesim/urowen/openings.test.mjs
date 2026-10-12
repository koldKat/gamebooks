import {UROWEN_SOURCE} from '../../../../public/js/battlesim/engines/urowen/roster.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createUrowenCharacter} from '../../../../public/js/battlesim/engines/urowen/core.js';
import {compileUrowenEncounters,createUrowenSimState,prepareUrowenEncounter} from '../../../../public/js/battlesim/engines/urowen/state.js';
import {startUrowenEncounter,resolveUrowenEncounterRound} from '../../../../public/js/battlesim/engines/urowen/rounds.js';
import {resolveUrowenOpening} from '../../../../public/js/battlesim/engines/urowen/openings.js';
const source=UROWEN_SOURCE;
const encounters=compileUrowenEncounters(source);
function prepared(section,customize=()=>{}) {
  const state=prepareUrowenEncounter(createUrowenSimState(createUrowenCharacter()),encounters.find(row=>row.section===section));
  customize(state);return state;
}
function dice(...values) {
  let index=0;
  const roll=()=>{assert.ok(index<values.length,`Unexpected roll ${index+1}`);return values[index++];};
  roll.done=()=>assert.equal(index,values.length);return roll;
}
test('required openings cannot be skipped and cannot be applied twice',()=>{
  for(const section of [282,341,360])assert.throws(()=>startUrowenEncounter(prepared(section)),/opening first/);
  const {state}=resolveUrowenOpening(prepared(282),dice(2));
  assert.equal(startUrowenEncounter(state).fight.status,'fighting');
  assert.throws(()=>resolveUrowenOpening(state,()=>1),/Opening unavailable/);
});
test('zodonte elixir succeeds on 2–6 but fails on 1 without inventing damage',()=>{
  for(let value=1;value<=6;value++) {
    const {state,result}=resolveUrowenOpening(prepared(282),dice(value));
    assert.equal(state.fight.enemies[0].attributeValue,value===1?6:5);
    assert.equal(result.enemyDamage,0);assert.equal(result.elixirHit,value!==1);
  }
});
test('enemy arrow respects printed hit threshold, location and armor',()=>{
  const state=prepared(341,s=>{s.fight.player.armor=[0,2,2,2,0,0];});
  const roll=dice(3,2,4),out=resolveUrowenOpening(state,roll);roll.done();
  assert.equal(out.result.playerDamage,3);assert.equal(out.state.character.life,17);
  assert.equal(state.character.life,20);
  assert.equal(resolveUrowenOpening(prepared(341),dice(2)).result.playerDamage,0);
});
test('printed retry omits the enemy arrow only on the permitted encounter',()=>{
  const {state,result}=resolveUrowenOpening(prepared(341),()=>assert.fail('Retry omits arrow'),{retry:true});
  assert.equal(result.dice.length,0);assert.equal(state.fight.player.life,20);
  assert.equal(resolveUrowenOpening(prepared(360),dice(1),{retry:true}).result.dice.length,1);
});
test('vrélek charge bypasses location and even very heavy armor',()=>{
  const state=prepared(360,s=>{s.fight.player.armor=[99,99,99,99,99,99];});
  const roll=dice(5,1,2,3),out=resolveUrowenOpening(state,roll);roll.done();
  assert.equal(out.result.playerDamage,8);assert.equal(out.state.character.life,12);
});
test('dodged vrélek charge consumes only hit and dodge dice',()=>{
  const roll=dice(6,6),out=resolveUrowenOpening(prepared(360),roll);roll.done();
  assert.equal(out.result.playerDamage,0);
});
test('a hunter gets one opening arrow using SK plus the printed bow difficulty',()=>{
  const input=prepared(27,s=>{s.fight.player.career='hunter';s.fight.player.attributes.SK=2;s.character.arrows=2;});
  const bow={difficulty:8,dice:1,bonus:2};
  const miss=dice(5),out=resolveUrowenOpening(input,miss,{hunterBow:bow});miss.done();
  assert.equal(out.result.enemyDamage,0);
  assert.equal(out.state.character.arrows,1);assert.equal(input.character.arrows,2);
  const hit=dice(6,2,4),success=resolveUrowenOpening(input,hit,{hunterBow:bow});hit.done();
  assert.equal(success.result.enemyDamage,6-input.fight.enemies[0].armorByLocation[1]);
  assert.equal(success.state.character.arrows,1);
  assert.throws(()=>resolveUrowenOpening(success.state,()=>1,{hunterBow:bow}),/unavailable/);
});
test('naked and bare-hand restrictions prevent a hunter from introducing a bow',()=>{
  for(const section of [46,79,319]) {
    const state=prepared(section,s=>{s.fight.player.career='hunter';});
    assert.throws(()=>resolveUrowenOpening(state,()=>1,{hunterBow:{difficulty:8,dice:1,bonus:2}}),/Hunter arrow unavailable/);
  }
});
test('the enchanted net is retained on a miss, consumed only on a hit',()=>{
  const input=prepared(27,s=>{s.character.net=true;s.fight.player.net=true;});
  const miss=resolveUrowenOpening(input,dice(4),{net:true});
  assert.equal(miss.state.character.net,true);assert.equal(miss.state.fight.enemies[0].net,undefined);
  const hit=resolveUrowenOpening(input,dice(5),{net:true});
  assert.equal(hit.state.character.net,false);assert.equal(input.character.net,true);
  assert.deepEqual(hit.state.fight.enemies[0].net,{attackPenalty:2,ongoing:1});
});
test('net ownership and item restrictions are enforced without changing the input',()=>{
  const input=prepared(27);
  assert.throws(()=>resolveUrowenOpening(input,()=>1,{net:true}),/Net unavailable/);
  assert.equal(input.fight.openingDone,undefined);
  const bare=prepared(79,s=>{s.character.net=true;});
  assert.throws(()=>resolveUrowenOpening(bare,()=>1,{net:true}),/Net unavailable/);
});
test('Némster charge has exactly four damage dice and ignores enemy armor',()=>{
  const input=prepared(123,s=>{s.character.horse=true;});
  const roll=dice(4,1,2,2,2,2),out=resolveUrowenOpening(input,roll,{horseCharge:true});roll.done();
  assert.equal(out.result.enemyDamage,11);assert.equal(out.state.fight.enemies[0].life,9);
});
test('Némster charge is not offered when the encounter has no printed charging space',()=>{
  const input=prepared(111,s=>{s.character.horse=true;});
  assert.throws(()=>resolveUrowenOpening(input,()=>1,{horseCharge:true}),/Horse charge unavailable/);
});
test('an opening arrow kill advances a group without healing or announcing overall victory',()=>{
  const input=prepared(101,s=>{s.fight.player.career='hunter';s.fight.player.attributes.SK=2;
    s.fight.player.life=7;s.fight.enemies[0].life=1;s.character.arrows=1;});
  const out=resolveUrowenOpening(input,dice(6,6,6),{hunterBow:{difficulty:8,dice:1,bonus:2}});
  assert.equal(out.state.fight.target,1);assert.equal(out.state.fight.status,'prepared');
  assert.equal(out.state.fight.openingDone,false);assert.equal(out.state.fight.player.life,7);
  assert.equal(out.state.history.length,0);
  assert.equal(out.state.character.arrows,0);
});
test('empty arrow stock rejects a shot before rolling without mutating the encounter',()=>{
  const input=prepared(27,s=>{s.fight.player.career='hunter';});
  assert.throws(()=>resolveUrowenOpening(input,()=>assert.fail('No roll without ammunition'),
    {hunterBow:{difficulty:8,dice:1,bonus:2}}),/No arrows/);
  assert.equal(input.character.arrows,0);assert.equal(input.fight.openingDone,undefined);
});
test('a lethal opening charge ends the encounter without a first opposed attack',()=>{
  const input=prepared(360,s=>{s.fight.player.life=1;});
  const out=resolveUrowenOpening(input,dice(5,1,1,1));
  assert.equal(out.state.fight.status,'loss');assert.equal(out.state.history.length,1);
  assert.throws(()=>startUrowenEncounter(out.state),/not prepared/);
});
test('section eight resolves the source volley and stops the duel once twelve life points are lost',()=>{
  const input=prepared(8);
  assert.throws(()=>startUrowenEncounter(input),/printed opening/);
  for(const raw of [1,6]) {
    const out=resolveUrowenOpening(input,dice(raw));
    assert.equal(out.result.playerDamage,2);assert.equal(out.state.fight.player.life,18);
  }
  assert.equal(resolveUrowenOpening(input,dice(3)).result.playerDamage,0);
  let state=resolveUrowenOpening(input,dice(3)).state;
  state.fight.player.career=null;state.fight.player.attributes.SK=20;
  state.fight.player.weapon.bonus=7;
  state=startUrowenEncounter(state);
  const out=resolveUrowenEncounterRound(state,dice(6,1,2,6));
  assert.equal(out.state.fight.enemies[0].life,9);
  const next=resolveUrowenEncounterRound(out.state,dice(6,1,2,1));
  assert.equal(next.state.fight.status,'retreated');
  assert.equal(next.state.fight.player.life,20);
});
test('Rédjod attacks immediately before the next opposed roll, once per combat',()=>{
  let input=prepared(27,s=>{s.character.companion=true;s.fight.player.life=5;
    s.fight.player.attributes.SK=s.fight.enemies[0].attributeValue;});
  input=startUrowenEncounter(input);
  const first=dice(2,2,3,3),out=resolveUrowenEncounterRound(input,first);first.done();
  assert.equal(out.result.companionDamage,4-input.fight.enemies[0].armorByLocation[1]);
  assert.equal(out.state.fight.companionUsed,true);
  const second=dice(3,3),again=resolveUrowenEncounterRound(out.state,second);second.done();
  assert.equal(again.result.companionDamage,undefined);
});
test('Rédjod never revives a player killed by ongoing damage',()=>{
  let input=prepared(27,s=>{s.character.companion=true;s.fight.player.life=1;
    s.fight.effects=[{type:'venom',amount:1,enemy:0}];});
  input=startUrowenEncounter(input);
  const out=resolveUrowenEncounterRound(input,()=>assert.fail('No attack when dead'));
  assert.equal(out.state.fight.status,'loss');assert.equal(out.state.fight.companionUsed,false);
});
test('Spirit of the Forest applies the explicitly printed mounted-fighting rules',()=>{
  const input=startUrowenEncounter(prepared(111,s=>{s.fight.player.attributes.SK=20;}));
  const roll=dice(6,1,1,2,3),out=resolveUrowenEncounterRound(input,roll);roll.done();
  assert.equal(out.result.playerAttack,27);assert.equal(out.result.location,2);
  assert.deepEqual(out.result.dice.find(d=>d.phase==='location').discarded,[1]);
});
