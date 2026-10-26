import test from 'node:test';
import assert from 'node:assert/strict';
import {HEART_ABILITIES as catalog} from '../../../public/js/battlesim/engines/destinyquest/heart-abilities.js';
import {createDestinyFight,startDestinyRound,rollDestinySpeed,resolveDestinySpeed,endDestinyRound} from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {configureDestinyAbilities,useDestinyAbility as use} from '../../../public/js/battlesim/engines/destinyquest/abilities.js';
import {setDestinyPassiveActivation as activate} from '../../../public/js/battlesim/engines/destinyquest/ability-quota.js';
import {hasDestinyAbility,destinyStat} from '../../../public/js/battlesim/engines/destinyquest/effects.js';
import {attachDestinyAlly} from '../../../public/js/battlesim/engines/destinyquest/allies.js';
import {createDestinySession,applyDestinySessionAction} from '../../../public/js/battlesim/engines/destinyquest/session.js';
const hero={speed:0,brawn:4,magic:2,armour:0,health:10,maxHealth:30};
const foe={name:'Opponent',speed:20,brawn:3,armour:0,health:200};
const rolls=(...values)=>()=>{assert.ok(values.length,'Unexpected die roll');return values.shift();};
const resume=f=>JSON.parse(JSON.stringify(f));
const modifiers=['wisdom','savagery','cunning','war-paint','focus','might-of-stone','resolve','spirit-ward'];
const owned=names=>Object.fromEntries(names.map(name=>[name,1]));
function setup(abilities={}){
  return configureDestinyAbilities(createDestinyFight(hero,[foe]),abilities,{}, {catalog,bookRules:{deathMoves:false,deathPenalties:false}});
}
const fill=(f,names)=>names.reduce((next,name)=>use(next,name,name==='war-paint'?{attribute:'brawn'}:{}),f);

test('Hexed allows eight distinct abilities, or ten with Demon Blood, without duplicating permanent Health',()=>{
  const eight=setup({hexed:1}),ten=setup({hexed:1,'demon-blood':1});
  assert.equal(eight.abilityQuota.maximum,8);assert.equal(ten.abilityQuota.maximum,10);
  assert.equal(ten.hero.maxHealth,30);assert.equal(ten.hero.health,10);
  assert.equal(setup({'demon-blood':1}).abilityQuota,undefined);
});

test('a ninth distinct ability is rejected atomically while the first eight survive save and resume',()=>{
  let f=startDestinyRound(setup({hexed:1,...owned([...modifiers,'heal'])}),0);f=fill(f,modifiers);
  assert.equal(f.abilityQuota.used.length,8);f=resume(f);const before=resume(f);
  assert.throws(()=>use(f,'heal'),/ability limit/);assert.deepEqual(f,before);
});

test('ordinary passives remain automatic without Hexed; Hexed passives require explicit activation',()=>{
  assert.equal(hasDestinyAbility(setup({barbs:1}),'barbs'),true);
  let f=setup({hexed:1,barbs:1,bleed:1});assert.equal(hasDestinyAbility(f,'barbs'),false);
  f=activate(f,'barbs');assert.equal(hasDestinyAbility(f,'barbs'),true);assert.equal(hasDestinyAbility(f,'bleed'),false);
  f=startDestinyRound(f,0);f.opponents[0].speed=0;
  f=endDestinyRound(resolveDestinySpeed(rollDestinySpeed(f,rolls(1,2,1,2))));assert.equal(f.opponents[0].health,199);
  assert.deepEqual(f.abilityQuota.used,['barbs']);
});

test('turning passives off never refunds slots, and reactivation does not charge another slot',()=>{
  let f=setup({hexed:1,barbs:1});f=activate(f,'barbs');f=activate(resume(f),'barbs',false);
  assert.equal(hasDestinyAbility(f,'barbs'),false);assert.deepEqual(f.abilityQuota.used,['barbs']);
  f=activate(f,'barbs');assert.deepEqual(f.abilityQuota.used,['barbs']);
  const count=f.history.length;f=activate(f,'barbs');assert.equal(f.history.length,count);
});

