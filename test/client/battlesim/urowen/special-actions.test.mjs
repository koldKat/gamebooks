import test from 'node:test';
import assert from 'node:assert/strict';
import {createUrowenCharacter} from '../../../../public/js/battlesim/engines/urowen/core.js';
import * as actions from '../../../../public/js/battlesim/engines/urowen/forms.js';
const rolls=values=>{let index=0;return()=>{assert.ok(index<values.length);return values[index++];};};

for(const [stage,attribute,perception,life,power] of [[1,2,3,5,2],[2,3,4,8,3],[3,4,5,10,4],[4,5,6,40,5]]) {
  test('printed curse stage '+stage+' preserves original character',()=>{
    const p=createUrowenCharacter({race:'dwarf',career:'warrior'});
    p.life=13;p.attributes.STR=6;p.power=2;
    const original=structuredClone(p),form=actions.createUrowenTransformation(p,stage);
    for(const key of ['STR','SK','MAG'])assert.equal(form.player.attributes[key],p.attributes[key]+attribute);
    assert.equal(form.player.attributes.PER,p.attributes.PER+perception);
    assert.equal(form.player.life,13+life);assert.equal(form.player.maxLife,20+life);
    assert.equal(form.player.power,2+power);
    assert.deepEqual(p,original);
    form.player.life=-5;form.player.attributes.STR=0;
    assert.deepEqual(actions.restoreUrowenTransformation(form),original);
  });
}
test('possession uses printed stats without inheriting career or equipment',()=>{
  const p=createUrowenCharacter({career:'sorcerer'});p.armor=[2,4,4,4,2,3];
  const form=actions.createUrowenPossession(p);
  assert.equal(form.player.career,null);assert.equal(form.player.life,30);assert.equal(form.player.maxLife,30);
  assert.deepEqual(form.player.attributes,{STR:3,SK:0,MAG:0,PER:0});assert.equal(form.player.power,0);
  assert.deepEqual(form.player.armor,[0,0,0,0,0,0]);assert.equal(form.player.weapon.bonus,2);
  assert.deepEqual(actions.restoreUrowenTransformation(form),p);
});
test('possessed axe amputations use the raw damage die and correct locations',()=>{
  for(let rawDamage=1;rawDamage<=6;rawDamage++)for(let location=1;location<=6;location++) {
    assert.deepEqual(actions.urowenPossessionHit({rawDamage,location}),{
      instantKill:rawDamage===6&&[2,3,4,6].includes(location),
      bleeding:rawDamage===6&&[1,5].includes(location)?5:0,
    });
  }
});
test('hardcore mission and every printed life checkpoint',()=>{
  const p=createUrowenCharacter();p.life=4;
  const mission=actions.createUrowenMission(p,{weaponAttribute:'MAG'});
  assert.equal(mission.player.life,100);assert.equal(mission.player.maxLife,100);
  assert.equal(mission.player.weapon.bonus,6);assert.equal(mission.player.weapon.attribute,'MAG');
  assert.deepEqual(mission.player.weapon.reroll,[1]);
  for(const [section,amount] of [[394,50],[386,40],[376,30],[361,40],[349,50]]) {
    mission.player.life=10;
    assert.equal(actions.recoverUrowenMissionLife(mission,section).player.life,10+amount);
    mission.player.life=99;
    assert.equal(actions.recoverUrowenMissionLife(mission,section).player.life,100);
  }
  assert.equal(p.life,4);assert.deepEqual(actions.restoreUrowenTransformation(mission),p);
  assert.throws(()=>actions.recoverUrowenMissionLife(mission,123),RangeError);
});
test('all four appendage encounters preserve separate target health',()=>{
  for(const [count,life] of [[2,7],[3,7],[3,9],[3,10]]) {
    const appendages=actions.createUrowenAppendages(count,life);
    assert.equal(actions.urowenAppendageDamage(appendages),count);
    const hit=actions.hitUrowenAppendage(appendages,0,life);
    assert.equal(hit[0].life,0);assert.equal(appendages[0].life,life);
    assert.equal(actions.urowenAppendageDamage(hit),count-1);
    assert.ok(hit.slice(1).every(a=>a.life===life));
    assert.throws(()=>actions.hitUrowenAppendage(hit,0,1),RangeError);
  }
});
test('sistelium support damage ignores the current target and ends with two survivors',()=>{
  assert.deepEqual([0,1,2,3,4,5].map(actions.urowenSisteliumDamage),[0,0,0,1,1,2]);
});
test('Ardronte second head stops exactly at 18 life',()=>{
  assert.equal(actions.urowenArdronteSupportDamage(19),1);
  assert.equal(actions.urowenArdronteSupportDamage(18),0);
  assert.equal(actions.urowenArdronteSupportDamage(0),0);
});
test('mount charge uses four dice, enemy charge two, neither location nor armor',()=>{
  assert.deepEqual(actions.resolveUrowenCharge(rolls([4,1,1,2,3,4])),
    {hit:true,dodged:false,damage:13,rolls:[4,1,1,2,3,4]});
  assert.deepEqual(actions.resolveUrowenCharge(rolls([5,1,2,3]),{enemy:true}),
    {hit:true,dodged:false,damage:8,rolls:[5,1,2,3]});
  assert.equal(actions.resolveUrowenCharge(rolls([3])).hit,false);
  assert.equal(actions.resolveUrowenCharge(rolls([4]),{enemy:true}).hit,false);
  assert.equal(actions.resolveUrowenCharge(rolls([6,6])).dodged,true);
});
test('Cashdor location increase cannot exceed the head',()=>{
  for(let raw=1;raw<=6;raw++)assert.equal(actions.urowenEnemyLocation(rolls([raw]),{increase:1}).location,Math.min(6,raw+1));
});
test('two scimitars choose one highest location, not two hits',()=>{
  for(let a=1;a<=6;a++)for(let b=1;b<=6;b++) {
    const result=actions.urowenEnemyLocation(rolls([a,b]),{highestOfTwo:true});
    assert.equal(result.location,Math.max(a,b));assert.equal(result.rolls.length,2);
  }
});
test('grip damages only chest armor, permanently but never below zero',()=>{
  const armor=[2,1,1,1,2,3],copy=actions.damageUrowenChestArmor(armor);
  assert.deepEqual(copy,[2,0,0,0,2,3]);assert.deepEqual(armor,[2,1,1,1,2,3]);
  assert.deepEqual(actions.damageUrowenChestArmor(copy),copy);
});
test('companion attacks once, only while player remains alive below six life',()=>{
  for(let life=-1;life<=7;life++)for(const used of [false,true]) {
    assert.equal(actions.canUrowenCompanionAttack({life,used}),!used&&life>0&&life<6);
  }
  const result=actions.resolveUrowenCompanionHit(rolls([6,6]),[0,0,0,0,0,2]);
  assert.deepEqual(result,{location:6,rawDamage:6,damage:11});
});
test('invisibility spends four power, begins only below threshold and cannot overlap',()=>{
  const foe={life:7,power:4};
  const next=actions.startUrowenInvisibility(foe,{belowLife:8});
  assert.equal(next.power,0);assert.equal(next.invisibilityAttacks,2);assert.equal(foe.power,4);
  assert.throws(()=>actions.startUrowenInvisibility({life:8,power:4},{belowLife:8}),RangeError);
  assert.throws(()=>actions.startUrowenInvisibility(next,{belowLife:8}),RangeError);
  assert.throws(()=>actions.startUrowenInvisibility({life:9,power:3},{belowLife:10}),RangeError);
});
