import test from 'node:test';
import assert from 'node:assert/strict';
import {WINTER_ENCOUNTERS} from './destinyquest-fixtures.mjs';
import {createDestinyFight, startDestinyRound} from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {resolveDestinyAbilityRoll} from '../../../public/js/battlesim/engines/destinyquest/ability-rolls.js';

function pending(section, kind, face) {
  const fight=startDestinyRound(createDestinyFight({speed:4,brawn:5,armour:2,health:30},
    [{name:'Rival',speed:3,brawn:4,armour:1,health:50}]),0);
  fight.encounter={sourceSection:String(section)};fight.phase='ability-rolled';
  fight.turn.pendingAbility={type:'encounter',name:'Saved test',event:{kind,name:'Saved test'},dice:[face],returnPhase:'damage'};
  return fight;
}

test('old saved event fields resolve using renamed database settings without a state migration',()=>{
  const roster=structuredClone(WINTER_ENCOUNTERS),preset=roster.find(row=>row.section==='83');preset.section='910';
  preset.adapter.eventRules['roc-attack']={limit:3,damage:7,changes:[{target:'hero',attribute:'speed',amount:-2,duration:2,delay:1}]};
  const fight=pending(910,'roc-attack',3),before=structuredClone(fight);
  assert.throws(()=>resolveDestinyAbilityRoll(fight),/Load the book roster/);
  const result=resolveDestinyAbilityRoll(fight,()=>{throw Error('Unexpected dice');},{roster});
  assert.equal(result.hero.health,23);assert.equal(result.effects.at(-1).amount,-2);assert.equal(result.phase,'end');
  assert.equal(result.encounter.eventRules,undefined);assert.deepEqual(fight,before);
});

test('nested curse dice, timing and category locks come from metadata',()=>{
  const roster=structuredClone(WINTER_ENCOUNTERS),rule=roster.find(row=>row.section==='101').adapter.eventRules['sable-attack'];
  Object.assign(rule,{curseMinimum:4,blockDelay:2,blockDuration:3,blockedCategories:['mo']});rule.curse.dice=4;
  const fight=pending(101,'sable-attack',4);let calls=0;
  const result=resolveDestinyAbilityRoll(fight,()=>{calls++;return 1;},{roster});
  assert.equal(calls,4);assert.deepEqual(result.turn.pendingAbility.dice,[1,1,1,1]);
  assert.deepEqual(result.encounter.blockedRounds,{from:3,until:5,categories:['mo']});
});

test('prison successes, release healing and score reward follow loaded values',()=>{
  const roster=structuredClone(WINTER_ENCOUNTERS),rule=roster.find(row=>row.section==='292').adapter.eventRules['ice-prison'];
  Object.assign(rule,{face:5,requiredSuccesses:2,healing:9,scoreBonus:4});
  const fight=pending(292,'ice-prison',5);fight.encounter.prisonSixes=1;
  const result=resolveDestinyAbilityRoll(fight,()=>1,{roster});
  assert.equal(result.encounter.skollFreed,true);assert.equal(result.encounter.prisonSixes,2);
  assert.equal(result.turn.encounterEndHealing,9);assert.equal(result.encounter.heroScoreBonus,4);
});

test('transport wear is loaded while armour-plating still uses the surviving toughness',()=>{
  const roster=structuredClone(WINTER_ENCOUNTERS);roster.find(row=>row.section==='48').adapter.eventRules['transport-damage'].wear={stability:3,toughness:4};
  const fight=pending(48,'transport-damage',1);fight.equipment={transport:{stability:5,toughness:7}};
  fight.effects=[{kind:'stat',target:'hero',attribute:'armour',amount:3,from:0,until:99,source:'armour-plating'}];
  const result=resolveDestinyAbilityRoll(fight,()=>1,{roster});
  assert.deepEqual(result.equipment.transport,{stability:2,toughness:3});assert.equal(result.effects[0].amount,1);
});
