import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decodeDestinyRoster} from '../../../public/js/battlesim/engines/destinyquest/winters-fury-roster.js';
import {createHeartFight} from '../../../public/js/battlesim/engines/destinyquest/heart.js';
import {startDestinyRound,rollDestinySpeed,resolveDestinySpeed,rollDestinyDamage,resolveDestinyDamage,endDestinyRound} from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {resolveDestinyAbilityRoll} from '../../../public/js/battlesim/engines/destinyquest/ability-rolls.js';
import {useDestinyAbility} from '../../../public/js/battlesim/engines/destinyquest/abilities.js';
import {destinyStat,destinyDamageScore,destinyStrike} from '../../../public/js/battlesim/engines/destinyquest/effects.js';
const roster=decodeDestinyRoster(JSON.parse(readFileSync(new URL('../../fixtures/battlesim/heart-roster.json',import.meta.url))).enemies);
const hero={speed:30,brawn:0,magic:0,armour:0,health:40,maxHealth:40};
const rolls=(...values)=>()=>{assert.ok(values.length,'Unexpected die roll');return values.shift();};
const clone=f=>JSON.parse(JSON.stringify(f));
const fight=(section,options={})=>createHeartFight({...hero,...options.hero},section,{...options,roster});
const win=f=>resolveDestinySpeed(rollDestinySpeed(f,rolls(6,5,1,2)),rolls());
const score=(f,...extra)=>resolveDestinyDamage(rollDestinyDamage(f,rolls(1)),rolls(...extra));

test('Brawn sniper combat starts with an enemy attack and disables every special ability only in round one',()=>{
  assert.throws(()=>fight(482),/Choose Brawn or Magic/);
  let f=startDestinyRound(fight(482,{hero:{brawn:1,magic:50},abilities:{barbs:1,faith:1,'might-of-stone':1},encounterOptions:{attackAttribute:'brawn'}}),0);
  assert.equal(f.phase,'damage');assert.equal(f.turn.winner,'opponent');assert.equal(f.encounter.disableHeroAbilities,true);
  assert.throws(()=>rollDestinySpeed(f),/stage/);
  assert.throws(()=>useDestinyAbility(f,'might-of-stone'),/unavailable/);
  f=score(f);assert.equal(f.hero.health,33);f=endDestinyRound(f);assert.equal(f.opponents[0].health,60);
  f=win(startDestinyRound(clone(f),0));assert.equal(f.encounter.disableHeroAbilities,false);
  f=rollDestinyDamage(f,rolls(1));assert.equal(destinyDamageScore(f),2,'explicit Brawn stays selected despite higher Magic');
  f=resolveDestinyDamage(f);f=endDestinyRound(f);assert.equal(f.opponents[0].health,59);
  f=win(startDestinyRound(f,0));f.hero.brawn=100;f=score(f);
  assert.equal(f.status,'win');assert.equal(f.hero.health,33);assert.equal(f.encounter.outcomeSection,'243');
});

test('Magic sniper combat has normal initiative from the first round and retains the chosen damage attribute',()=>{
  let f=startDestinyRound(fight(482,{hero:{brawn:100,magic:4},encounterOptions:{attackAttribute:'magic'}}),0);
  assert.equal(f.phase,'speed');f=rollDestinyDamage(win(f),rolls(2));assert.equal(destinyDamageScore(f),6);
});

test('Hunters are a single opponent and the fight ends at fifteen Health without fabricating their death',()=>{
  let f=startDestinyRound(fight(521,{hero:{brawn:21}}),0);assert.equal(f.opponents.length,1);
  f=score(win(f));assert.equal(f.opponents[0].health,32);assert.equal(f.status,'active');
  f=endDestinyRound(f);f.hero.brawn=20;f=score(win(startDestinyRound(f,0)));
  assert.equal(f.opponents[0].health,15);assert.equal(f.status,'win');assert.equal(f.encounter.outcomeSection,'532');
});

test('Grub Knight only reacts to actual Health damage and three or less permanently lowers Speed',()=>{
  let f=score(win(startDestinyRound(fight(523),0)));assert.equal(f.phase,'end');
  f=endDestinyRound(f);f.hero.brawn=10;f=score(win(startDestinyRound(f,0)),3);
  assert.equal(f.phase,'ability-rolled');assert.equal(f.turn.pendingAbility.name,'Grappling grubs');
  f=resolveDestinyAbilityRoll(clone(f),rolls(),{roster});assert.equal(destinyStat(f,'hero','speed'),29);
  f=endDestinyRound(f);f=score(win(startDestinyRound(f,0)),4);f=resolveDestinyAbilityRoll(f,rolls(),{roster});
  assert.equal(destinyStat(f,'hero','speed'),29);
});

test('passive Health damage also triggers grubs, and resuming does not apply end effects twice',()=>{
  let f=score(win(startDestinyRound(fight(523,{abilities:{barbs:1}}),0)));
  f=endDestinyRound(f,[],rolls(1));assert.equal(f.phase,'ability-rolled');assert.equal(f.opponents[0].health,54);
  f=resolveDestinyAbilityRoll(clone(f),rolls(),{roster});assert.equal(f.phase,'start');assert.equal(destinyStat(f,'hero','speed'),29);
  assert.equal(f.opponents[0].health,54);f=startDestinyRound(f,0);assert.equal(f.round,2);
});

