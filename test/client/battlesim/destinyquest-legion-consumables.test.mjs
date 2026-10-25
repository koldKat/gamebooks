import test from 'node:test';
import assert from 'node:assert/strict';
import {createDestinyFight,startDestinyRound,rollDestinySpeed,resolveDestinySpeed,rollDestinyDamage,resolveDestinyDamage,endDestinyRound} from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {configureDestinyAbilities,useDestinyPotionModifier} from '../../../public/js/battlesim/engines/destinyquest/abilities.js';
import {attachDestinyCharacter} from '../../../public/js/battlesim/engines/destinyquest/character.js';
import {LEGION_ABILITIES} from '../../../public/js/battlesim/engines/destinyquest/legion-abilities.js';
import {LEGION_CONSUMABLES,useLegionConsumable} from '../../../public/js/battlesim/engines/destinyquest/legion-consumables.js';
import {useLegionAction} from '../../../public/js/battlesim/engines/destinyquest/legion.js';
import {destinyStat,applyDestinyHeroRoll,reflectDestinyDamage,destinyStrike} from '../../../public/js/battlesim/engines/destinyquest/effects.js';
import {resolveDestinyEncounterEvent} from '../../../public/js/battlesim/engines/destinyquest/encounter-events.js';

const hero={speed:20,brawn:4,magic:2,armour:0,health:30,maxHealth:30};
const foe={name:'Opponent',speed:10,brawn:2,armour:100,health:1000};
const uses=Object.fromEntries(Object.keys(LEGION_CONSUMABLES).map(name=>[name,2]));
function make(h=hero,enemies=[foe]){
  return startDestinyRound(attachDestinyCharacter(configureDestinyAbilities(createDestinyFight(h,enemies),{},{},{catalog:LEGION_ABILITIES}),{
    combatConsumables:uses,notes:'keep',potionModifiers:{health:{amount:1,uses:2}},unrelated:{keep:true},
  }),0);
}
const rolls=(...values)=>()=>{assert.ok(values.length,'unexpected die');return values.shift();};
const speed=f=>resolveDestinySpeed(rollDestinySpeed(f,()=>3));
const hit=f=>resolveDestinyDamage(rollDestinyDamage(f,()=>3));

test('Arthurian horn ignores Armour, hits only the chosen opponent, and shares backpack limits',()=>{
  const original=make(hero,[foe,{...foe,name:'Second'}]);
  let f=useLegionAction(original,'arthurian-horn',{target:1});
  assert.equal(f.opponents[0].health,1000);assert.equal(f.opponents[1].health,980);
  assert.equal(f.character.combatConsumables['arthurian-horn'],1);
  assert.equal(original.character.combatConsumables['arthurian-horn'],2);
  assert.equal(f.character.notes,'keep');assert.equal(Object.hasOwn(f.character,'backpack'),false);
  assert.throws(()=>useDestinyPotionModifier(f,'health'),/unavailable/);
  f=make(hero,[{...foe,health:20}]);f=useLegionConsumable(f,'arthurian-horn');
  assert.equal(f.status,'win');
});

test('oil replaces a winning damage score with exactly two damage dice, ignoring Armour and base damage stats',()=>{
  const original=speed(make({...hero,brawn:99,magic:88}));
  const f=useLegionAction(original,'oil-flask',{target:0},rolls(3,4));
  assert.equal(f.opponents[0].health,993);assert.equal(f.phase,'end');
  assert.equal(f.turn.normalDamageReplaced,true);
  assert.equal(f.character.combatConsumables['oil-flask'],1);
  assert.throws(()=>rollDestinyDamage(f,()=>6),/unavailable/);
  assert.throws(()=>useLegionConsumable(make(),'oil-flask'),/winning damage/);
  assert.throws(()=>useLegionConsumable(rollDestinyDamage(original,()=>3),'oil-flask'),/winning damage/);
  assert.throws(()=>useLegionConsumable(speed(make({...hero,speed:0})),'oil-flask'),/winning damage/);
  assert.equal(original.character.combatConsumables['oil-flask'],2);
});

