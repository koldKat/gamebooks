import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decodeDestinyRoster} from '../../../public/js/battlesim/engines/destinyquest/winters-fury-roster.js';
import {createHeartFight} from '../../../public/js/battlesim/engines/destinyquest/heart.js';
import {startDestinyRound,rollDestinySpeed,resolveDestinySpeed,rollDestinyDamage,resolveDestinyDamage,endDestinyRound,retargetDestinyRound} from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {destinyStrike,isDestinyOpponentActive,isDestinyOpponentDead,hasDestinyAbility} from '../../../public/js/battlesim/engines/destinyquest/effects.js';
const roster=decodeDestinyRoster(JSON.parse(readFileSync(new URL('../../fixtures/battlesim/heart-roster.json',import.meta.url))).enemies);
const hero={speed:30,brawn:0,magic:0,armour:20,health:60,maxHealth:60};
const rolls=(...values)=>()=>{assert.ok(values.length,'Unexpected die roll');return values.shift();};
const fight=(options={})=>createHeartFight({...hero,...options.hero},632,{...options,roster});
const initiative=(f,win=true)=>resolveDestinySpeed(rollDestinySpeed(f,rolls(...(win?[6,5,1,2]:[1,2,6,5]))),rolls());
const score=f=>resolveDestinyDamage(rollDestinyDamage(f,rolls(1)));

test('carts escape separately at the end of rounds two, four, six and eight without being killed',()=>{
  let f=fight();
  for(let round=1;round<=8;round++){
    const target=Math.ceil(round/2);f=endDestinyRound(score(initiative(startDestinyRound(f,target))));
    assert.equal(f.encounter.escapedTargets?.length||0,Math.floor(round/2));
    assert.equal(f.status,round===8?'win':'active');
    for(const escaped of f.encounter.escapedTargets||[]){
      assert.equal(f.opponents[escaped].health,15);assert.equal(isDestinyOpponentDead(f,escaped),false);
      assert.equal(isDestinyOpponentActive(f,escaped),false);
    }
  }
  assert.equal(f.encounter.outcomeSection,'646');assert.equal(f.encounter.resources.tigrisCartsFreed,0);
  assert.equal(f.defeated?.length||0,0);assert.equal(f.history.filter(e=>e.type==='escape').length,4);
});

test('destroyed carts free captives while escaped carts cannot be attacked or credited',()=>{
  let f=fight({hero:{brawn:100}});f=score(initiative(startDestinyRound(f,2)));
  assert.equal(f.opponents[2].health,0);f=endDestinyRound(f);
  f.hero.brawn=0;f=endDestinyRound(score(initiative(startDestinyRound(f,1))));
  assert.deepEqual(f.encounter.escapedTargets,[1]);assert.throws(()=>startDestinyRound(f,1),/living opponent/);
  f.hero.brawn=100;
  for(const target of [3,4]){
    f=score(initiative(startDestinyRound(JSON.parse(JSON.stringify(f)),target)));
    if(target===3)f=endDestinyRound(f);
  }
  assert.equal(f.status,'win');assert.equal(f.encounter.resources.tigrisCartsFreed,3);
  assert.equal(f.opponents[0].health,null);assert.deepEqual(f.encounter.escapedTargets,[1]);
});

test('all four carts can be destroyed before escaping and winning damage can be retargeted',()=>{
  let f=fight({hero:{brawn:100}});
  for(const target of [1,2,3,4]){
    f=initiative(startDestinyRound(f,target));f=score(retargetDestinyRound(f,target));
    if(target!==4)f=endDestinyRound(f);
  }
  assert.equal(f.status,'win');assert.equal(f.encounter.resources.tigrisCartsFreed,4);
  assert.equal(f.encounter.escapedTargets,undefined);
});

test('carts take damage only after a hero win, retain printed immunities and forbid strike backs',()=>{
  let f=fight({hero:{speed:0},abilities:{confound:1,retaliation:1,sideswipe:1,barbs:1,lightning:1}});
  for(const name of ['confound','retaliation','sideswipe'])assert.equal(hasDestinyAbility(f,name),false);
  f=startDestinyRound(f,1);assert.equal(destinyStrike(f,1,4,'test','dice'),0);
  f=initiative(f,false);assert.equal(f.turn.winner,'opponent');
  assert.equal(destinyStrike(f,1,4,'test','dice'),0);
  f=endDestinyRound(score(f));assert.equal(f.opponents[1].health,15);
  f.hero.speed=30;f=initiative(startDestinyRound(f,2));
  for(const name of ['barbs','bleed','demon-claws','disease','fire-aura','thorns','thorn-cage','venom'])assert.equal(destinyStrike(f,2,2,name,'dice'),0,name);
  assert.equal(destinyStrike(f,2,2,'test','dice'),2,'winning abilities can damage a cart');
});

test('defenders can defeat the hero without reporting rescued captives',()=>{
  let f=fight({hero:{speed:0,armour:0,health:1}});f=score(initiative(startDestinyRound(f,1),false));
  assert.equal(f.status,'loss');assert.equal(f.encounter.outcomeSection,'656');
  assert.equal(f.encounter.resources?.tigrisCartsFreed,undefined);
});
