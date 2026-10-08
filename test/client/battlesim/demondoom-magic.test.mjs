import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rollDemondoomCharacter } from '../../../public/js/battlesim/engines/demonspawn/demondoom-character.js';
import { DEMONDOOM_SPELLS, checkDemondoomInclination, demondoomCastAvailability, attemptDemondoomSpell,
  applyDemondoomSpellEffect, tradeDemondoomLifeForPower, restoreDemondoomTimewarp } from '../../../public/js/battlesim/engines/demonspawn/demondoom-magic.js';
const high = ()=>.999, low = ()=>0;
const caster = () => {const player=rollDemondoomCharacter(low);player.power=200;checkDemondoomInclination(player,1,high);return player;};

test('Demondoom has nine spells and does not inherit the unavailable Crypt or different prior-book costs',()=>{
  assert.equal(DEMONDOOM_SPELLS.length,9);
  const costs=Object.fromEntries(DEMONDOOM_SPELLS.map(spell=>[spell.id,spell.cost]));
  assert.equal(costs.crypt,undefined);assert.equal(costs.timewarp,15);assert.equal(costs.xenophobia,20);
  assert.equal(costs.resurrection,null);assert.equal(costs.retrace,null);
});

test('natural inclination is tested once per section and a refusal cannot be rerolled',()=>{
  const player=rollDemondoomCharacter(low);
  assert.equal(checkDemondoomInclination(player,1,low),false);
  assert.equal(checkDemondoomInclination(player,1,high),false);
  assert.equal(attemptDemondoomSpell(player,1,'fireball',{},high).error,'unwilling');
  assert.equal(checkDemondoomInclination(player,2,high),true);
});

test('failed casting spends Power and consumes that section attempt',()=>{
  const player=caster();
  const result=attemptDemondoomSpell(player,1,'fireball',{},low);
  assert.equal(result.success,false);assert.equal(player.power,185);
  assert.equal(attemptDemondoomSpell(player,1,'fireball',{},high).error,'used-this-section');
  checkDemondoomInclination(player,2,high);
  assert.equal(attemptDemondoomSpell(player,2,'fireball',{},high).success,true);
});

test('invisibility and paralysis are limited to one attempt per adventure, not merely one per section',()=>{
  for (const spell of ['invisibility','paralysis']) {
    const player=caster();attemptDemondoomSpell(player,1,spell,{},low);
    checkDemondoomInclination(player,2,high);
    assert.equal(attemptDemondoomSpell(player,2,spell,{},high).error,'used-this-adventure');
  }
});

test('availability checks current Power on every attempt and unresolved costs require manual input',()=>{
  const player=caster();
  assert.equal(demondoomCastAvailability(player,1,'fireball').cost,15);
  player.power=14;
  assert.equal(attemptDemondoomSpell(player,1,'fireball',{},high).error,'insufficient-power');
  assert.deepEqual(player.magicSections['1'].used,[]);
  player.power=100;
  assert.equal(attemptDemondoomSpell(player,1,'resurrection',{},high).error,'manual-cost-required');
  assert.equal(attemptDemondoomSpell(player,1,'resurrection',{manualCost:50},high).effect,'manual');
  assert.equal(player.power,50);
});

test('Golden Guard immunity still spends Power and consumes the spell but applies no damage',()=>{
  const player=caster(), enemy={lifePoints:654};
  const result=attemptDemondoomSpell(player,1,'fireball',{magicImmune:true},high);
  assert.equal(result.effect,'immune');assert.equal(player.power,185);
  assert.equal(applyDemondoomSpellEffect(player,enemy,result),null);assert.equal(enemy.lifePoints,654);
});

test('Fireball doubles against underground creatures and poison immunity uses the printed single die',()=>{
  const player=caster(), enemy={lifePoints:200};
  const result=attemptDemondoomSpell(player,1,'fireball',{},high);
  assert.equal(applyDemondoomSpellEffect(player,enemy,result,{doubleMagic:true}).damage,100);
  const needle=attemptDemondoomSpell(player,1,'poison-needle',{},high);
  assert.equal(applyDemondoomSpellEffect(player,enemy,needle,{},high).killed,false);
  assert.equal(enemy.lifePoints,100);
  assert.equal(applyDemondoomSpellEffect(player,enemy,needle,{},low),null);
  checkDemondoomInclination(player,2,high);
  const next=attemptDemondoomSpell(player,2,'poison-needle',{},high);
  assert.equal(applyDemondoomSpellEffect(player,enemy,next,{},low).killed,true);
});

test('Timewarp restores printed Power and enemy statistics, while retaining spent once-per-section spells',()=>{
  const opening={player:caster(),enemies:[{lifePoints:200,maxLife:200}]};
  const fight={opening:structuredClone(opening),player:structuredClone(opening.player),enemies:[{lifePoints:50}],round:4,rest:2};
  attemptDemondoomSpell(fight.player,1,'timewarp',{},high);
  fight.player.lifePoints=1;fight.player.power=5;
  restoreDemondoomTimewarp(fight);
  assert.equal(fight.player.lifePoints,opening.player.lifePoints);assert.equal(fight.player.power,200);
  assert.equal(fight.enemies[0].lifePoints,200);assert.equal(fight.round,0);assert.equal(fight.rest,0);
  assert.equal(attemptDemondoomSpell(fight.player,1,'timewarp',{},high).error,'used-this-section');
});

test('Life-Power trading is explicit and cannot revive or kill the player',()=>{
  const player=caster();
  assert.equal(tradeDemondoomLifeForPower(player,10),true);
  assert.equal(player.lifePoints,102);assert.equal(player.power,210);
  assert.equal(tradeDemondoomLifeForPower(player,102),false);
  assert.equal(tradeDemondoomLifeForPower({...player,lifePoints:0},10),false);
});
