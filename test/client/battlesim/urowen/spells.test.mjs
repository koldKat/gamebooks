import test from 'node:test';
import assert from 'node:assert/strict';
import {createUrowenCharacter} from '../../../../public/js/battlesim/engines/urowen/core.js';
import * as spells from '../../../../public/js/battlesim/engines/urowen/spells.js';
const rolls=values=>{let index=0;return()=>{assert.ok(index<values.length);return values[index++];};};
const ready={known:true,wonMagicAttack:true};
const foe=()=>({life:30,armorByLocation:[2,2,2,2,2,2]});
test('Fireball spends two PP, uses damage location and respects armor',()=>{
  const p=createUrowenCharacter({career:'sorcerer'}),enemy=foe();
  const result=spells.castUrowenSpell(p,enemy,'fireball',rolls([6,1]),ready);
  assert.equal(result.player.power,1);assert.equal(result.damage,9);assert.equal(result.enemy.life,21);
  assert.equal(p.power,3);assert.equal(enemy.life,30);assert.deepEqual(result.rolls,[6,1]);
});
test('Life suction costs two PP and uses literal two dice with no location or armor',()=>{
  const p=createUrowenCharacter({career:'sorcerer'});p.life=2;
  const enemy=foe();enemy.armorByLocation=[99,99,99,99,99,99];
  const result=spells.castUrowenSpell(p,enemy,'lifeSuction',rolls([1,1]),ready);
  assert.equal(result.damage,2);assert.equal(result.healed,2);assert.equal(result.player.life,4);
  assert.equal(result.player.power,1);assert.equal(result.enemy.life,28);assert.deepEqual(result.rolls,[1,1]);
});
test('Life suction never heals beyond base life',()=>{
  const p=createUrowenCharacter({career:'sorcerer'});p.life=19;
  const result=spells.castUrowenSpell(p,foe(),'lifeSuction',rolls([6,6]),ready);
  assert.equal(result.damage,12);assert.equal(result.healed,1);assert.equal(result.player.life,20);
});
test('Poppy costs three PP and creates printed attack and damage penalties',()=>{
  const p=createUrowenCharacter({career:'sorcerer'});
  const result=spells.castUrowenSpell(p,foe(),'poppy',rolls([]),ready);
  assert.equal(result.player.power,0);assert.equal(result.damage,0);
  assert.deepEqual(result.enemy.poppy,{damagePenalty:3,attackPenalty:1});
});
test('spells require knowledge, a won MAGIC attack and current sufficient power',()=>{
  const p=createUrowenCharacter({career:'sorcerer'}),enemy=foe();
  for(const options of [{},{known:true},{wonMagicAttack:true}]) {
    assert.throws(()=>spells.castUrowenSpell(p,enemy,'fireball',rolls([]),options),RangeError);
  }
  assert.throws(()=>spells.castUrowenSpell({...p,power:1},enemy,'fireball',rolls([]),ready),RangeError);
  assert.throws(()=>spells.castUrowenSpell(p,enemy,'unknown',rolls([]),ready),RangeError);
  assert.equal(p.power,3);assert.equal(enemy.life,30);
});
test('Lethal mirror is once per fight and does not cancel incoming damage or cost PP',()=>{
  const fight={player:{life:9,power:3},enemy:{life:20}};
  const next=spells.useUrowenLethalMirror(fight,6,{known:true});
  assert.equal(next.enemy.life,17);assert.deepEqual(next.player,{life:9,power:3});
  assert.equal(fight.enemy.life,20);
  assert.throws(()=>spells.useUrowenLethalMirror(next,6,{known:true}),RangeError);
  assert.throws(()=>spells.useUrowenLethalMirror(fight,5,{known:true}),RangeError);
});
test('Fire edge is once per fight and adds three before armor without replacing warrior bonus',()=>{
  const fight={player:{life:20},enemy:{life:30}};
  const result=spells.useUrowenFireEdge(fight,6,{known:true});
  assert.equal(result.extraDamage,3);assert.equal(result.fight.fireEdgeUsed,true);
  assert.equal(fight.fireEdgeUsed,undefined);
  assert.throws(()=>spells.useUrowenFireEdge(result.fight,6,{known:true}),RangeError);
});
test('enchanted net hits only five or six, is retained on miss and consumed on hit',()=>{
  for(let raw=1;raw<=6;raw++) {
    const result=spells.throwUrowenNet(rolls([raw]),{owned:true});
    assert.equal(result.hit,raw>=5);assert.equal(result.consumed,raw>=5);
    assert.equal(result.enemyAttackPenalty,raw>=5?2:0);assert.equal(result.enemyOngoing,raw>=5?1:0);
  }
  assert.throws(()=>spells.throwUrowenNet(rolls([])),RangeError);
});