test('opening abilities consume quota before round one and cannot bypass a full passive quota',()=>{
  const passives=['barbs','bleed','disease','venom','gouge','weaver','faith','fire-aura'];
  let f=setup({hexed:1,'sweet-spot':1,...owned(passives)});
  f=passives.reduce((next,name)=>activate(next,name),f);
  assert.throws(()=>use(f,'sweet-spot',{number:3}),/ability limit/);
  f=use(setup({hexed:1,'sweet-spot':1}),'sweet-spot',{number:3});assert.deepEqual(f.abilityQuota.used,['sweet-spot']);
});

test('restoring Magic Tap on doubles does not free its distinct slot or consume another on reuse',()=>{
  const seven=modifiers.slice(0,7);let f=startDestinyRound(setup({hexed:1,'magic-tap':1,...owned(seven)}),0);
  f=fill(f,seven);f=use(f,'magic-tap');assert.equal(f.abilityQuota.used.length,8);
  f=rollDestinySpeed(f,rolls(3,3,1,2));assert.equal(f.used['magic-tap'],0);f=use(resume(f),'magic-tap');
  assert.equal(f.abilityQuota.used.length,8);assert.equal(f.abilityQuota.everUsed.filter(name=>name==='magic-tap').length,1);
});

test('Prowler itself consumes a slot but its listed abilities remain usable when the quota is full',()=>{
  const seven=modifiers.slice(0,7);let f=activate(setup({hexed:1,'prowler-set':1,evade:1,sidestep:1,...owned(seven)}),'prowler-set');
  f=fill(startDestinyRound(f,0),seven);f=resolveDestinySpeed(rollDestinySpeed(f,rolls(1,2,6,5)));
  f=use(f,'evade');assert.equal(f.abilityQuota.used.length,8);assert.ok(f.abilityQuota.everUsed.includes('evade'));
});

test('Volcanism exempts both active and passive listed abilities without exempting unrelated abilities',()=>{
  const seven=modifiers.slice(0,7);let f=activate(setup({hexed:1,'volcanism-set':1,'fire-aura':1,'fire-shield':1,sear:1,bleed:1,...owned(seven)}),'volcanism-set');
  f=fill(startDestinyRound(f,0),seven);f=activate(f,'fire-aura');f=activate(f,'fire-shield');f=use(f,'sear');
  assert.equal(f.abilityQuota.used.length,8);assert.equal(hasDestinyAbility(f,'fire-shield'),true);
  assert.throws(()=>activate(f,'bleed'),/ability limit/);
});

test('set selections grant abilities without creating equipment; passive grants still count when activated',()=>{
  let f=setup({hexed:1,'cistene-s-chattels-set':1,bless:1});
  assert.equal(f.abilities.miracle,1);assert.equal(hasDestinyAbility(f,'miracle'),false);assert.deepEqual(f.equipment,{});
  assert.throws(()=>activate(f,'cistene-s-chattels-set'),/available passive/);
  f=activate(f,'miracle');f=startDestinyRound(f,0);f=use(f,'bless',{attribute:'magic'});
  assert.equal(destinyStat(f,'hero','magic'),4);assert.deepEqual(f.abilityQuota.used,['miracle','bless']);
  const unhexed=setup({'faith-and-duty-set':1});assert.equal(hasDestinyAbility(unhexed,'redemption'),true);assert.equal(unhexed.abilityQuota,undefined);
});

test('invalid actions and unavailable passive weapons do not spend quota',()=>{
  const f=startDestinyRound(setup({hexed:1,'war-paint':1,'blood-thief':1}),0),before=resume(f);
  assert.throws(()=>use(f,'war-paint',{attribute:'speed'}),/allowed attribute/);
  assert.throws(()=>activate(f,'blood-thief'),/left-hand/);assert.deepEqual(f,before);
});

