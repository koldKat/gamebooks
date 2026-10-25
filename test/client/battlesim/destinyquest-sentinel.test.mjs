import test from 'node:test';
import assert from 'node:assert/strict';
import {createWinterFight, resolveDestinyAbilityRoll as resolve} from './destinyquest-fixtures.mjs';
import {rollDestinySequenceTest, startDestinyRound, rollDestinySpeed, resolveDestinySpeed,
  rollDestinyDamage, resolveDestinyDamage, endDestinyRound, skipDestinyDeathMove} from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {destinyStat, destinyStrike} from '../../../public/js/battlesim/engines/destinyquest/effects.js';

const rolls=(...values)=>()=>{assert.ok(values.length,'Unexpected dice');return values.shift();};
const make=(extra={},options={})=>createWinterFight({speed:20,brawn:4,armour:3,health:100,maxHealth:100,...extra},85,options);
const ascend=fight=>{for(let i=0;i<3;i++)fight=resolve(rollDestinySequenceTest(fight,rolls(1,1)),rolls());return fight;};
const selected=(fight,face,...effectDice)=>{
  fight=resolve(rollDestinySequenceTest(fight,rolls(1,1)),rolls(face));
  assert.equal(fight.turn.pendingAbility.event.kind,'actor-strike');
  return resolve(fight,rolls(...effectDice));
};
const lose=(fight,target)=>resolveDestinySpeed(rollDestinySpeed(startDestinyRound(fight,target),rolls(1,1,6,6)));

test('three saved challenges precede combat and never count as combat rounds',()=>{
  let fight=make();assert.equal(fight.phase,'encounter-start');assert.throws(()=>startDestinyRound(fight,1),/stage/);
  for(let i=0;i<3;i++){
    const original=structuredClone(fight),pending=rollDestinySequenceTest(fight,rolls(1,1));assert.deepEqual(fight,original);
    fight=resolve(JSON.parse(JSON.stringify(pending)),rolls());
    assert.equal(fight.encounter.sequenceRemaining,2-i);assert.equal(fight.round,0);
    assert.equal(fight.phase,i===2?'start':'encounter-start');
  }
  assert.equal(startDestinyRound(fight,1).round,1);assert.throws(()=>rollDestinySequenceTest(fight),/stage/);
});

test('failed challenges count toward the summit and dead proboscises consume no effect dice',()=>{
  let fight=make({speed:0});fight.opponents[3].health=0;
  for(let i=0;i<3;i++){
    fight=resolve(rollDestinySequenceTest(fight,rolls(1,1)),rolls(1));
    fight=resolve(fight,rolls());assert.equal(fight.hero.health,100);
  }
  assert.equal(fight.phase,'start');assert.equal(fight.encounter.sequenceRemaining,0);
});

test('oil damages through armour and slows only the next challenge',()=>{
  let fight=make({speed:17,armour:99});fight=resolve(selected(fight,1,3),rolls());
  assert.equal(fight.hero.health,97);assert.equal(fight.encounter.oilHitStep,1);
  let pending=rollDestinySequenceTest(fight,rolls(1,4));assert.equal(pending.turn.pendingAbility.event.attributeModifier,-2);
  fight=resolve(pending,rolls());assert.equal(fight.phase,'encounter-start');
  pending=rollDestinySequenceTest(fight,rolls(1,2));assert.equal(pending.turn.pendingAbility.event.attributeModifier,0);
  fight=resolve(pending,rolls());assert.equal(fight.phase,'start');assert.equal(destinyStat(fight,'hero','speed'),17);
});

test('fire immediately after oil rolls two damage dice, with both retained on reload',()=>{
  let fight=make({speed:0});fight=resolve(selected(fight,2,3),rolls());
  fight=selected(fight,3,1,2);assert.deepEqual(fight.turn.pendingAbility.dice,[1,2]);
  fight=resolve(JSON.parse(JSON.stringify(fight)),rolls());assert.equal(fight.hero.health,94);
  fight=selected(fight,4,6);assert.deepEqual(fight.turn.pendingAbility.dice,[6]);
  fight=resolve(fight,rolls());assert.equal(fight.hero.health,88);assert.equal(fight.phase,'start');
});

test('a successful challenge expires the previous oil ignition opportunity',()=>{
  let fight=make({speed:17});fight=resolve(selected(fight,1,1),rolls());
  fight=resolve(rollDestinySequenceTest(fight,rolls(1,4)),rolls());
  fight=selected(fight,3,6);assert.deepEqual(fight.turn.pendingAbility.dice,[6]);
});

test('acid reduces armour to zero before subsequent acid rolls health damage',()=>{
  let fight=make({speed:0,armour:3});
  fight=selected(fight,5);assert.deepEqual(fight.turn.pendingAbility.dice,[]);
  fight=resolve(fight,rolls());assert.equal(destinyStat(fight,'hero','armour'),1);assert.equal(fight.hero.health,100);
  fight=resolve(selected(fight,6),rolls());assert.equal(destinyStat(fight,'hero','armour'),0);assert.equal(fight.hero.health,100);
  fight=selected(fight,5);fight=resolve(fight,rolls(4));assert.deepEqual(fight.turn.pendingAbility.dice,[4]);
  fight=resolve(fight,rolls());assert.equal(fight.hero.health,96);assert.equal(fight.phase,'start');
});

test('lightning answers the actual proboscis rather than the protected eye',()=>{
  let fight=make({speed:0},{abilities:{lightning:1}});fight=resolve(selected(fight,1,2),rolls());
  assert.equal(fight.opponents[3].health,28);assert.equal(fight.opponents[0].health,40);
});