test('Grub Knight disease requires a Health hit and Toxicology blocks it',()=>{
  for(const abilities of [{},{toxicology:1}]){
    let f=startDestinyRound(fight(523,{hero:{speed:0},abilities}),0);
    f=resolveDestinySpeed(rollDestinySpeed(f,rolls(1,2,6,5)),rolls());f=score(f);
    assert.equal(f.encounter.heroStatuses?.disease,abilities.toxicology?undefined:2);
  }
});

test('Furies grow beyond starting Health on one/two, while three through six leave Health unchanged',()=>{
  for(const face of [1,2,3,4,5,6]){
    let f=score(win(startDestinyRound(fight(538,{hero:{armour:20}}),0)));
    f=endDestinyRound(f,[],rolls(face));f=resolveDestinyAbilityRoll(clone(f),rolls(),{roster});f=endDestinyRound(f,[],rolls());
    assert.equal(f.opponents[0].health,face<=2?104:100);assert.equal(f.hero.health,38);
  }
});

test('Furies never regenerate after reaching zero, including a passive killing blow during the end phase',()=>{
  let f=score(win(startDestinyRound(fight(538,{hero:{brawn:200}}),0)));
  assert.equal(f.status,'win');assert.equal(f.encounter.outcomeSection,'790');
  f=score(win(startDestinyRound(fight(538,{abilities:{barbs:1}}),0)));f.opponents[0].health=1;
  f=endDestinyRound(f,[],rolls(1));f=resolveDestinyAbilityRoll(f,rolls(),{roster});f=endDestinyRound(f,[],rolls());
  assert.equal(f.status,'win');assert.equal(f.opponents[0].health,0);
});

test('Boogaloo deals two plus current Armour each end, unless Insulated is active',()=>{
  for(const [armour,abilities,damage] of [[0,{},2],[4,{},6],[4,{insulated:1},0]]){
    let f=score(win(startDestinyRound(fight(552,{hero:{armour},abilities}),0)));
    f=endDestinyRound(f);assert.equal(f.hero.health,40-damage);
  }
});

test('Hounds Speed doubles deal an extra four and Fire Shield protects against their separate molten skin',()=>{
  for(const abilities of [{},{'fire-shield':1}]){
    let f=startDestinyRound(fight(564,{abilities}),0);
    f=rollDestinySpeed(f,rolls(6,5,2,2));assert.equal(f.hero.health,36);
    f=score(resolveDestinySpeed(f,rolls()));f=endDestinyRound(f);
    assert.equal(f.hero.health,abilities['fire-shield']?36:34);
  }
});

test('both molten hounds and Garm block every listed fire ability without granting blanket passive immunity',()=>{
  for(const section of [564,605]){
    let f=score(win(startDestinyRound(fight(section,{hero:{armour:20},abilities:{'fire-aura':1,'searing-mantle':1,barbs:1}}),0)));
    for(const source of ['back-draft','sear'])assert.equal(destinyStrike(f,0,6,source,'dice'),0);
    const hp=f.opponents[0].health;f=endDestinyRound(f);assert.equal(f.opponents[0].health,hp-1,'only Barbs applies');
  }
});

test('Tigris keeps the highest of three damage dice, then bleed requires an actual Health hit',()=>{
  for(const armour of [0,20]){
    let f=startDestinyRound(fight(570,{hero:{speed:0,armour}}),0);
    f=resolveDestinySpeed(rollDestinySpeed(f,rolls(1,2,6,5)),rolls());f=rollDestinyDamage(f,rolls(1,6,2));
    assert.equal(destinyDamageScore(f),12);f=resolveDestinyDamage(f);
    assert.equal(f.encounter.heroStatuses?.bleed,armour===0?1:undefined);
    const hp=f.hero.health;f=endDestinyRound(f);assert.equal(f.hero.health,hp-(armour===0?1:0));
  }
});

test('Scar-face-only Succubus adds two damage to the score and preserves her separate victory route',()=>{
  let f=rollDestinyDamage(win(startDestinyRound(fight(572),0)),rolls(2));assert.equal(destinyDamageScore(f),4);
  f=score(win(startDestinyRound(fight(572,{hero:{brawn:200}}),0)));assert.equal(f.encounter.outcomeSection,'591');
});

test('Garm frenzies once at thirty Health and Fire Shield stops four molten damage',()=>{
  let f=startDestinyRound(fight(605,{abilities:{'fire-shield':1}}),0);
  destinyStrike(f,0,70,'test','dice');assert.equal(f.opponents[0].health,30);
  assert.equal(destinyStat(f,0,'speed'),15);assert.equal(destinyStat(f,0,'brawn'),14);
  destinyStrike(f,0,1,'test','dice');assert.equal(destinyStat(f,0,'speed'),15);assert.equal(destinyStat(f,0,'brawn'),14);
  f=endDestinyRound(score(win(clone(f))));assert.equal(f.hero.health,40);
  f.hero.brawn=200;f=score(win(startDestinyRound(f,0)));assert.equal(f.encounter.outcomeSection,'379');
});
