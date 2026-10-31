import test from 'node:test';
import assert from 'node:assert/strict';
import {assignFatemasterDamage, resolveFatemasterEnemy, resumeFatemasterFight, startFatemasterFight} from '../../../../public/js/battlesim/engines/fatemaster/battle.js';
import {allocateFatemasterSpell, castFatemaster, resolveFatemasterSpell, resolveFatemasterSpellCheck, resolveFatemasterSpellDice, resolveFatemasterSpellSave} from '../../../../public/js/battlesim/engines/fatemaster/spells.js';
import {enemyAttack} from '../../../../public/js/battlesim/engines/fatemaster/rules.js';

const player = () => ({name:'Player',strength:8,agility:8,maxStrength:12,maxAgility:12,power:8,damage:3});
const enemy = () => ({name:'Opponent',strength:8,agility:8,power:0,damage:2,attackBonus:0,defenceBonus:0});
const reload = fight => JSON.parse(JSON.stringify(fight));
const start = (rules = {}, count = 1) => startFatemasterFight(player(),Array.from({length:count},enemy),rules);
function missResponses(fight) {
  while(fight.pending?.kind==='enemy')fight=resolveFatemasterEnemy(reload(fight),{total:2});
  return fight;
}
const begin = (fight, spell = 'healing', options = {pool:'strength'}) => resolveFatemasterSpell(missResponses(castFatemaster(reload(fight),spell,options)));

test('arena Healing detection remains a separate paid and saved check before the effect',()=>{
  const original=start({healingDetection:true}),before=JSON.stringify(original);
  let fight=begin(original);
  assert.equal(fight.pending.kind,'spell-check');
  assert.equal(fight.player.power,7);
  assert.equal(fight.player.strength,8);
  assert.throws(()=>resolveFatemasterSpell(fight));
  fight=resolveFatemasterSpellCheck(reload(fight),{total:8});
  assert.equal(fight.pending.kind,'spell-resolve');
  fight=resolveFatemasterSpell(reload(fight));
  assert.equal(fight.player.strength,12);
  assert.equal(fight.player.power,7);
  assert.equal(fight.events.filter(e=>e.type==='casting-detection').length,1);
  assert.equal(JSON.stringify(original),before);
});

test('failed arena detection pauses without Healing or a fabricated battle loss',()=>{
  let fight=begin(start({healingDetection:true}));
  fight=resolveFatemasterSpellCheck(reload(fight),{total:9});
  assert.equal(fight.status,'paused');
  assert.equal(fight.pauseReason,'spell-consequence');
  assert.equal(fight.player.strength,8);
  assert.equal(fight.player.power,7);
  assert.equal(fight.casting,null);
  assert.equal(fight.pending,null);
  assert.deepEqual(fight.queue,[]);
  assert.throws(()=>resumeFatemasterFight(fight));
});

test('arena detection uses current Agility after interruption and cannot restore an interrupted spell',()=>{
  let fight=castFatemaster(start({healingDetection:true}),'healing',{pool:'strength'});
  fight=resolveFatemasterEnemy(reload(fight),{total:12});
  fight=assignFatemasterDamage(reload(fight),'agility');
  fight=resolveFatemasterSpell(reload(fight));
  assert.equal(fight.player.agility,6);
  fight=resolveFatemasterSpellCheck(reload(fight),{total:6});
  fight=resolveFatemasterSpell(reload(fight));
  assert.equal(fight.status,'fighting');
  assert.equal(fight.player.strength,8);
  assert.equal(fight.player.power,7);
  assert.equal(fight.events.find(e=>e.type==='spell-failed').interrupted,true);
});

test('other arena spells pay the actual cost and pause after the ordinary response without resolving magic',()=>{
  const fight=begin(start({healingDetection:true}),'bolt',{power:3,targetId:'enemy-0'});
  assert.equal(fight.status,'paused');
  assert.equal(fight.player.power,5);
  assert.equal(fight.opponents[0].strength,8);
  assert.equal(fight.events.filter(e=>e.type==='enemy-attack').length,1);
  assert.equal(fight.events.filter(e=>e.type==='spell-dice').length,0);
});

