import test from 'node:test';
import assert from 'node:assert/strict';
import {HEART_ABILITIES as catalog} from '../../../public/js/battlesim/engines/destinyquest/heart-abilities.js';
import {createDestinyFight,startDestinyRound,rollDestinySpeed,resolveDestinySpeed,rollDestinyDamage,resolveDestinyDamage,endDestinyRound} from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {configureDestinyAbilities,useDestinyAbility as use} from '../../../public/js/battlesim/engines/destinyquest/abilities.js';
import {resolveDestinyAbilityRoll as resolve} from '../../../public/js/battlesim/engines/destinyquest/ability-rolls.js';
import {destinyStat} from '../../../public/js/battlesim/engines/destinyquest/effects.js';
import {attachDestinyCharacter} from '../../../public/js/battlesim/engines/destinyquest/character.js';
import {setDestinyPassiveActivation} from '../../../public/js/battlesim/engines/destinyquest/ability-quota.js';
const hero={speed:20,brawn:4,magic:2,armour:0,health:10,maxHealth:30};
const foe={name:'Opponent',speed:5,brawn:3,armour:2,health:100};
const rolls=(...values)=>()=>{assert.ok(values.length,'Unexpected roll');return values.shift();};
const resume=f=>JSON.parse(JSON.stringify(f));
function setup(abilities,companion=true){
  const f=configureDestinyAbilities(createDestinyFight(hero,[foe]),abilities,{}, {catalog,bookRules:{deathMoves:false,deathPenalties:false}});
  return startDestinyRound(attachDestinyCharacter(f,{companions:{virgil:{alive:companion}}}),0);
}
const win=f=>resolveDestinySpeed(rollDestinySpeed(f,rolls(6,5,1,2)));
const finish=f=>endDestinyRound(resolveDestinyDamage(rollDestinyDamage(win(f),rolls(2))));

test('Elysium failure spends no charge or Hexed slot, blocks that modifier only, and resets next round',()=>{
  let f=use(setup({hexed:1,'elysium-soaked':1,wisdom:1,cunning:1}),'wisdom',{},rolls(1));
  assert.equal(f.used.wisdom,undefined);f=resolve(resume(f),rolls());
  assert.equal(f.used.wisdom,undefined);assert.deepEqual(f.abilityQuota.used,[]);assert.equal(destinyStat(f,'hero','magic'),2);
  assert.throws(()=>use(f,'wisdom',{},rolls()),/cannot be retried/);
  f=resolve(use(f,'cunning',{},rolls(2)),rolls());assert.equal(destinyStat(f,'hero','brawn'),7);assert.deepEqual(f.abilityQuota.used,['cunning']);
  f=startDestinyRound(finish(f),0);f=resolve(use(f,'wisdom',{},rolls(6)),rolls());
  assert.equal(destinyStat(f,'hero','magic'),4);assert.deepEqual(f.abilityQuota.used,['cunning','wisdom']);
});

test('every healing-item use gets its own Elysium check, with no retained pass after success',()=>{
  let f=resolve(use(setup({'elysium-soaked':1,heal:2}),'heal',{},rolls(2)),rolls());
  assert.equal(f.hero.health,14);assert.equal(f.used.heal,1);assert.equal(f.turn.passedStatusChecks,undefined);
  f=resolve(use(f,'heal',{},rolls(1)),rolls());assert.equal(f.hero.health,14);assert.equal(f.used.heal,1);
});

test('Broken Trust failure blocks the combat category but preserves Blessed Bullets for a later round',()=>{
  let f=win(setup({'broken-trust':1,'blessed-bullets':1,'deep-wound':1}));
  f=resolve(use(f,'blessed-bullets',{},rolls(5)),rolls());assert.equal(f.used['blessed-bullets'],undefined);
  assert.equal(f.turn.used.co,true);assert.throws(()=>use(f,'deep-wound'),/category per round/);
  f=endDestinyRound(resolveDestinyDamage(rollDestinyDamage(f,rolls(2))));f=startDestinyRound(f,0);
  f=win(f);f=resolve(use(f,'blessed-bullets',{},rolls(6)),rolls(1,2,3));
  assert.equal(f.used['blessed-bullets'],1);assert.equal(f.opponents[0].health,90);
  f=startDestinyRound(endDestinyRound(resume(f)),0);assert.equal(destinyStat(f,0,'speed'),4);
});

test('Blessed Bullets needs the living companion before any check or damage is rolled',()=>{
  const f=win(setup({'broken-trust':1,'blessed-bullets':1},false)),before=resume(f);
  assert.throws(()=>use(f,'blessed-bullets',{},rolls()),/companion/);assert.deepEqual(f,before);
});

test('a modifier used to edit an Elysium check must pass its own check, then resumes the original saved roll',()=>{
  let f=use(setup({'elysium-soaked':1,wisdom:1,charm:1}),'wisdom',{},rolls(1));
  f=use(f,'charm',{die:0},rolls(2));assert.equal(f.turn.pendingAbility.ability,'charm');
  f=resolve(resume(f),rolls(6));assert.equal(f.turn.pendingAbility.ability,'wisdom');assert.deepEqual(f.turn.pendingAbility.dice,[6]);
  assert.equal(f.used.charm,1);f=resolve(resume(f),rolls());assert.equal(f.used.wisdom,1);
  assert.equal(destinyStat(f,'hero','magic'),4);assert.equal(f.turn.passedStatusChecks,undefined);
});

