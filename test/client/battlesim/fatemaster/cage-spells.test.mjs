import test from 'node:test';
import assert from 'node:assert/strict';
import {assignFatemasterDamage, resolveFatemasterCheck, resolveFatemasterEnemy, startFatemasterFight, withdrawFatemaster} from '../../../../public/js/battlesim/engines/fatemaster/battle.js';
import {castFatemaster, resolveFatemasterSpell} from '../../../../public/js/battlesim/engines/fatemaster/spells.js';
import {prepareFatemasterEncounter} from '../../../../public/js/battlesim/engines/fatemaster/catalog.js';

const reload = fight => JSON.parse(JSON.stringify(fight));
const start = (rules = {}, options = {}) => startFatemasterFight(
  {name:'Player',strength:9,agility:9,power:8,damage:3},
  [{name:'Opponent',strength:8,agility:8,power:0,attackBonus:0,defenceBonus:0,damage:2}],rules,options);
function cast(fight, spell) {
  fight=castFatemaster(reload(fight),spell);
  while(fight.pending?.kind==='enemy')fight=resolveFatemasterEnemy(reload(fight),{total:2});
  return resolveFatemasterSpell(reload(fight));
}

test('Sesame spends two Power and opens the cage roof without ending combat',()=>{
  const original=start({sesameOpensRoof:true,flyfeetDamage:3}),before=JSON.stringify(original);
  const fight=cast(original,'sesame');
  assert.equal(fight.player.power,6);
  assert.equal(fight.rules.roofOpen,true);
  assert.equal(fight.status,'fighting');
  assert.equal(fight.phase,'player');
  assert.equal(JSON.stringify(original),before);
});

test('Flyfeet after opening the roof loses the printed climbing damage before withdrawal',()=>{
  let fight=cast(start({sesameOpensRoof:true,flyfeetDamage:3}),'sesame');
  fight=cast(reload(fight),'flyfeet');
  assert.equal(fight.pending.kind,'damage');
  assert.equal(fight.pending.amount,3);
  assert.equal(fight.status,'fighting');
  fight=assignFatemasterDamage(reload(fight),'strength');
  assert.equal(fight.status,'withdrawn');
  assert.equal(fight.player.strength,6);
  assert.equal(fight.player.power,5);
});

test('a closed roof prevents Flyfeet escape and resumes the printed opponent step',()=>{
  let fight=cast(start({flyfeetDamage:4}),'flyfeet');
  fight=assignFatemasterDamage(reload(fight),'agility');
  assert.equal(fight.player.agility,5);
  assert.equal(fight.pending.kind,'enemy');
  fight=resolveFatemasterEnemy(reload(fight),{total:2});
  assert.equal(fight.status,'fighting');
  assert.equal(fight.phase,'player');
});

test('an already open roof is an explicit setup fact and lethal climbing damage prevents withdrawal',()=>{
  let fight=cast(start({flyfeetDamage:9},{roofOpen:true}),'flyfeet');
  assert.equal(fight.pending.amount,9);
  fight=assignFatemasterDamage(reload(fight),'agility');
  assert.equal(fight.status,'loss');
  assert.throws(()=>start({flyfeetDamage:3},{roofOpen:'yes'}));
});

test('a failed cage escape check inflicts damage and continues instead of granting withdrawal',()=>{
  const rules={escape:{mode:'damage-check',pool:'agility',successDamage:3,failureDamage:3,failureOutcome:'continue'}};
  let fight=withdrawFatemaster(start(rules));
  fight=resolveFatemasterCheck(reload(fight),{total:12});
  assert.equal(fight.pending.amount,3);
  fight=assignFatemasterDamage(reload(fight),'strength');
  assert.equal(fight.status,'fighting');
  assert.equal(fight.phase,'player');
  let escaped=withdrawFatemaster(start(rules));
  escaped=resolveFatemasterCheck(escaped,{total:2});
  escaped=assignFatemasterDamage(escaped,'strength');
  assert.equal(escaped.status,'withdrawn');
});

test('armoured variants and explicit casting interpretations do not mutate source catalog entries',()=>{
  const original={section:'example',rules:{disarm:{threshold:10},survivingCastBonusMode:'choose'},groups:[{each:{attackBonus:2,defenceBonus:0}}],variants:[{key:'armoured',enemyDefenceBonus:3}]};
  const before=JSON.stringify(original);
  const config=prepareFatemasterEncounter(original,{variant:'armoured',disarmInterpretation:'raw-hit',furyMode:'once'});
  assert.equal(config.groups[0].each.defenceBonus,3);
  assert.equal(config.rules.disarm.basis,'raw');
  assert.equal(config.rules.disarm.requiresHit,true);
  assert.equal(config.rules.survivingCastBonusMode,'once');
  assert.equal(JSON.stringify(original),before);
  assert.throws(()=>prepareFatemasterEncounter(original,{disarmInterpretation:''}));
  assert.throws(()=>prepareFatemasterEncounter(original,{furyMode:''}));
});
