import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decodeDestinyRoster} from '../../../public/js/battlesim/engines/destinyquest/winters-fury-roster.js';
import {createHeartFight} from '../../../public/js/battlesim/engines/destinyquest/heart.js';
import {startDestinyRound,rollDestinySpeed,resolveDestinySpeed,rollDestinyDamage,resolveDestinyDamage,endDestinyRound} from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {resolveDestinyAbilityRoll} from '../../../public/js/battlesim/engines/destinyquest/ability-rolls.js';
import {destinyStat,destinyDamageScore} from '../../../public/js/battlesim/engines/destinyquest/effects.js';
const roster=decodeDestinyRoster(JSON.parse(readFileSync(new URL('../../fixtures/battlesim/heart-roster.json',import.meta.url))).enemies);
const hero={speed:20,brawn:4,magic:2,armour:0,health:30,maxHealth:30};
const rolls=(...values)=>()=>{assert.ok(values.length,'Unexpected die roll');return values.shift();};
const clone=f=>JSON.parse(JSON.stringify(f));
const fight=(section,options={})=>createHeartFight({...hero,...options.hero},section,{...options,roster});
const win=(f,...values)=>resolveDestinySpeed(rollDestinySpeed(f,rolls(6,5,1,2)),rolls(...values));
const lose=f=>resolveDestinySpeed(rollDestinySpeed(f,rolls(1,2,6,5)),rolls());

test('the Custodian shelters at half Health once, clears conditions and heals while the thieves are active',()=>{
  let f=startDestinyRound(fight(419,{hero:{brawn:28},abilities:{bleed:1,barbs:1}}),0);
  f=resolveDestinyDamage(rollDestinyDamage(win(f),rolls(1)));
  assert.equal(f.opponents[0].health,24);assert.deepEqual(f.encounter.inactiveTargets,[0]);assert.equal(f.status,'active');
  assert.equal(f.effects.some(e=>e.kind==='bleed'&&e.target===0),false);
  f=endDestinyRound(f);assert.equal(f.opponents[0].health,26);assert.equal(f.opponents[1].health,39);assert.equal(f.hero.health,29);
  f=startDestinyRound(clone(f),0);assert.equal(f.target,1);
  f.hero.brawn=100;f=resolveDestinyDamage(rollDestinyDamage(win(f),rolls(1)));
  assert.equal(f.opponents[1].health,0);assert.equal(f.encounter.inactiveTargets.includes(0),false);assert.equal(f.status,'active');
  f=startDestinyRound(endDestinyRound(f),1);assert.equal(f.target,0);assert.equal(f.opponents[0].health,25,'exposed again: Barbs applies and coffin regeneration stops');
  f=resolveDestinyDamage(rollDestinyDamage(win(f),rolls(1)));assert.equal(f.status,'win');assert.equal(f.encounter.outcomeSection,'493');
});

test('Custodian coffin regeneration caps at fifty and a lethal initial hit remains a victory',()=>{
  let f=startDestinyRound(fight(419,{hero:{brawn:28}}),0);f=resolveDestinyDamage(rollDestinyDamage(win(f),rolls(1)));
  f.opponents[0].health=49;f=endDestinyRound(f);assert.equal(f.opponents[0].health,50);
  f=startDestinyRound(fight(419,{hero:{brawn:100}}),0);f=resolveDestinyDamage(rollDestinyDamage(win(f),rolls(1)));
  assert.equal(f.status,'win');assert.equal(f.opponents[1].health,40);
});

test('Totem remains indestructible with original null values and three living cubes give three Magic damage dice',()=>{
  let f=fight(459,{hero:{speed:0}});
  assert.deepEqual([f.opponents[0].health,f.opponents[0].armour,f.opponents[0].brawn],[null,null,null]);
  assert.throws(()=>startDestinyRound(f,0),/exposed combat component/);
  f=lose(startDestinyRound(f,1));f=rollDestinyDamage(f,rolls(1,2,3));assert.equal(destinyDamageScore(f),11);
  f=resolveDestinyDamage(f);assert.equal(f.encounter.heroStatuses.venom,2);f=endDestinyRound(f);assert.equal(f.hero.health,15);
});

