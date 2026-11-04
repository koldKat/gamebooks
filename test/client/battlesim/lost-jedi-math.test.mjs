import test from 'node:test';
import assert from 'node:assert/strict';
import {integer, rollDie, weaponAttack, previewStrike} from '../../../public/js/battlesim/engines/lost-jedi/math.js';

test('printed example: a point turns Havet’s miss into a hit and an enemy hit into a miss', () => {
  const own = {die:3, skill:3, target:7};
  assert.equal(previewStrike(own,0,5).hit,false);
  assert.deepEqual(previewStrike(own,1,5),{die:3,adjustment:1,cost:1,total:7,target:7,hit:true,remainingPoints:4});
  assert.equal(previewStrike({die:6,skill:1,target:7},-1,4).hit,false);
});

test('lightsabre bonus and rifle armour benefit preserve distinct printed thresholds', () => {
  const options = {range:'close',blaster:3,lightsabre:3,technical:4,target:7};
  const sabre = weaponAttack({...options,weapon:'lightsabre'});
  assert.equal(previewStrike({...sabre,die:3},0,0).hit,true);
  assert.equal(weaponAttack({...options,weapon:'rifle'}).target,7);
  assert.equal(weaponAttack({...options,target:9,weapon:'rifle'}).target,8);
  assert.equal(weaponAttack({...options,target:11,weapon:'redemptor'}).target,6);
  assert.equal(weaponAttack({...options,weapon:'speeder'}).skill,4);
});

test('unarmed and lightsabre attacks require Up Close; a blaster can be used there', () => {
  for (const weapon of ['unarmed','lightsabre']) assert.throws(()=>weaponAttack({weapon,range:'range',target:7}));
  assert.equal(weaponAttack({weapon:'unarmed',range:'close',target:7}).skill,1);
  assert.equal(weaponAttack({weapon:'blaster',range:'close',target:7,blaster:2}).skill,2);
});

test('Jedi Points can influence either side without clamping adjusted rolls to six', () => {
  assert.equal(previewStrike({die:6,skill:1,target:10},3,3).hit,true);
  assert.equal(previewStrike({die:1,skill:6,target:7},-2,2).total,5);
  assert.throws(()=>previewStrike({die:3,skill:3,target:7},2,1));
  const pending = {die:3,skill:3,target:7};
  previewStrike(pending,1,5);
  assert.deepEqual(pending,{die:3,skill:3,target:7},'previewing spends nothing and preserves the pending strike');
});

test('reject missing and fractional setup values and invalid dice', () => {
  for (const value of ['',null,undefined,true,1.5,NaN]) assert.throws(()=>integer(value,0,6));
  assert.equal(integer('3',0,6),3);
  assert.equal(rollDie(()=>0),1);
  assert.equal(rollDie(()=>0.999),6);
  for (const value of [-0.1,1,NaN]) assert.throws(()=>rollDie(()=>value));
  assert.throws(()=>previewStrike({die:7,skill:3,target:7},0,0));
});
