import test from 'node:test';
import assert from 'node:assert/strict';
import {createDestinyFight,startDestinyRound,rollDestinySpeed,resolveDestinySpeed,rollDestinyDamage,resolveDestinyDamage,endDestinyRound,continueDestinyCombat} from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {configureDestinyAbilities,useDestinyPotionModifier} from '../../../public/js/battlesim/engines/destinyquest/abilities.js';
import {attachDestinyCharacter} from '../../../public/js/battlesim/engines/destinyquest/character.js';
import {LEGION_ABILITIES} from '../../../public/js/battlesim/engines/destinyquest/legion-abilities.js';
import {useLegionMushroom} from '../../../public/js/battlesim/engines/destinyquest/legion-consumables.js';
import {useLegionAction} from '../../../public/js/battlesim/engines/destinyquest/legion.js';
import {destinyStat} from '../../../public/js/battlesim/engines/destinyquest/effects.js';
import {beginDestinySession,applyDestinySessionAction} from '../../../public/js/battlesim/engines/destinyquest/session.js';

const hero={speed:20,brawn:4,magic:2,armour:10,health:30,maxHealth:30};
const foe={name:'Opponent',speed:1,brawn:1,armour:100,health:1000};
const character={notes:'keep',combatConsumables:{glittercap:2,marshstick:2},potionModifiers:{health:{amount:1,uses:2,duration:1}}};
const make=(profile=character)=>attachDestinyCharacter(configureDestinyAbilities(createDestinyFight(hero,[foe]),{'good-taste':1},{},{catalog:LEGION_ABILITIES}),profile);
const finishRound=f=>endDestinyRound(resolveDestinyDamage(rollDestinyDamage(resolveDestinySpeed(rollDestinySpeed(f,()=>3)),()=>3)),[],()=>3);

test('mushrooms boost exactly two rounds then penalise the remainder without a potion bonus',()=>{
  const original=startDestinyRound(make(),0);
  let f=useLegionAction(original,'glittercap');
  assert.equal(destinyStat(f,'hero','magic'),5); // Good Taste applies to potions, not mushrooms.
  assert.equal(f.character.combatConsumables.glittercap,1);
  assert.equal(original.character.combatConsumables.glittercap,2);
  assert.throws(()=>useDestinyPotionModifier(f,'health'),/unavailable/);
  f=startDestinyRound(finishRound(f),0);
  assert.equal(destinyStat(f,'hero','magic'),5);
  assert.throws(()=>useLegionMushroom(f,'glittercap'),/once per combat/);
  f=useLegionMushroom(f,'marshstick');
  assert.equal(destinyStat(f,'hero','speed'),23);
  f=startDestinyRound(finishRound(f),0);
  assert.equal(destinyStat(f,'hero','magic'),1);
  assert.equal(destinyStat(f,'hero','speed'),23);
  f=startDestinyRound(finishRound(f),0);
  assert.equal(destinyStat(f,'hero','magic'),1);
  assert.equal(destinyStat(f,'hero','speed'),19);
  assert.equal(f.character.notes,'keep');
  assert.equal(Object.hasOwn(f.character,'backpack'),false);
});

test('blocked, spent or mistimed mushroom effects leave the original fight unchanged',()=>{
  let f=make();assert.throws(()=>useLegionMushroom(f,'glittercap'),/unavailable/);
  f=startDestinyRound(f,0);f.encounter={disableBackpack:true};
  const before=structuredClone(f);
  assert.throws(()=>useLegionMushroom(f,'glittercap'),/unavailable/);
  assert.deepEqual(f,before);
  delete f.encounter;f.character.combatConsumables.glittercap=0;
  assert.throws(()=>useLegionMushroom(f,'glittercap'),/No uses/);
});

test('two-combat shadow blessing and one-combat chosen blessing expire independently',()=>{
  const profile={...character,combatBoosts:{brawn:{amount:2,combats:2},magic:{amount:1,combats:1}}};
  const setup={hero,opponents:[foe],abilities:{}};
  let s=beginDestinySession({character:profile},setup,{outcomeId:'first',catalog:LEGION_ABILITIES});
  assert.equal(s.character.combatBoosts.brawn.combats,2);
  const cancelled=applyDestinySessionAction(s,'cancel-fight');
  assert.deepEqual(cancelled.character.combatBoosts,profile.combatBoosts);
  s=applyDestinySessionAction(s,'start-round',{target:0});
  assert.equal(destinyStat(s.fight,'hero','brawn'),6);
  assert.equal(destinyStat(s.fight,'hero','magic'),3);
  assert.equal(s.character.combatBoosts.brawn.combats,1);
  s=applyDestinySessionAction(s,'concede');
  s=applyDestinySessionAction(s,'record-outcome',{}, {timestamp:1});
  s=applyDestinySessionAction(s,'record-outcome',{}, {timestamp:2});
  assert.equal(s.character.combatBoosts.brawn.combats,1);
  s=beginDestinySession(s,setup,{outcomeId:'second',catalog:LEGION_ABILITIES});
  s=applyDestinySessionAction(s,'start-round',{target:0});
  assert.equal(destinyStat(s.fight,'hero','brawn'),6);
  assert.equal(destinyStat(s.fight,'hero','magic'),2);
  assert.equal(s.character.combatBoosts.brawn.combats,0);
  assert.equal(s.setup.hero.brawn,4);
  assert.deepEqual(profile.combatBoosts,{brawn:{amount:2,combats:2},magic:{amount:1,combats:1}});
});

test('consecutive combats each consume one blessing and reset mushroom limits',()=>{
  let f=attachDestinyCharacter(createDestinyFight(hero,[{...foe,armour:0,health:1},{...foe}]),{...character,combatBoosts:{brawn:{amount:2,combats:2}}});
  f.encounter={consecutiveCombats:{index:0,targets:[0,1]},inactiveTargets:[1]};
  f=startDestinyRound(f,0);f=useLegionMushroom(f,'glittercap');
  f=resolveDestinyDamage(rollDestinyDamage(resolveDestinySpeed(rollDestinySpeed(f,()=>3)),()=>3));
  assert.equal(f.phase,'between-combats');
  f=startDestinyRound(continueDestinyCombat(f),1);
  assert.equal(f.character.combatBoosts.brawn.combats,0);
  assert.equal(destinyStat(f,'hero','brawn'),6);
  f=useLegionMushroom(f,'glittercap');
  assert.equal(f.character.combatConsumables.glittercap,0);
});

test('an ally proxy does not spend the player blessing',()=>{
  let f=make({...character,combatBoosts:{brawn:{amount:2,combats:1}}});
  f.encounter={heroRelay:{active:true}};
  f=startDestinyRound(f,0);
  assert.equal(f.character.combatBoosts.brawn.combats,1);
  assert.equal(destinyStat(f,'hero','brawn'),4);
});