test('destroyed Snake and Spider disable new venom and lower Speed, while old venom remains and damage drops to one die',()=>{
  let f=startDestinyRound(fight(459,{hero:{brawn:30},abilities:{bleed:1,venom:1}}),1);
  f=resolveDestinyDamage(rollDestinyDamage(win(f),rolls(1)));assert.equal(f.opponents[1].health,0);
  assert.equal(f.effects.some(e=>['bleed','venom'].includes(e.kind)),false);
  f.hero.speed=0;f=lose(startDestinyRound(endDestinyRound(f),2));f=resolveDestinyDamage(rollDestinyDamage(f,rolls(1)));
  assert.equal(f.turn.damageDice.length,1);assert.equal(f.encounter.heroStatuses,undefined);
  f=endDestinyRound(f);f.hero.speed=20;
  f=resolveDestinyDamage(rollDestinyDamage(win(startDestinyRound(f,2)),rolls(1)));assert.equal(destinyStat(f,0,'speed'),6);
  f.encounter.heroStatuses={venom:2};f=endDestinyRound(f);assert.equal(f.encounter.heroStatuses.venom,2);
});

test('all cubes must be defeated, Jaguar damage stops on its defeat and the Totem never receives fabricated Health',()=>{
  let f=fight(459,{hero:{brawn:100}});
  for(const target of [3,2,1]){
    f=resolveDestinyDamage(rollDestinyDamage(win(startDestinyRound(f,target)),rolls(1)));
    if(target!==1){assert.equal(f.status,'active');f=endDestinyRound(f);assert.equal(f.hero.health,30);}
  }
  assert.equal(f.status,'win');assert.equal(f.encounter.outcomeSection,'621');assert.equal(f.opponents[0].health,null);
});

test('Succubus Delirium activates only after a score Health hit and one/two misses while three allows damage',()=>{
  const clean=win(startDestinyRound(fight(463),0));assert.equal(clean.phase,'damage');
  for(const result of [1,2,3]){
    let f=lose(startDestinyRound(fight(463,{hero:{speed:0}}),0));f=resolveDestinyDamage(rollDestinyDamage(f,rolls(1)));
    assert.equal(f.encounter.heroStatuses.delirium,0);f=endDestinyRound(f);assert.equal(f.hero.health,22);f.hero.speed=20;
    f=win(startDestinyRound(f,0),result);assert.equal(f.phase,'ability-rolled');f=resolveDestinyAbilityRoll(clone(f),rolls(),{roster});
    assert.equal(f.phase,result<=2?'end':'damage');
    if(result===3){f=rollDestinyDamage(f,rolls(2));assert.equal(destinyDamageScore(f),8);}
  }
});

test('Toxicology prevents Delirium without preventing the Succubus mental daggers',()=>{
  let f=lose(startDestinyRound(fight(463,{hero:{speed:0},abilities:{toxicology:1}}),0));f=resolveDestinyDamage(rollDestinyDamage(f,rolls(1)));
  assert.equal(f.encounter.heroStatuses,undefined);f=endDestinyRound(f);assert.equal(f.hero.health,22);
  f.hero.speed=20;f=win(startDestinyRound(f,0));assert.equal(f.phase,'damage');
});

test('solo Succubus preserves the source Brawn variant and excludes Scowler’s bonus',()=>{
  let f=startDestinyRound(fight(673),0);assert.deepEqual([f.opponents[0].brawn,f.opponents[0].magic],[5,null]);
  f=rollDestinyDamage(win(f),rolls(2));assert.equal(destinyDamageScore(f),6);
  const other=fight(463);assert.deepEqual([other.opponents[0].brawn,other.opponents[0].magic],[null,5]);
});

test('the siren sisters retain separate passive immunity, hit status and capped ally healing',()=>{
  let f=startDestinyRound(fight(690,{abilities:{bleed:1,venom:1,barbs:1,'fire-aura':1}}),0);
  f=resolveDestinyDamage(rollDestinyDamage(win(f),rolls(6)));assert.equal(f.opponents[0].health,36);assert.equal(f.effects.some(e=>e.target===0),false);
  f=endDestinyRound(f);assert.deepEqual(f.opponents.map(o=>o.health),[40,30,38]);
  for(const target of [0,1]){
    let lost=lose(startDestinyRound(fight(690,{hero:{speed:0}}),target));lost=resolveDestinyDamage(rollDestinyDamage(lost,rolls(1)));
    assert.equal(lost.encounter.heroStatuses?.disease,target===1?2:undefined);
  }
});

test('defeating Ceana stops both sisters healing without prematurely winning the combat',()=>{
  let f=startDestinyRound(fight(690,{hero:{brawn:100}}),2);f.opponents[0].health=20;f.opponents[1].health=10;
  f=resolveDestinyDamage(rollDestinyDamage(win(f),rolls(1)));assert.equal(f.status,'active');assert.equal(f.opponents[2].health,0);
  f=endDestinyRound(f);assert.deepEqual(f.opponents.map(o=>o.health),[20,10,0]);
});