test('a named pre-effect consequence prevents a completed spell but never erases its cost',()=>{
  const fight=begin(start({pauseBeforeSpellEffects:['healing']}));
  assert.equal(fight.status,'paused');
  assert.equal(fight.player.strength,8);
  assert.equal(fight.player.power,7);
});

test('a post-effect consequence preserves Healing before pausing for the reader',()=>{
  const fight=begin(start({pauseAfterSpellEffects:['healing']}));
  assert.equal(fight.status,'paused');
  assert.equal(fight.player.strength,12);
  assert.equal(fight.player.power,7);
  assert.equal(fight.events.filter(e=>e.type==='healing').length,1);
});

test('the gripping chest can fail a paid three-point Bolt without rolling damage or saving',()=>{
  const fight=begin(start({castingFails:true}),'bolt',{power:3,targetId:'enemy-0'});
  assert.equal(fight.status,'fighting');
  assert.equal(fight.player.power,5);
  assert.equal(fight.opponents[0].strength,8);
  assert.equal(fight.events.filter(e=>e.type==='enemy-attack').length,1);
  assert.equal(fight.events.filter(e=>e.type==='spell-dice').length,0);
  assert.equal(fight.round,2);
});

test('once-only cast fury changes both Attack and Damage without stacking after reload',()=>{
  let fight=start({survivingCastAttackBonus:1,survivingCastDamageBonus:1,survivingCastBonusMode:'once'});
  fight=begin(fight,'light',{});
  assert.equal(enemyAttack(fight.opponents[0]),1);
  assert.equal(fight.opponents[0].damage,3);
  fight=begin(reload(fight),'light',{});
  assert.equal(enemyAttack(fight.opponents[0]),1);
  assert.equal(fight.opponents[0].damage,3);
});

test('per-cast fury explicitly stacks and damage fury cannot silently choose a stacking rule',()=>{
  let fight=start({survivingCastAttackBonus:1,survivingCastDamageBonus:1,survivingCastBonusMode:'per-cast'});
  fight=begin(fight,'light',{});
  fight=begin(reload(fight),'light',{});
  assert.equal(enemyAttack(fight.opponents[0]),2);
  assert.equal(fight.opponents[0].damage,4);
  assert.throws(()=>start({survivingCastDamageBonus:1}));
});

test('only opponents able to fight gain cast fury after Slumber resolves',()=>{
  let fight=begin(start({survivingCastAttackBonus:2,survivingCastBonusMode:'once'},2),'slumber',{});
  fight=resolveFatemasterSpellDice(reload(fight),{total:8});
  fight=allocateFatemasterSpell(reload(fight),['enemy-0']);
  fight=resolveFatemasterSpellSave(reload(fight),{total:2});
  assert.equal(fight.opponents[0].condition,'asleep');
  assert.equal(enemyAttack(fight.opponents[0]),0);
  assert.equal(enemyAttack(fight.opponents[1]),2);
});

test('a remaining-opponent threshold waits until every allocated spell target has resolved',()=>{
  let fight=start({stopRemaining:1},2);
  for(const enemy of fight.opponents)enemy.agility=4;
  fight=begin(fight,'slumber',{});
  fight=resolveFatemasterSpellDice(reload(fight),{total:8});
  fight=allocateFatemasterSpell(reload(fight),['enemy-0','enemy-1']);
  fight=resolveFatemasterSpellSave(reload(fight),{total:2});
  assert.equal(fight.status,'fighting');
  assert.equal(fight.pending.kind,'spell-save');
  assert.equal(fight.pending.effect.enemyId,'enemy-1');
  fight=resolveFatemasterSpellSave(reload(fight),{total:2});
  assert.equal(fight.status,'win');
  assert.deepEqual(fight.opponents.map(e=>e.condition),['asleep','asleep']);
});
