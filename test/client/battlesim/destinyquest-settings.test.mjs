import test from 'node:test';
import assert from 'node:assert/strict';
import {WINTER_ENCOUNTERS} from './destinyquest-fixtures.mjs';
import {createDestinyFight} from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {configureWinterEncounter, useWinterAction, winterChallenge} from '../../../public/js/battlesim/engines/destinyquest/winters-fury.js';

const setup = count => createDestinyFight({speed:4,brawn:5,armour:2,health:30},
  Array.from({length:count},(_,i)=>({name:'Custom '+i,speed:3,brawn:4,armour:1,health:40})));

test('renamed encounter settings and group templates come from the supplied metadata',()=>{
  const roster=structuredClone(WINTER_ENCOUNTERS),preset=roster.find(row=>row.section==='292');
  preset.section='901';preset.adapter.rules.deathDamageByTarget.value=9;
  preset.adapter.variations=[];
  const before=structuredClone(roster),fight=setup(5),original=structuredClone(fight);
  const result=configureWinterEncounter(fight,901,{roster});
  assert.deepEqual(result.encounter.deathDamageByTarget,{'1':9,'2':9,'3':9,'4':9});
  assert.equal(result.encounter.endEffects.length,4);
  assert.deepEqual(result.encounter.endEffects[3],{target:'hero',amount:1,requiresAlive:[4]});
  assert.equal(result.encounter.sourceSection,'901');
  assert.deepEqual(roster,before);assert.deepEqual(fight,original);
});

test('metadata conditions support abilities, equipment and explicit choices without sharing mutable rules',()=>{
  const roster=structuredClone(WINTER_ENCOUNTERS),preset=roster.find(row=>row.section==='154');
  const conditional=preset.adapter.variations.find(row=>row.when.ability);
  conditional.set.scoreReductionByTarget={'0':8};
  const fight=setup(1);fight.abilities={insulated:1};fight.equipment={leftHand:{id:'fimbulwinter'}};
  const equipped=configureWinterEncounter(fight,154,{roster});
  assert.deepEqual(equipped.encounter.scoreReductionByTarget,{'0':8});
  assert.deepEqual(equipped.encounter.endTests[0].faces,[1]);
  delete fight.equipment.leftHand;
  const chosen=configureWinterEncounter(fight,154,{roster,fimbulwinter:true});
  assert.deepEqual(chosen.encounter.endTests[0].faces,[1]);
  chosen.encounter.endTests[0].faces.push(6);
  assert.deepEqual(configureWinterEncounter(fight,154,{roster}).encounter.endTests[0].faces,[5,6]);
});

test('pair templates exclude only the defeated combatant for every current group size',()=>{
  const result=configureWinterEncounter(setup(4),311,{roster:WINTER_ENCOUNTERS});
  assert.equal(result.encounter.onDeathStatChanges.length,12);
  assert(result.encounter.onDeathStatChanges.every(row=>row.dead!==row.target));
  assert.deepEqual(result.encounter.onDeathStatChanges.at(-1),{dead:3,target:2,changes:{magic:-1,armour:-1}});
});

test('missing or unfinished settings never fall back to inline NPC rules',()=>{
  const fight=setup(1),roster=structuredClone(WINTER_ENCOUNTERS);
  assert.throws(()=>configureWinterEncounter(fight,30),/Load the book roster/);
  delete roster.find(row=>row.section==='30').adapter;
  assert.throws(()=>configureWinterEncounter(fight,30,{roster}),/complete rules adapter/);
  roster.find(row=>row.section==='372').adapter.implemented=false;
  assert.throws(()=>configureWinterEncounter(fight,372,{roster}),/complete rules adapter/);
  roster.find(row=>row.section==='30').adapter={schemaVersion:1,implemented:true,rules:{bad:{$op:'execute'}}};
  assert.throws(()=>configureWinterEncounter(fight,30,{roster}),/Unknown encounter/);
});


test('special action eligibility and armour reduction follow renamed database metadata',()=>{
  const roster=structuredClone(WINTER_ENCOUNTERS),preset=roster.find(row=>row.section==='49');
  preset.section='902';preset.adapter.actions['smash-ice'].armourLoss=7;
  const fight=configureWinterEncounter(setup(1),902,{roster});fight.opponents[0].armour=20;fight.phase='damage';fight.turn={winner:'hero'};
  const result=useWinterAction(fight,'smash-ice',{roster});
  assert.equal(result.effects.at(-1).amount,-7);assert.equal(result.encounter.smashedIce,true);assert.equal(result.phase,'end');
  assert.throws(()=>useWinterAction(fight,'snuff-candles',{roster}),/Unknown encounter action/);
  assert.equal(fight.encounter.smashedIce,undefined);
});

test('consumable action caps and per-item damage come from metadata',()=>{
  const roster=structuredClone(WINTER_ENCOUNTERS),spec=roster.find(row=>row.section==='141').adapter.actions['tar-barrels'];
  spec.perRoundLimit=2;spec.damagePerItem=3;
  const fight=configureWinterEncounter(setup(3),141,{roster});fight.character={tarBarrels:5};fight.phase='end';fight.turn={tarBarrelsUsed:0};
  assert.throws(()=>useWinterAction(fight,'tar-barrels',{roster,count:3}),/up to 2/);
  const result=useWinterAction(fight,'tar-barrels',{roster,count:2});
  assert.deepEqual(result.opponents.map(row=>row.health),[34,34,34]);assert.equal(result.character.tarBarrels,3);assert.equal(result.turn.tarBarrelsUsed,2);
});

test('climbing challenge IDs, thresholds and conditional bonuses come from metadata',()=>{
  const roster=structuredClone(WINTER_ENCOUNTERS),challenges=roster.find(row=>row.section==='30').challenges;
  challenges['903']=structuredClone(challenges['35']);challenges['903'].rules.threshold=99;
  const fight=setup(1);fight.abilities={'ice-hooks':1};
  assert.deepEqual(winterChallenge(fight,903,{roster,leif:true}),{turns:5,threshold:99,rollBonus:2,name:'Nutcracker',dice:2,attribute:'speed',failureLimit:3,successSection:'597',failureSection:'159'});
  assert.throws(()=>winterChallenge(fight,904,{roster}),/Unknown climbing challenge/);
});