test('session passive activation and ally healing preserve independent per-hero quota snapshots',()=>{
  let f=attachDestinyAlly(setup({hexed:1,barbs:1,heal:1}),setup({hexed:1,bleed:1}));
  let s=applyDestinySessionAction(createDestinySession({fight:f}),'passive-activation',{name:'barbs',enabled:true});
  assert.deepEqual(s.fight.abilityQuota.used,['barbs']);assert.deepEqual(s.fight.allies[0].abilityQuota.used,[]);
  f=startDestinyRound(s.fight,0);f=use(f,'heal',{ally:0});
  assert.deepEqual(f.abilityQuota.used,['barbs','heal']);assert.deepEqual(f.allies[0].abilityQuota.used,[]);
});

test('Blood Sworn pays four Health per unused ability, exempts active or passive powers, and never creates gear',()=>{
  let f=startDestinyRound(setup({hexed:1,'blood-sworn-set':1,heal:1,barbs:1,...owned(modifiers)}),0);f=fill(f,modifiers);
  f=use(f,'blood-sworn-set',{ability:'heal'});assert.equal(f.hero.health,6);assert.deepEqual(f.abilityQuota.paidExempt,['heal']);
  f=use(f,'heal');assert.equal(f.hero.health,10);assert.equal(f.abilityQuota.used.length,8);
  f=use(f,'blood-sworn-set',{ability:'barbs'});f=activate(f,'barbs');assert.equal(f.hero.health,6);
  assert.equal(f.abilityQuota.used.length,8);assert.ok(f.abilityQuota.activePassives.includes('barbs'));assert.equal(f.used['blood-sworn-set'],2);
  const before=resume(f);assert.throws(()=>use(f,'blood-sworn-set',{ability:'heal'}),/unused ability/);assert.deepEqual(f,before);assert.deepEqual(f.equipment,{});
});

test('Blood Sworn rejects used, already funded, status and unavailable abilities without paying Health',()=>{
  let f=startDestinyRound(setup({hexed:1,'blood-sworn-set':1,heal:1,wisdom:1}),0);f=use(f,'wisdom');f=use(f,'blood-sworn-set',{ability:'heal'});
  for(const ability of ['wisdom','heal','hexed','blood-sworn-set','unknown']){
    const before=resume(f);assert.throws(()=>use(f,'blood-sworn-set',{ability}));assert.deepEqual(f,before);
  }
  f=startDestinyRound(setup({hexed:1,'blood-sworn-set':1,heal:1}),0);f.hero.health=3;const before=resume(f);
  assert.throws(()=>use(f,'blood-sworn-set',{ability:'heal'}),/Not enough Health/);assert.deepEqual(f,before);
});

test('Blood Sworn cannot use its final four Health to resurrect the caster through a funded healing ability',()=>{
  const f=startDestinyRound(setup({hexed:1,'blood-sworn-set':1,heal:1}),0);f.hero.health=4;
  const next=use(f,'blood-sworn-set',{ability:'heal'});assert.equal(next.status,'loss');assert.equal(next.hero.health,0);assert.equal(next.used.heal,undefined);
});

test('a pending enemy interception reserves its quota slot and cancelled abilities count as played',async()=>{
  const seven=modifiers.slice(1);let f=startDestinyRound(setup({hexed:1,wisdom:1,barbs:1,...owned(seven)}),0);f=fill(f,seven);
  f.encounter={abilityInterception:{name:'Ward',categories:['mo'],target:0,dice:1,cancelMaximum:2}};
  f=use(f,'wisdom',{},rolls(1));assert.throws(()=>activate(f,'barbs'),/ability limit/);
  const {resolveDestinyAbilityRoll}=await import('../../../public/js/battlesim/engines/destinyquest/ability-rolls.js');
  f=resolveDestinyAbilityRoll(f,rolls());assert.equal(f.used.wisdom,1);assert.equal(f.abilityQuota.used.length,8);
});
