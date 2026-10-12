import test from 'node:test';
import assert from 'node:assert/strict';
import {createUrowenCharacter} from '../../../../public/js/battlesim/engines/urowen/core.js';
import * as effects from '../../../../public/js/battlesim/engines/urowen/enemy-effects.js';
const rolls=values=>{let index=0;return()=>{assert.ok(index<values.length);return values[index++];};};
const player=()=>createUrowenCharacter();
const enemy={attributeValue:4,life:30,maxLife:30,damageBonus:3};
test('dwarf rage and below-seven rerolls use strict printed thresholds',()=>{
  const rage={rage:{belowLife:10,attributeValue:5}};
  assert.equal(effects.urowenEnemyAttribute({...enemy,life:10},rage),4);
  assert.equal(effects.urowenEnemyAttribute({...enemy,life:9},rage),5);
  const policy={rerollAllBelowLife:{belowLife:7,values:[1,2]}};
  assert.deepEqual(effects.urowenEnemyRerolls({...enemy,life:7},policy,'damage'),[]);
  assert.deepEqual(effects.urowenEnemyRerolls({...enemy,life:6},policy,'damage'),[1,2]);
});
test('attack-only rerolls do not alter damage or location dice',()=>{
  const policy={rerollAttackOnly:[1]};
  assert.deepEqual(effects.urowenEnemyRerolls(enemy,policy,'attack'),[1]);
  assert.deepEqual(effects.urowenEnemyRerolls(enemy,policy,'location'),[]);
  assert.deepEqual(effects.urowenEnemyRerolls(enemy,policy,'damage'),[]);
});
test('raw six healing is capped and leaves its source unchanged',()=>{
  const injured={...enemy,life:29};
  assert.equal(effects.applyUrowenEnemyDie(injured,{anyRaw6Heal:2},6).life,30);
  assert.equal(effects.applyUrowenEnemyDie(injured,{anyRaw6Heal:2},5).life,29);
  assert.equal(injured.life,29);
  assert.throws(()=>effects.applyUrowenEnemyDie({life:1},{anyRaw6Heal:1},6),RangeError);
});
test('won raw attack six causes a next-roll penalty independently of damage',()=>{
  assert.deepEqual(effects.urowenWonEnemyAttackEffects({wonRawAttack6NextPenalty:1},6),[
    {type:'next-player-attack-penalty',amount:1},
  ]);
  assert.deepEqual(effects.urowenWonEnemyAttackEffects({wonRawAttack6NextPenalty:1},5),[]);
});
test('enemy dodge and printed chained-reptile player dodge ranges',()=>{
  for(let raw=1;raw<=6;raw++) {
    assert.equal(effects.resolveUrowenEnemyDodge({dodgeOn:[6]},rolls([raw])).dodged,raw===6);
    const policy={playerDodgeOn:[5,6],minstrelDodgeOn:[4,5,6]};
    assert.equal(effects.resolveUrowenPlayerDodge('warrior',policy,rolls([raw])).dodged,raw>=5);
    assert.equal(effects.resolveUrowenPlayerDodge('minstrel',policy,rolls([raw])).dodged,raw>=4);
  }
});
test('fire shield checks the raw six, not the modified warrior damage',()=>{
  assert.deepEqual(effects.urowenPlayerHitDefense({blockPlayerRawDamage6:true},6),{blocked:true,reflected:0});
  assert.deepEqual(effects.urowenPlayerHitDefense({blockPlayerRawDamage6:true},5),{blocked:false,reflected:0});
  assert.deepEqual(effects.urowenPlayerHitDefense({reflectPlayerRawDamage6:3},6),{blocked:false,reflected:3});
});
test('bite extra damage is included before armor, choking extra after armor',()=>{
  const p=player();p.armor=[20,20,20,20,20,20];
  const bite=effects.resolveUrowenEnemyHit(p,enemy,{rawDamage6Extra:3},{rawDamage:6,location:2});
  assert.equal(bite.damage,0);
  const choking=effects.resolveUrowenEnemyHit(p,enemy,{rawDamage6Extra:2,extraIgnoresArmor:true},{rawDamage:6,location:2});
  assert.equal(choking.damage,2);assert.equal(choking.player.life,18);assert.equal(p.life,20);
});
test('ice attack bypasses even magical player armor and head starts freezing',()=>{
  const p=player();p.armor=[20,20,20,20,20,20];
  const result=effects.resolveUrowenEnemyHit(p,{...enemy,damageBonus:0},
    {ignorePlayerArmor:true,headHitOngoing:1},{rawDamage:1,location:6});
  assert.equal(result.damage,4);assert.deepEqual(result.effects,[{type:'freezing',amount:1}]);
});
test('critical injury and venom keep different source effect types',()=>{
  const p=player();
  const bleeding=effects.resolveUrowenEnemyHit(p,enemy,{rawDamage6Bleed:2},{rawDamage:6,location:2});
  assert.deepEqual(bleeding.effects,[{type:'bleeding',amount:2,explicitlyNonstacking:false}]);
  const poison=effects.resolveUrowenEnemyHit(p,enemy,{rawDamage1Venom:4},{rawDamage:1,location:2});
  assert.deepEqual(poison.effects,[{type:'venom',amount:4}]);
  const nonstacking=effects.resolveUrowenEnemyHit(p,enemy,{rawDamage6Bleed:1,bleedExplicitlyNonstacking:true},{rawDamage:6,location:2});
  assert.equal(nonstacking.effects[0].explicitlyNonstacking,true);
});
test('bonebreaker is explicitly cumulative, ordinary terror is not labelled cumulative',()=>{
  const p=player();
  assert.deepEqual(effects.resolveUrowenEnemyHit(p,enemy,{rawDamage6CumulativeAttackPenalty:1},
    {rawDamage:6,location:2}).effects,[{type:'cumulative-player-attack-penalty',amount:1}]);
  assert.deepEqual(effects.resolveUrowenEnemyHit(p,enemy,{headHitAttackPenalty:1},
    {rawDamage:2,location:6}).effects,[{type:'player-attack-penalty',amount:1}]);
});
test('whip extra die causes both damage and next-attack penalty, once',()=>{
  const p=player(),policy={whip:{rollAtLeast:5,extraDamage:1,nextAttackPenalty:1}};
  const hit=effects.resolveUrowenEnemyHit(p,enemy,policy,{rawDamage:2,location:2},rolls([5]));
  assert.equal(hit.damage,6);assert.deepEqual(hit.rolls,[5]);
  assert.deepEqual(hit.effects,[{type:'next-player-attack-penalty',amount:1}]);
  const miss=effects.resolveUrowenEnemyHit(p,enemy,policy,{rawDamage:2,location:2},rolls([4]));
  assert.equal(miss.damage,5);assert.deepEqual(miss.effects,[]);
});
test('jailer limb grip and deep injury can both activate in one blow',()=>{
  const result=effects.resolveUrowenEnemyHit(player(),enemy,{rawDamage6Bleed:2,
    limbHitNextAttackPenalty:{locations:[1,5],penalty:1}},{rawDamage:6,location:5});
  assert.equal(result.effects.length,2);
  assert.equal(result.effects[0].type,'bleeding');assert.equal(result.effects[1].type,'next-player-attack-penalty');
});
test('chest grip applies after the current hit and leaves other armor unchanged',()=>{
  const p=player();p.armor=[2,4,4,4,2,3];
  const result=effects.resolveUrowenEnemyHit(p,enemy,{rawDamage6PermanentChestArmorLoss:1},{rawDamage:6,location:2});
  assert.equal(result.damage,5);assert.deepEqual(result.player.armor,[2,3,3,3,2,3]);
  assert.deepEqual(p.armor,[2,4,4,4,2,3]);
});
test('snake grip and sentinel neck strike retain explicit death destinations',()=>{
  const p=player();p.life=100;
  assert.equal(effects.resolveUrowenEnemyHit(p,enemy,{rawDamage6InstantDefeat:375},
    {rawDamage:6,location:2}).destination,375);
  assert.equal(effects.resolveUrowenEnemyHit(p,enemy,{rawHead6AndDamage6InstantDefeat:344},
    {rawDamage:6,location:6}).destination,344);
  assert.equal(effects.resolveUrowenEnemyHit(p,enemy,{rawHead6AndDamage6InstantDefeat:344},
    {rawDamage:6,location:5}).destination,null);
});
test('a fleeing pheasant causes no invented damage and goes to its printed escape',()=>{
  for(const rawDamage of [4,5,6]) {
    const p=player(),result=effects.resolveUrowenEnemyHit(p,{...enemy,damageBonus:-4},
      {escapeOnRawDamage:[4,5,6],escapeDestination:162},{rawDamage,location:6});
    assert.equal(result.damage,0);assert.equal(result.escaped,true);assert.equal(result.destination,162);
    assert.deepEqual(result.player,p);
  }
});
