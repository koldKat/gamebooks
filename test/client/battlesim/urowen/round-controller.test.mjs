import { loadFixtureRoster } from '../roster-fixtures.mjs';
await loadFixtureRoster(550);
import {UROWEN_SOURCE} from '../../../../public/js/battlesim/engines/urowen/roster.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createUrowenCharacter} from '../../../../public/js/battlesim/engines/urowen/core.js';
import {compileUrowenEncounters,createUrowenSimState,prepareUrowenEncounter} from '../../../../public/js/battlesim/engines/urowen/state.js';
import {startUrowenEncounter,resolveUrowenEncounterRound} from '../../../../public/js/battlesim/engines/urowen/rounds.js';
import {resolveUrowenOpening} from '../../../../public/js/battlesim/engines/urowen/openings.js';
const specs=compileUrowenEncounters(UROWEN_SOURCE);
function fight(section,customize=()=>{}) {
  let state=prepareUrowenEncounter(createUrowenSimState(createUrowenCharacter()),specs.find(row=>row.section===section));
  customize(state.fight,state);
  if(section===8)state=resolveUrowenOpening(state,()=>3).state;
  return startUrowenEncounter(state);
}
function dice(...values) {
  let index=0;
  const roll=()=>{assert.ok(index<values.length,`Unexpected roll ${index+1}`);return values[index++];};
  roll.done=()=>assert.equal(index,values.length);return roll;
}
const winning=f=>{f.player.attributes.SK=20;f.player.weapon={attribute:'SK',dice:1,bonus:20,reroll:[]};};
test('ordinary victory restores life, records once and never mutates its input',()=>{
  const input=fight(8,winning),before=structuredClone(input);
  input.fight.player.life=3;const roll=dice(6,1,6,6);
  const {state}=resolveUrowenEncounterRound(input,roll);roll.done();
  assert.equal(state.fight.status,'win');assert.equal(state.character.life,20);
  assert.equal(state.history.length,1);assert.equal(input.history.length,0);
  assert.deepEqual(input.fight.enemies,before.fight.enemies);
  assert.throws(()=>resolveUrowenEncounterRound(state,()=>1),/not fighting/);
});
test('multi-enemy victory advances without healing between foes',()=>{
  const input=fight(101,winning);input.fight.player.life=7;
  const roll=dice(6,1,6,6);
  const {state,result}=resolveUrowenEncounterRound(input,roll);roll.done();
  assert.equal(state.fight.status,'fighting');assert.equal(state.fight.target,1);
  assert.equal(state.fight.player.life,7);assert.equal(state.history.length,0);assert.equal(result.nextEnemy,1);
});
test('mission victory carries life and power into the next mission encounter',()=>{
  const input=fight(289,winning);input.fight.enemies[0].life=1;
  input.fight.player.life=11;input.fight.player.power=1;
  const {state}=resolveUrowenEncounterRound(input,dice(6,1,6,6));
  assert.equal(state.fight.status,'win');assert.equal(state.temporary.player.life,11);
  assert.equal(state.temporary.player.power,1);assert.equal(state.character.life,20);
  const next=prepareUrowenEncounter(state,specs.find(row=>row.section===281));
  assert.equal(next.fight.player.life,11);assert.equal(next.fight.player.power,1);
});
test('ongoing damage can defeat a foe and advance a group without rolling or healing',()=>{
  const input=fight(101);input.fight.player.life=8;
  input.fight.enemies[0].life=1;input.fight.enemies[0].net={ongoing:1,attackPenalty:0};
  const {state}=resolveUrowenEncounterRound(input,()=>assert.fail('No attack after ongoing kill'));
  assert.equal(state.fight.target,1);assert.equal(state.fight.player.life,8);
});
test('ongoing lethal damage ends a fight before any attack or appendage damage',()=>{
  const input=fight(111);input.fight.player.life=1;
  input.fight.effects=[{type:'bleeding',amount:1,enemy:0}];
  const {state}=resolveUrowenEncounterRound(input,()=>assert.fail('No attack after death'));
  assert.equal(state.fight.status,'loss');assert.equal(state.fight.player.life,0);
});
test('appendages receive no armor or location bonus and surviving vines hurt at round end',()=>{
  const input=fight(111,f=>{winning(f);f.player.weapon.bonus=0;});
  const roll=dice(6,1,6);
  const {state,result}=resolveUrowenEncounterRound(input,roll,{appendage:0});roll.done();
  assert.equal(state.fight.appendages[0].life,0);assert.equal(state.fight.enemies[0].life,20);
  assert.equal(state.fight.player.life,19);assert.equal(result.supportDamage,1);
});
test('a destroyed appendage cannot be targeted again',()=>{
  const input=fight(111,winning);input.fight.appendages[0].life=0;
  assert.throws(()=>resolveUrowenEncounterRound(input,dice(6,1),{appendage:0}),/Invalid appendage/);
});
test('five sisteliums inflict support damage at the beginning, before a successful kill',()=>{
  const input=fight(224,winning);
  const {state,result}=resolveUrowenEncounterRound(input,dice(6,1,6,6));
  assert.equal(result.supportDamage,2);assert.equal(state.fight.player.life,18);
  assert.equal(state.fight.target,1);assert.equal(state.fight.enemies.filter(e=>e.life>0).length,4);
});
test('Ardronte loses second-head support once current health reaches 18',()=>{
  const input=fight(150,f=>{winning(f);f.enemies[0].life=18;f.player.weapon.bonus=0;});
  const {state,result}=resolveUrowenEncounterRound(input,dice(6,1,1,1));
  assert.equal(result.supportDamage,undefined);assert.equal(state.fight.player.life,20);
});
test('twenty tied rounds never become a fabricated hit',()=>{
  let input=fight(27,f=>{f.player.attributes.SK=f.enemies[0].attributeValue;});
  for(let index=0;index<25;index++)input=resolveUrowenEncounterRound(input,dice(3,3)).state;
  assert.equal(input.fight.player.life,20);assert.equal(input.fight.enemies[0].life,input.fight.enemies[0].maxLife);
  assert.equal(input.fight.status,'fighting');assert.equal(input.fight.round,25);
});
test('invisibility uses exactly two direct attacks, including the triggering won round',()=>{
  let input=fight(336,f=>{f.player.career=null;f.player.attributes.SK=0;f.enemies[0].life=9;});
  let roll=dice(2,6,6);
  let output=resolveUrowenEncounterRound(input,roll);roll.done();
  assert.equal(output.state.fight.enemies[0].power,0);assert.equal(output.state.fight.enemies[0].invisibilityAttacks,1);
  assert.equal(output.result.playerDodged,true);
  roll=dice(6);output=resolveUrowenEncounterRound(output.state,roll);roll.done();
  assert.equal(output.state.fight.enemies[0].invisibilityAttacks,0);assert.equal(output.result.invisible,true);
  output.state.fight.player.attributes.SK=20;
  roll=dice(6,2,6);output=resolveUrowenEncounterRound(output.state,roll);roll.done();
  assert.equal(output.result.invisible,undefined);assert.equal(output.result.enemyDodged,true);
});
test('won-attack croak penalizes exactly the next round',()=>{
  const input=fight(325,f=>{f.player.career=null;f.player.attributes.SK=0;f.player.life=60;});
  const first=resolveUrowenEncounterRound(input,dice(1,6,2,2));
  assert.equal(first.state.fight.effects[0].type,'next-player-attack-penalty');
  const second=resolveUrowenEncounterRound(first.state,dice(1,2,2,2));
  assert.equal(second.result.playerAttack,0);assert.equal(second.state.fight.effects.length,0);
});
test('bonebreaker attack penalties accumulate but repeated critical blood loss does not',()=>{
  let input=fight(227,f=>{f.player.career=null;f.player.attributes.SK=0;f.player.life=100;});
  for(let i=0;i<2;i++)input=resolveUrowenEncounterRound(input,dice(1,6,2,6)).state;
  assert.equal(input.fight.effects.find(e=>e.type==='cumulative-player-attack-penalty').amount,2);
  input=fight(352,f=>{f.player.career=null;f.player.attributes.SK=0;f.player.life=100;});
  for(let i=0;i<2;i++)input=resolveUrowenEncounterRound(input,dice(1,6,2,6)).state;
  assert.equal(input.fight.effects.filter(e=>e.type==='bleeding').length,1);
  assert.equal(input.fight.effects.find(e=>e.type==='bleeding').amount,1);
});
test('shield blocks raw-six damage without removing a previously spent fire edge',()=>{
  const input=fight(331,f=>{winning(f);f.enemies[0].life=50;});
  const {state,result}=resolveUrowenEncounterRound(input,dice(6,1,6,6),
    {fireEdge:true,knownSpells:['fireEdge']});
  assert.equal(result.enemyDamage,0);assert.equal(state.fight.enemies[0].life,50);
  assert.equal(state.fight.fireEdgeUsed,true);
});
test('a fleeing pheasant escapes without invented damage',()=>{
  const input=fight(206,f=>{f.player.career=null;f.player.attributes.SK=0;});
  const {state,result}=resolveUrowenEncounterRound(input,dice(1,6,2,4));
  assert.equal(state.fight.status,'escaped');assert.equal(state.fight.destination,162);
  assert.equal(result.playerDamage,0);assert.equal(state.fight.player.life,25);
});
test('instant-death critical hits override the ordinary remaining-life result',()=>{
  const input=fight(350,f=>{f.player.career=null;f.player.attributes.SK=0;f.player.life=100;});
  const {state}=resolveUrowenEncounterRound(input,dice(1,6,2,6));
  assert.equal(state.fight.status,'loss');assert.equal(state.fight.destination,375);assert.ok(state.fight.player.life>0);
});
test('life suction preserves spent power and does not apply armor or damage modifiers',()=>{
  const input=fight(27,f=>{f.player.career='sorcerer';f.player.attributes.MAG=20;
    f.player.weapon.attribute='MAG';f.player.power=3;f.player.life=8;});
  const {state,result}=resolveUrowenEncounterRound(input,dice(6,1,1,1),
    {spell:'lifeSuction',knownSpells:['lifeSuction']});
  assert.equal(result.enemyDamage,2);assert.equal(result.healed,2);
  assert.equal(state.character.power,1);assert.equal(state.character.life,10);
});
test('forbidden spell actions leave the original state unchanged',()=>{
  const input=fight(79,f=>{winning(f);f.player.weapon.attribute='MAG';f.player.attributes.MAG=20;});
  const before=structuredClone(input);
  assert.throws(()=>resolveUrowenEncounterRound(input,dice(6,1),{spell:'poppy',knownSpells:['poppy']}),/Spell unavailable/);
  assert.deepEqual(input,before);
});
test('the monk may heal on one won attack only, instead of dealing damage',()=>{
  const input=fight(27,f=>{winning(f);f.player.career='monk';f.player.life=1;});
  const {state,result}=resolveUrowenEncounterRound(input,dice(6,1,6),{monkHeal:true});
  assert.equal(result.healed,8);assert.equal(state.character.life,9);
  assert.equal(state.fight.enemies[0].life,input.fight.enemies[0].life);
  assert.throws(()=>resolveUrowenEncounterRound(state,dice(6,1),{monkHeal:true}),/Healing unavailable/);
});
test('possessed-body amputation kills on a raw six to the trunk',()=>{
  const input=fight(82,f=>{f.player.attributes.STR=20;});
  const {state}=resolveUrowenEncounterRound(input,dice(6,1,2,6));
  assert.equal(state.fight.status,'win');assert.equal(state.fight.enemies[0].life,0);
  assert.equal(state.character.maxLife,20);
});
test('naked and bare-handed fights do not replace saved equipment',()=>{
  const input=fight(79,winning),weapon=structuredClone(input.character.weapon);
  const {state}=resolveUrowenEncounterRound(input,dice(6,1,6,6));
  assert.deepEqual(state.character.weapon,weapon);
});
test('the support lion attacks without an opposed roll while the lead lion survives',()=>{
  const input=fight(255,f=>{f.player.attributes.SK=f.enemies[0].attributeValue;
    f.player.armor=[0,1,1,1,0,0];});
  const roll=dice(3,3,2,4);
  const {state,result}=resolveUrowenEncounterRound(input,roll);roll.done();
  assert.equal(result.supportDamage,5);assert.equal(state.fight.player.life,15);
  assert.equal(state.fight.enemies[0].life,26);
});
test('the support lion backs away immediately when the lead lion dies',()=>{
  const input=fight(255,winning);
  const roll=dice(6,1,6,6);
  const {state,result}=resolveUrowenEncounterRound(input,roll);roll.done();
  assert.equal(state.fight.status,'win');assert.equal(result.supportDamage,undefined);
});
test('fireball preserves the selected ice-crystal conversion rather than reverting to three',()=>{
  const input=fight(27,f=>{f.player.career='sorcerer';f.player.attributes.MAG=20;
    f.player.weapon.attribute='MAG';f.player.weapon.sorcererOne=4;f.player.power=3;});
  const {result}=resolveUrowenEncounterRound(input,dice(6,1,2,1),
    {spell:'fireball',knownSpells:['fireball']});
  assert.equal(result.enemyDamage,9-input.fight.enemies[0].armorByLocation[1]);
});
