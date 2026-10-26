import test from 'node:test';
import assert from 'node:assert/strict';
import {HEART_ABILITIES as catalog} from '../../../public/js/battlesim/engines/destinyquest/heart-abilities.js';
import {LEGION_ABILITIES} from '../../../public/js/battlesim/engines/destinyquest/legion-abilities.js';
import {createDestinyFight,startDestinyRound,rollDestinySpeed,resolveDestinySpeed,rollDestinyDamage,endDestinyRound} from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {configureDestinyAbilities,useDestinyAbility as use} from '../../../public/js/battlesim/engines/destinyquest/abilities.js';
import {attachDestinyAlly} from '../../../public/js/battlesim/engines/destinyquest/allies.js';
import {destinyStat} from '../../../public/js/battlesim/engines/destinyquest/effects.js';
const rules={deathPenalties:false,deathMoves:false};
const foe={name:'Opponent',speed:0,brawn:3,armour:2,health:100};
const hero={speed:20,brawn:4,magic:2,armour:3,health:10,maxHealth:30};
const resume=f=>JSON.parse(JSON.stringify(f));
const rolls=(...values)=>()=>{assert.ok(values.length,'Unexpected die roll');return values.shift();};
function setup(abilities={},allyOptions={}){
  const caster=configureDestinyAbilities(createDestinyFight(hero,[foe]),abilities,{}, {catalog,bookRules:rules});
  const ally=configureDestinyAbilities(createDestinyFight({...hero,name:'Ally',health:5,...allyOptions.hero},[foe]),allyOptions.abilities||{}, {}, {catalog:allyOptions.catalog||catalog,bookRules:rules});
  return attachDestinyAlly(caster,ally);
}
const start=(abilities,options)=>startDestinyRound(setup(abilities,options),0);
const allyStat=(f,attribute)=>destinyStat({...f,...f.allies[0],round:f.round},'hero',attribute);

test('attaching an ally copies its combat snapshot without sharing another fight or allowing mid-fight migration',()=>{
  const caster=configureDestinyAbilities(createDestinyFight(hero,[foe]),{}, {},{catalog});
  const ally=configureDestinyAbilities(createDestinyFight(hero,[foe]),{heal:1}, {},{catalog});
  const f=attachDestinyAlly(caster,ally);ally.hero.health=1;ally.abilities.heal=5;
  assert.equal(f.allies[0].hero.health,10);assert.equal(f.allies[0].abilities.heal,1);
  assert.equal(f.allies[0].opponents,undefined);assert.equal(caster.allies,undefined);
  assert.throws(()=>attachDestinyAlly(startDestinyRound(f,0),ally),/before combat/);
});

test('healing an ally spends the caster item charges, caps at maximum, and persists independently through JSON',()=>{
  const original=start({heal:2},{hero:{health:25}});
  let f=use(original,'heal',{ally:0});assert.equal(f.hero.health,10);assert.equal(f.allies[0].hero.health,29);
  assert.equal(original.allies[0].hero.health,25);assert.equal(original.used.heal,undefined);
  f=use(resume(f),'heal',{ally:0});assert.equal(f.allies[0].hero.health,30);assert.equal(f.used.heal,2);
  assert.equal(f.allies[0].used.heal,undefined);assert.throws(()=>use(f,'heal',{ally:0}),/no uses left/);
});

test('invalid or dead ally targets never fall back to healing self or consume the caster charge',()=>{
  const f=start({'greater-heal':1});f.allies[0].hero.health=0;const before=resume(f);
  for(const ally of [-1,1,0.5,'0',null,0])assert.throws(()=>use(f,'greater-heal',{ally}),/ally/);
  assert.deepEqual(f,before);const self=use(f,'greater-heal');assert.equal(self.hero.health,18);assert.equal(self.allies[0].hero.health,0);
});

test('armour buffs target only the ally and use the current shared round for their expiry',()=>{
  for(const [name,amount]of [['might-of-stone',3],['iron-will',3],['many-scales',3],['resolve',4],['spirit-ward',6]]){
    let f=use(start({[name]:1}),name,{ally:0});assert.equal(allyStat(f,'armour'),3+amount);
    assert.equal(destinyStat(f,'hero','armour'),3);f=resume(f);f.round++;
    assert.equal(allyStat(f,'armour'),3);
  }
});

test('Bless heals and permanently boosts only the chosen recipient, with Miracle applied from the caster',()=>{
  for(const bonus of [1,2]){
    let f=start({bless:1,...(bonus===2?{miracle:1}:{})});f=use(f,'bless',{ally:0,attribute:'magic'});
    assert.equal(f.allies[0].hero.health,11);assert.equal(allyStat(f,'magic'),2+bonus);
    assert.equal(f.hero.health,10);assert.equal(destinyStat(f,'hero','magic'),2);f.round+=3;assert.equal(allyStat(f,'magic'),2+bonus);
  }
});

