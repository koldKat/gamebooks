import test from 'node:test';
import assert from 'node:assert/strict';
import {panelProfile,encounterCount,configuredOptions} from '../../../public/js/battlesim/engines/horror-classic/setup.js';

test('source group rolls require explicit totals and preserve legacy divisors',()=>{
  const group={count:{dice:2,divisor:2}};
  assert.throws(()=>encounterCount(group,{countScore:''}));
  assert.equal(encounterCount(group,{countScore:7}),4);
  assert.equal(encounterCount({count:{fixed:3}},{}),3);
  assert.equal(encounterCount(null,{opponents:[{},{}]}),2);
});

test('companion reductions can leave no encounter without fabricating a combatant',()=>{
  const group={count:{dice:1},preCombatReduction:{kind:'die',dice:1}};
  assert.throws(()=>encounterCount(group,{countScore:3,useCompanionReduction:true,reductionScore:''}));
  assert.equal(encounterCount(group,{countScore:3,useCompanionReduction:true,reductionScore:6}),0);
  assert.equal(encounterCount(group,{countScore:6,useCompanionReduction:true,reductionScore:2}),4);
  group.preCombatReduction={kind:'half',onlyAbove:1};
  assert.equal(encounterCount(group,{countScore:5,useCompanionReduction:true}),3);
  assert.equal(encounterCount(group,{countScore:1,useCompanionReduction:true}),1);
});

test('database profiles configure new panels without changing legacy defaults or source templates',()=>{
  const legacy=panelProfile();assert.deepEqual(legacy.roles,['harker','dracula']);assert.ok(legacy.weapons.includes('dagger'));
  const createdAlly={name:'Synthetic ally',lifePoints:17};
  const profile=panelProfile({combatRole:['doctor'],weapons:['none'],items:['triple-dose'],
    combatOptions:[{key:'luckBonus',type:'select'},{key:'coldImmune',type:'checkbox'}],createdAlly});
  const options=configuredOptions({weapon:'none',luckBonus:2,coldImmune:true,openingDamageApplied:true},profile);
  assert.equal(options.luckBonus,2);assert.equal(options.coldImmune,true);assert.equal(options.openingDamageApplied,true);
  assert.equal(options.garlicOil,undefined);options.createdAlly.lifePoints=4;
  assert.equal(createdAlly.lifePoints,17);
});