test('failed nested modifiers leave both original rolls and charges intact and cannot check themselves recursively',()=>{
  let f=use(setup({'elysium-soaked':1,wisdom:1,charm:1}),'wisdom',{},rolls(1));
  assert.throws(()=>use(f,'wisdom',{},rolls()),/Resolve this ability check/);
  f=use(f,'charm',{die:0},rolls(1));assert.throws(()=>use(f,'charm',{die:0},rolls()),/Resolve this ability check/);
  f=resolve(f,rolls());assert.equal(f.turn.pendingAbility.ability,'wisdom');assert.equal(f.used.charm,undefined);
  f=resolve(f,rolls());assert.equal(f.used.wisdom,undefined);assert.deepEqual(f.turn.failedAbilities,['charm','wisdom']);
});

test('invalid attributes and unavailable ally targets fail before drawing an Elysium check',()=>{
  const f=setup({'elysium-soaked':1,'war-paint':1,heal:1}),before=resume(f);
  assert.throws(()=>use(f,'war-paint',{attribute:'speed'},rolls()),/allowed attribute/);
  assert.throws(()=>use(f,'heal',{ally:4},rolls()),/available ally/);assert.deepEqual(f,before);
});

test('a pending Elysium attempt reserves its slot; failure releases it without recording a used ability',()=>{
  const names=['savagery','cunning','focus','might-of-stone','resolve','spirit-ward','war-paint'];
  let f=setup({hexed:1,'elysium-soaked':1,wisdom:1,charm:1,heal:1,...Object.fromEntries(names.map(name=>[name,1]))});
  for(const name of names)f=resolve(use(f,name,name==='war-paint'?{attribute:'brawn'}:{},rolls(2)),rolls());
  f=use(f,'wisdom',{},rolls(1));const before=resume(f);
  assert.throws(()=>use(f,'charm',{die:0},rolls()),/ability limit/);assert.deepEqual(f,before);
  f=resolve(f,rolls());assert.equal(f.abilityQuota.used.length,7);
  f=resolve(use(f,'heal',{},rolls(2)),rolls());assert.equal(f.abilityQuota.used.length,8);assert.equal(f.abilityQuota.everUsed.includes('wisdom'),false);
});

test('Blood Sworn itself must pass Elysium before paying, while its funded ability keeps its independent check and charge',()=>{
  let f=setup({hexed:1,'elysium-soaked':1,'blood-sworn-set':1,heal:1});
  f=resolve(use(f,'blood-sworn-set',{ability:'heal'},rolls(1)),rolls());assert.equal(f.hero.health,10);assert.deepEqual(f.abilityQuota.paidExempt,[]);
  f=startDestinyRound(finish(f),0);f=resolve(use(f,'blood-sworn-set',{ability:'heal'},rolls(2)),rolls());assert.equal(f.hero.health,6);
  f=resolve(use(f,'heal',{},rolls(1)),rolls());assert.equal(f.hero.health,6);assert.equal(f.used.heal,undefined);
  assert.deepEqual(f.abilityQuota.paidExempt,['heal']);
  f=startDestinyRound(finish(f),0);f=resolve(use(f,'heal',{},rolls(2)),rolls());assert.equal(f.hero.health,10);assert.equal(f.used.heal,1);
});

test('rune curses are forced under Hexed, clamp attributes at zero and expire together on hero doubles',()=>{
  let f=setup({hexed:1,'curse-of-vulnerability':1,'curse-of-weakness':1});
  assert.equal(destinyStat(f,'hero','armour'),0);assert.equal(destinyStat(f,'hero','brawn'),0);assert.equal(destinyStat(f,'hero','magic'),0);
  assert.deepEqual(f.abilityQuota.used,[]);
  assert.throws(()=>setDestinyPassiveActivation(f,'curse-of-weakness',false),/available passive/);
  f=rollDestinySpeed(f,rolls(6,5,2,2));
  assert.equal(destinyStat(f,'hero','brawn'),0,'enemy doubles do not dispel the curse');
  f=resolveDestinySpeed(f);f=endDestinyRound(resolveDestinyDamage(rollDestinyDamage(f,rolls(2))));
  f=startDestinyRound(resume(f),0);f=rollDestinySpeed(f,rolls(3,3,1,2));
  assert.equal(destinyStat(f,'hero','brawn'),4);assert.equal(destinyStat(f,'hero','magic'),2);
  assert.equal(f.effects.some(e=>e.dispelOnDoubles),false);assert.equal(f.used['curse-of-weakness'],undefined);
});

test('rune curses also expire on doubled hero damage dice without changing base attributes',()=>{
  let f=setup({'curse-of-vulnerability':1,'curse-of-weakness':1,compulsion:1});
  f.hero.armour=9;f.hero.brawn=12;f.hero.magic=11;
  assert.equal(destinyStat(f,'hero','armour'),6);assert.equal(destinyStat(f,'hero','brawn'),7);assert.equal(destinyStat(f,'hero','magic'),6);
  f=use(win(f),'compulsion');f=rollDestinyDamage(f,rolls(4,4));
  assert.equal(destinyStat(f,'hero','armour'),9);assert.equal(destinyStat(f,'hero','brawn'),12);assert.equal(destinyStat(f,'hero','magic'),11);
});

test('editing precombat curse selection replaces setup penalties without duplicating or deleting other effects',()=>{
  const options={catalog,bookRules:{deathMoves:false,deathPenalties:false}};
  let f=configureDestinyAbilities(createDestinyFight({...hero,brawn:12},[foe]),{'curse-of-weakness':1},{},options);
  f.effects.push({kind:'stat',target:'hero',attribute:'brawn',amount:1,from:0,until:100,source:'story'});
  f=configureDestinyAbilities(f,{'curse-of-weakness':1},{},options);
  assert.equal(destinyStat(f,'hero','brawn'),8);assert.equal(f.effects.length,3);
  f=configureDestinyAbilities(resume(f),{},{},options);
  assert.equal(destinyStat(f,'hero','brawn'),13);assert.equal(f.effects.length,1);
});
