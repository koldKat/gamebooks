import test from 'node:test';
import assert from 'node:assert/strict';
import {assignFatemasterDamage, attackFatemaster, disengageFatemaster, resolveFatemasterEnemy, resolveFatemasterHostileDamage, resolveFatemasterHostileSave, startFatemasterFight} from '../../../../public/js/battlesim/engines/fatemaster/battle.js';
import {allocateFatemasterSpell, castFatemaster, resolveFatemasterSpell, resolveFatemasterSpellDice, resolveFatemasterSpellSave} from '../../../../public/js/battlesim/engines/fatemaster/spells.js';
import {enemyAttack, playerDefence} from '../../../../public/js/battlesim/engines/fatemaster/rules.js';

const player=changes=>({name:'Player',strength:9,agility:9,maxStrength:12,maxAgility:12,power:8,damage:3,...changes});
const enemy=changes=>({name:'Opponent',strength:8,agility:8,power:0,attackBonus:0,defenceBonus:0,damage:2,...changes});
const die=(...values)=>()=>{assert.ok(values.length,'Unexpected extra die');return values.shift();};
const reload=f=>JSON.parse(JSON.stringify(f));
const start=(rules={},p={},enemies=[enemy()])=>startFatemasterFight(player(p),enemies,rules);
function completeEnemyMisses(f){for(let i=0;f.pending?.kind==='enemy'&&i<3;i++)f=resolveFatemasterEnemy(reload(f),die(1,1));return f;}
function beginSpell(f,spell,options={}){return resolveFatemasterSpell(completeEnemyMisses(castFatemaster(reload(f),spell,options)));}