test('a stink bomb affects the chosen foe for this round only and must precede Speed dice',()=>{
  let f=useLegionConsumable(make(),'stink-bomb');
  assert.equal(destinyStat(f,0,'speed'),8);
  f=startDestinyRound(endDestinyRound(hit(speed(f))),0);
  assert.equal(destinyStat(f,0,'speed'),10);
  assert.throws(()=>useLegionConsumable(rollDestinySpeed(f,()=>3),'stink-bomb'),/start of the round/);
});

test('portable shields absorb ten across attacks and passive damage, survive JSON resume and pass through excess',()=>{
  let f=useLegionConsumable(make({...hero,speed:0}),'portable-shield');
  f=hit(speed(f));assert.equal(f.hero.health,30);assert.equal(f.portableShieldHealth,5);
  assert.equal(f.turn.healthDamage,0);
  f=endDestinyRound(JSON.parse(JSON.stringify(f)),[{target:'hero',amount:7,ignoreArmour:true}]);
  assert.equal(f.hero.health,28);assert.equal(f.portableShieldHealth,0);
  assert.equal(f.turn.passiveDamageByTarget.hero,2);
  f=hit(speed(startDestinyRound(f,0)));assert.equal(f.hero.health,23);
  assert.equal(f.character.combatConsumables['portable-shield'],1);
});

test('portable shields also intercept die hazards, reflections, death explosions and encounter damage',()=>{
  let f=useLegionConsumable(make(),'portable-shield');
  f.encounter={heroRollFaces:[{faces:[3],amount:12}]};applyDestinyHeroRoll(f,[3],'damage');
  assert.equal(f.hero.health,28);assert.equal(f.portableShieldHealth,0);
  f=useLegionConsumable(make(),'portable-shield');f.encounter={reflectDamage:[{target:0,amount:3}]};
  reflectDestinyDamage(f,0,5,'score');assert.equal(f.hero.health,30);assert.equal(f.portableShieldHealth,7);
  f=useLegionConsumable(make(),'portable-shield');f.encounter={deathDamageByTarget:{0:12}};
  destinyStrike(f,0,1000,'test');assert.equal(f.hero.health,28);assert.equal(f.portableShieldHealth,0);
  f=useLegionConsumable(make(),'portable-shield');
  resolveDestinyEncounterEvent(f,{name:'Hit',event:{kind:'damage-if-high',limit:1,amount:12},dice:[6],returnPhase:'speed'},()=>3);
  assert.equal(f.hero.health,28);assert.equal(f.portableShieldHealth,0);
});

test('spirit tincture pays four Health despite a shield and grants only the selected stat for the rest of combat',()=>{
  let f=make();f.portableShieldHealth=10;
  f=useLegionConsumable(f,'spirit-tincture',{attribute:'magic'});
  assert.equal(f.hero.health,26);assert.equal(f.portableShieldHealth,10);
  assert.equal(destinyStat(f,'hero','magic'),4);assert.equal(destinyStat(f,'hero','brawn'),4);
  assert.throws(()=>useLegionConsumable(make(),'spirit-tincture',{attribute:'speed'}),/Brawn or Magic/);
  f=useLegionConsumable(make({...hero,health:3}),'spirit-tincture',{attribute:'brawn'});
  assert.equal(f.status,'loss');assert.equal(f.character.combatConsumables['spirit-tincture'],1);
});

test('invalid combat targets, blocked backpack effects and bad dice never mutate the source state',()=>{
  for(const name of Object.keys(LEGION_CONSUMABLES)){
    const f=make();f.encounter={disableBackpack:true};const before=structuredClone(f);
    assert.throws(()=>useLegionConsumable(f,name,{attribute:'brawn'}),/unavailable/);assert.deepEqual(f,before);
  }
  const f=speed(make()),before=structuredClone(f);
  assert.throws(()=>useLegionConsumable(f,'oil-flask',{},()=>0),/die/);assert.deepEqual(f,before);
  assert.throws(()=>useLegionConsumable(f,'arthurian-horn',{target:99}),/living opponent/);assert.deepEqual(f,before);
});