test('fatal ascent damage cannot heal or resume the fight',()=>{
  let fight=make({speed:0,health:2});fight=resolve(selected(fight,1,6),rolls());
  assert.equal(fight.status,'loss');assert.equal(fight.hero.health,0);assert.throws(()=>rollDestinySequenceTest(fight),/stage/);
});

test('regular proboscis health damage queues its additional oil effect',()=>{
  let fight=lose(ascend(make()),3);fight=resolveDestinyDamage(rollDestinyDamage(fight,rolls(1)),rolls(4));
  assert.equal(fight.hero.health,97);assert.deepEqual(fight.turn.pendingAbility.dice,[4]);
  fight=resolve(fight,rolls());assert.equal(fight.hero.health,93);assert.equal(fight.encounter.nextStepStats[0].amount,-2);
});

test('regular acid effects need no extra die while armour remains',()=>{
  let fight=lose(ascend(make()),2);fight=resolveDestinyDamage(rollDestinyDamage(fight,rolls(1)),rolls());
  assert.deepEqual(fight.turn.pendingAbility.dice,[]);fight=resolve(fight,rolls());
  assert.equal(fight.hero.health,97);assert.equal(destinyStat(fight,'hero','armour'),1);
});

test('oil in one combat round boosts the next fire hit and slows only that round',()=>{
  let fight=lose(ascend(make({armour:0})),3);
  fight=resolve(resolveDestinyDamage(rollDestinyDamage(fight,rolls(1)),rolls(1)),rolls());
  fight=endDestinyRound(fight,[],rolls(6));fight=resolve(fight,rolls());fight=endDestinyRound(fight,[],rolls());
  fight=startDestinyRound(fight,4);assert.equal(destinyStat(fight,'hero','speed'),18);
  fight=resolveDestinySpeed(rollDestinySpeed(fight,rolls(1,1,6,6)));
  fight=resolveDestinyDamage(rollDestinyDamage(fight,rolls(1)),rolls(2,3));
  assert.deepEqual(fight.turn.pendingAbility.dice,[2,3]);fight=resolve(fight,rolls());assert.equal(fight.hero.health,82);
  fight=endDestinyRound(fight,[],rolls(6));fight=resolve(fight,rolls());fight=endDestinyRound(fight,[],rolls());
  fight=startDestinyRound(fight,2);assert.equal(destinyStat(fight,'hero','speed'),20);
});

test('a stale active flag on a dead character cannot roll another ascent test',()=>{
  const fight=make();fight.hero.health=0;const before=structuredClone(fight);
  assert.throws(()=>rollDestinySequenceTest(fight,rolls()),/active encounter challenge/);assert.deepEqual(fight,before);
});

test('wing buffet restarts the complete ascent while preserving wounds and round count',()=>{
  let fight=lose(ascend(make()),3);fight=resolveDestinyDamage(rollDestinyDamage(fight,rolls(1)),rolls(1));fight=resolve(fight,rolls());
  fight=endDestinyRound(fight,[],rolls(3));assert.equal(fight.turn.pendingAbility.event.kind,'restart-sequence');
  fight=resolve(JSON.parse(JSON.stringify(fight)),rolls());fight=endDestinyRound(fight,[],rolls());
  assert.equal(fight.phase,'encounter-start');assert.equal(fight.encounter.sequenceRemaining,3);assert.equal(fight.round,1);assert.equal(fight.hero.health,96);
  const pending=rollDestinySequenceTest(fight,rolls(1,1));assert.equal(pending.turn.pendingAbility.event.attributeModifier,-2);
});

test('wing buffet is absent when the wings or all proboscises are defeated',()=>{
  for(const dead of [[1],[2,3,4]]){
    let fight=ascend(make());for(const target of dead)fight.opponents[target].health=0;
    const target=dead.includes(1)?2:1;fight=startDestinyRound(fight,target);fight.phase='end';
    fight=endDestinyRound(fight,[],rolls());assert.equal(fight.phase,'start');assert.equal(fight.encounter.sequenceRemaining,0);
  }
});

test('the eye cannot be selected or harmed until all four protectors fall',()=>{
  const fight=ascend(make());assert.throws(()=>startDestinyRound(fight,0),/guards/);
  destinyStrike(fight,0,999,'test','passive');assert.equal(fight.opponents[0].health,40);
  for(const target of [1,2,3])fight.opponents[target].health=0;
  assert.throws(()=>startDestinyRound(fight,0),/guards/);fight.opponents[4].health=0;
  assert.equal(startDestinyRound(fight,0).target,0);
});

test('defeating each component gives no premature victory; defeating the exposed eye wins',()=>{
  let fight=ascend(make({brawn:100}));
  for(const target of [1,2,3,4,0]){
    fight=resolveDestinySpeed(rollDestinySpeed(startDestinyRound(fight,target),rolls(6,6,1,1)));
    fight=resolveDestinyDamage(rollDestinyDamage(fight,rolls(1)));
    if(target===0){assert.equal(fight.status,'win');break;}
    assert.equal(fight.status,'active');if(fight.phase==='death-move')fight=skipDestinyDeathMove(fight);
    fight=endDestinyRound(fight,[],rolls());
  }
});

test('a one-round oil penalty expires before a later ascent',()=>{
  let fight=make({speed:17,brawn:0,magic:0});
  for(let i=0;i<2;i++)fight=resolve(rollDestinySequenceTest(fight,rolls(2,2)),rolls());
  fight=resolve(selected(fight,1,1),rolls());assert.equal(fight.phase,'start');
  fight=startDestinyRound(fight,1);assert.equal(destinyStat(fight,'hero','speed'),15);fight.phase='end';
  fight=endDestinyRound(fight,[],rolls(1));fight=resolve(fight,rolls());fight=endDestinyRound(fight,[],rolls());
  assert.equal(fight.phase,'encounter-start');assert.equal(destinyStat(fight,'hero','speed'),17);
});