test('casting pays Power once before the saved enemy turn and interrupted Healing cannot restore damage',()=>{
  const initial=start(),snapshot=JSON.stringify(initial);let f=castFatemaster(initial,'healing',{pool:'strength'});
  assert.equal(f.player.power,7);assert.equal(f.pending.kind,'enemy');assert.throws(()=>castFatemaster(reload(f),'healing',{pool:'strength'}));
  f=resolveFatemasterEnemy(reload(f),die(6,6));f=assignFatemasterDamage(reload(f),'strength');assert.equal(f.pending.kind,'spell-resolve');
  f=resolveFatemasterSpell(reload(f));assert.equal(f.player.strength,7);assert.equal(f.player.power,7);assert.equal(f.phase,'player');assert.equal(f.round,2);
  assert.equal(JSON.stringify(initial),snapshot);
});
test('uninterrupted Healing restores six to one pool without exceeding its initial score',()=>{
  const f=beginSpell(start({}, {strength:8}),'healing',{pool:'strength'});assert.equal(f.player.strength,12);assert.equal(f.player.agility,9);assert.equal(f.player.power,7);
});
test('a second attacker still acts after the first hit interrupts a spell',()=>{
  let f=castFatemaster(start({}, {},[enemy(),enemy()]),'healing',{pool:'strength'});
  f=resolveFatemasterEnemy(f,die(6,6));f=assignFatemasterDamage(f,'strength');assert.equal(f.pending.kind,'enemy');
  f=resolveFatemasterEnemy(reload(f),die(1,1));f=resolveFatemasterSpell(f);assert.equal(f.player.strength,7);assert.equal(f.events.filter(e=>e.type==='enemy-attack').length,2);
});
test('Power Bolt targets one creature and sends every point to Strength',()=>{
  let f=beginSpell(start({}, {},[enemy(),enemy()]),'bolt',{power:2,targetId:'enemy-0'});assert.equal(f.pending.dice,2);
  f=resolveFatemasterSpellDice(reload(f),die(2,3));assert.equal(f.pending.kind,'spell-save');
  f=resolveFatemasterSpellSave(reload(f),die(1));assert.equal(f.opponents[0].strength,3);assert.equal(f.opponents[0].agility,8);assert.equal(f.opponents[1].strength,8);assert.equal(f.player.power,6);
});
test('a magical defence equal to current Power resists and costs exactly one target Power',()=>{
  let f=beginSpell(start({}, {},[enemy({power:4})]),'bolt',{power:1,targetId:'enemy-0'});
  f=resolveFatemasterSpellDice(f,die(6));f=resolveFatemasterSpellSave(reload(f),die(3));
  assert.equal(f.opponents[0].strength,8);assert.equal(f.opponents[0].power,3);
});
test('Slumber spends a rolled budget on whole targets and leaves the unfinished creature unchanged',()=>{
  let f=beginSpell(start({}, {},[enemy({agility:4}),enemy({agility:4}),enemy({agility:4})]),'slumber');
  f=resolveFatemasterSpellDice(f,die(3,4,4));assert.equal(f.pending.budget,11);
  const before=JSON.stringify(f);assert.throws(()=>allocateFatemasterSpell(f,['enemy-0','enemy-1','enemy-2']));assert.equal(JSON.stringify(f),before);
  f=allocateFatemasterSpell(reload(f),['enemy-0','enemy-1']);f=resolveFatemasterSpellSave(f,die(1));f=resolveFatemasterSpellSave(reload(f),die(1));
  assert.deepEqual(f.opponents.map(e=>[e.condition,e.agility]),[['asleep',4],['asleep',4],['active',4]]);assert.equal(f.status,'fighting');
});
test('Slumber with insufficient points may leave every original Agility pool untouched',()=>{
  let f=beginSpell(start(),'slumber');f=resolveFatemasterSpellDice(f,die(1,1,1));f=allocateFatemasterSpell(f,[]);
  assert.equal(f.opponents[0].agility,8);assert.equal(f.opponents[0].condition,'active');assert.equal(f.phase,'player');
});
test('all fully Slumbered enemies end combat without applying fictitious wounds',()=>{
  let f=beginSpell(start(),'slumber');f=resolveFatemasterSpellDice(f,die(3,3,3));f=allocateFatemasterSpell(f,['enemy-0']);f=resolveFatemasterSpellSave(f,die(1));
  assert.equal(f.status,'win');assert.equal(f.opponents[0].agility,8);assert.equal(f.opponents[0].strength,8);
});
test('Repel affects only undead, allows explicit disengagement and does not claim a kill',()=>{
  let f=beginSpell(start({}, {},[enemy({undead:true})]),'repel');f=resolveFatemasterSpellDice(f,die(3,3,3));f=allocateFatemasterSpell(f,['enemy-0']);f=resolveFatemasterSpellSave(f,die(1));
  assert.equal(f.status,'fighting');assert.equal(f.opponents[0].condition,'repelled');f=disengageFatemaster(reload(f));assert.equal(f.status,'withdrawn');assert.equal(f.opponents[0].agility,8);
  f=beginSpell(start(),'repel');f=resolveFatemasterSpellDice(f,die(6,6,6));assert.equal(f.phase,'player');assert.equal(f.opponents[0].condition,'active');assert.throws(()=>disengageFatemaster(f));
});
test('a repelled opponent retaliates if attacked',()=>{
  let f=beginSpell(start({}, {},[enemy({undead:true})]),'repel');f=resolveFatemasterSpellDice(f,die(3,3,3));f=allocateFatemasterSpell(f,['enemy-0']);f=resolveFatemasterSpellSave(f,die(1));
  f=attackFatemaster(f,'enemy-0',die(4,4));assert.equal(f.opponents[0].condition,'active');assert.equal(f.pending.kind,'enemy');
});
test('Invisibility is resisted separately per present opponent and never stacks',()=>{
  let f=beginSpell(start({invisibilityBonus:1},{},[enemy(),enemy({power:6})]),'invisibility');
  f=resolveFatemasterSpellSave(f,die(1));f=resolveFatemasterSpellSave(reload(f),die(1));
  assert.deepEqual(f.invisibleTo,['enemy-0']);assert.equal(playerDefence(f,f.opponents[0]),1);assert.equal(playerDefence(f,f.opponents[1]),0);
  f=beginSpell(f,'invisibility');f=resolveFatemasterSpellSave(f,die(1));f=resolveFatemasterSpellSave(f,die(1));assert.deepEqual(f.invisibleTo,['enemy-0']);assert.equal(playerDefence(f,f.opponents[0]),1);
});
test('an already-owned scroll is consumed once even if the cast is interrupted',()=>{
  let f=castFatemaster(start({}, {power:0,scrolls:{healing:1}}),'healing',{pool:'strength',source:'scroll'});
  assert.equal(f.player.scrolls.healing,0);assert.equal(f.player.power,0);f=resolveFatemasterEnemy(f,die(6,6));f=assignFatemasterDamage(f,'strength');f=resolveFatemasterSpell(f);
  assert.throws(()=>castFatemaster(f,'healing',{pool:'strength',source:'scroll'}));assert.equal(f.player.strength,7);
});
test('a manually enabled renewal ring avoids casting costs without inventing Power restoration',()=>{
  const f=beginSpell(start({}, {renewPower:true,power:0}),'healing',{pool:'agility'});assert.equal(f.player.power,0);assert.equal(f.player.agility,12);
});
test('known ineffective spells and a no-magic area pay the cost and preserve normal combat replies',()=>{
  for(const rules of [{noMagic:true},{castingFails:true},{failedSpells:['healing']}]){
    const f=beginSpell(start(rules),'healing',{pool:'strength'});assert.equal(f.player.strength,9);assert.equal(f.player.power,7);assert.equal(f.phase,'player');
  }
});
test('fixed failed-cast damage is applied once without an extra invented attack roll',()=>{
  let f=castFatemaster(start({castDamage:3,castingFails:true}),'healing',{pool:'strength'});assert.equal(f.pending.kind,'damage');
  f=assignFatemasterDamage(reload(f),'agility');f=resolveFatemasterSpell(f);assert.equal(f.player.agility,6);assert.equal(f.player.strength,9);assert.equal(f.events.filter(e=>e.type==='enemy-attack').length,0);
});
test('a casting preemption uses its own two bolt dice rather than the miss-bolt choice',()=>{
  let f=castFatemaster(start({response:'miss-bolt',counterBoltDice:1,castingBoltDice:2},{power:1}),'healing',{pool:'strength'});
  assert.equal(f.pending.dice,2);f=resolveFatemasterHostileSave(f,die(1));f=resolveFatemasterHostileDamage(reload(f),die(2,2));f=assignFatemasterDamage(f,'strength');f=resolveFatemasterSpell(f);
  assert.equal(f.player.strength,5);assert.equal(f.player.power,0);
});
test('triple attack magic multiplies the rolled total, and surviving casting adds the explicit frenzy bonus',()=>{
  let f=beginSpell(start({attackMagicMultiplier:3,survivingCastAttackBonus:2}),'bolt',{power:1,targetId:'enemy-0'});
  f=resolveFatemasterSpellDice(f,die(1));f=resolveFatemasterSpellSave(f,die(1));assert.equal(f.opponents[0].strength,5);assert.equal(enemyAttack(f.opponents[0]),2);
});
test('Footsteps requiring existing Invisibility cannot create it or grant a free hit',()=>{
  const f=beginSpell(start({footstepsRequiresInvisible:true,footstepsAutomaticHit:true}),'footsteps',{action:'escape'});
  assert.equal(f.status,'fighting');assert.equal(f.player.power,7);assert.deepEqual(f.invisibleTo,[]);
});
test('Footsteps gives exactly one automatic hit OR escape, with the choice saved before casting',()=>{
  for(const action of ['hit','escape']){
    let f=startFatemasterFight(player(),[enemy()],{footstepsRequiresInvisible:true,footstepsAutomaticHit:true},{invisible:true});
    f=beginSpell(f,'footsteps',{action,targetId:'enemy-0'});f=resolveFatemasterSpellSave(reload(f),die(1));
    assert.equal(f.status,action==='hit'?'fighting':'withdrawn');assert.equal(f.opponents[0].strength,action==='hit'?5:8);
  }
});
test('the explicit disabling spell exception can end a spell-immune creature encounter',()=>{
  const f=beginSpell(start({disablingSpells:['light','repel'],failedSpells:['bolt','slumber']}),'light');
  assert.equal(f.status,'win');assert.equal(f.opponents[0].condition,'helpless');assert.equal(f.opponents[0].strength,8);
});
test('invalid spell resources, targets, allocations and unavailable Power preserve the caller state',()=>{
  const f=start({}, {power:0}),before=JSON.stringify(f);assert.throws(()=>castFatemaster(f,'healing',{pool:'strength'}));
  assert.throws(()=>castFatemaster(f,'travel'));assert.throws(()=>castFatemaster(f,'healing',{pool:'strength',source:'invented'}));assert.equal(JSON.stringify(f),before);
});
test('the unseen Footsteps allowance is consumed when the combatants engage',()=>{
  const rules={unseen:true,footstepsWhenUnseen:true,footstepsRequiresInvisible:true};
  let f=beginSpell(start(rules),'footsteps',{action:'escape'});f=resolveFatemasterSpellSave(f,die(1));assert.equal(f.status,'withdrawn');
  f=attackFatemaster(start(rules),'enemy-0',die(6,6));f=beginSpell(f,'footsteps',{action:'escape'});
  assert.equal(f.status,'fighting');assert.equal(f.phase,'player');assert.equal(f.rules.unseen,false);
});
test('a missed attack against a repelled creature still makes it retaliate',()=>{
  let f=beginSpell(start({}, {},[enemy({undead:true})]),'repel');f=resolveFatemasterSpellDice(f,die(3,3,3));f=allocateFatemasterSpell(f,['enemy-0']);f=resolveFatemasterSpellSave(f,die(1));
  f=attackFatemaster(f,'enemy-0',die(1,1));assert.equal(f.opponents[0].condition,'active');assert.equal(f.pending.kind,'enemy');
});
test('sleeping setup permits the spell before awakening survivors for their first reply',()=>{
  let f=startFatemasterFight(player(),[enemy()],{sleepingAllowed:true},{sleeping:true});assert.equal(f.status,'fighting');assert.equal(f.opponents[0].condition,'dormant');
  f=castFatemaster(f,'healing',{pool:'strength'});assert.equal(f.pending.kind,'spell-resolve');f=resolveFatemasterSpell(f);
  assert.equal(f.player.strength,12);assert.equal(f.pending.kind,'enemy');assert.equal(f.opponents[0].condition,'active');
});