test('Primal replaces the winning attack and applies both permanent attributes to the ally',()=>{
  let f=resolveDestinySpeed(rollDestinySpeed(start({primal:1}),rolls(6,5,1,2)));
  f=use(f,'primal',{ally:0});assert.equal(allyStat(f,'brawn'),6);assert.equal(allyStat(f,'magic'),4);
  assert.equal(destinyStat(f,'hero','brawn'),4);assert.equal(f.opponents[0].health,100);assert.equal(f.phase,'end');
  assert.throws(()=>rollDestinyDamage(f),/combat stage/);
});

test('Purge removes ally disease and venom, retaining Bleed, attributes and the caster statuses',()=>{
  const f=start({purge:1});f.encounter={heroStatuses:{venom:2}};
  f.allies[0].effects=[{kind:'disease',target:'hero'},{kind:'venom',target:'hero'},{kind:'bleed',target:'hero'},{kind:'stat',target:'hero',attribute:'armour',amount:2,from:1,until:99}];
  f.allies[0].encounter={heroStatuses:{disease:2,venom:2,bleed:1},growingStatus:{name:'disease',increment:1,from:1}};
  const next=use(f,'purge',{ally:0});assert.deepEqual(next.allies[0].effects.map(e=>e.kind),['bleed','stat']);
  assert.deepEqual(next.allies[0].encounter.heroStatuses,{bleed:1});assert.equal(next.allies[0].encounter.growingStatus,undefined);
  assert.deepEqual(next.encounter.heroStatuses,{venom:2});assert.equal(f.allies[0].effects.length,4);
});

test('Refresh uses the ally own volume catalog and never restores permanently sacrificed abilities',()=>{
  const f=start({refresh:1},{catalog:LEGION_ABILITIES,abilities:{courage:1}});f.allies[0].used.courage=1;
  const next=use(f,'refresh',{ally:0,restore:'courage'});assert.equal(next.allies[0].used.courage,0);assert.equal(next.used.refresh,1);
  assert.equal(f.allies[0].used.courage,1);assert.equal(next.allies[0].used.refresh,undefined);
  f.allies[0].encounter.sacrificedAbilities=['courage'];const before=resume(f);
  assert.throws(()=>use(f,'refresh',{ally:0,restore:'courage'}),/already used ability/);assert.deepEqual(f,before);
});

test('Shock Treatment revives only a fallen ally and clears harmful passives without erasing attributes or charges',()=>{
  let f=start({'shock-treatment':1});const before=resume(f);
  assert.throws(()=>use(f,'shock-treatment',{ally:0}),/fallen ally/);assert.throws(()=>use(f,'shock-treatment'),/fallen ally/);assert.deepEqual(f,before);
  f.allies[0].hero.health=0;f.allies[0].used.heal=1;
  f.allies[0].effects=[{kind:'venom',target:'hero'},{kind:'ongoing-damage',target:'hero'},{kind:'stat',target:'hero',attribute:'armour',amount:2,from:1,until:99}];
  f.allies[0].encounter={heroStatuses:{bleed:1},growingStatus:{name:'venom'}};
  f=use(resume(f),'shock-treatment',{ally:0});assert.equal(f.allies[0].hero.health,10);assert.equal(f.hero.health,10);
  assert.deepEqual(f.allies[0].effects.map(e=>e.kind),['stat']);assert.equal(f.allies[0].used.heal,1);
  assert.equal(f.allies[0].encounter.heroStatuses,undefined);assert.equal(f.allies[0].encounter.growingStatus,undefined);
  assert.throws(()=>use(f,'shock-treatment',{ally:0}),/no uses left/);
});

test('Atonement heals both heroes using only its named passive sources on one selected opponent',()=>{
  let f=setup({atonement:1,barbs:1});f.hero.speed=0;f.hero.normal.speed=0;f.opponents.push(structuredClone(f.opponents[0]));
  f=startDestinyRound(f,0);f.effects.push({kind:'bleed',target:0,amount:1,from:1,until:99},{kind:'ongoing-damage',source:'monkey-mob',target:0,amount:5,from:1,until:99});
  f=endDestinyRound(resolveDestinySpeed(rollDestinySpeed(f,rolls(1,2,1,2))));
  assert.equal(f.turn.passiveDamageByTarget[0],7);assert.equal(f.phase,'start');
  f=use(resume(f),'atonement',{target:0});assert.equal(f.hero.health,12);assert.equal(f.allies[0].hero.health,7);
  assert.throws(()=>use(f,'atonement',{target:1}),/no uses left/);
});

test('Atonement caps recovery at actual Health lost and cannot resurrect a fallen ally',()=>{
  let f=setup({atonement:1,barbs:1});f.hero.speed=0;f.hero.normal.speed=0;
  f.opponents[0].health=2;f.opponents.push({...structuredClone(f.opponents[0]),health:100});f.allies[0].hero.health=0;
  f=startDestinyRound(f,0);f.effects.push({kind:'bleed',target:0,amount:4,from:1,until:99});
  f=endDestinyRound(resolveDestinySpeed(rollDestinySpeed(f,rolls(1,2,1,2))));
  assert.equal(f.turn.passiveDamageByTarget[0],2);f=use(f,'atonement',{target:0});
  assert.equal(f.hero.health,12);assert.equal(f.allies[0].hero.health,0);
});
