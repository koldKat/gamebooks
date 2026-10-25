import test from 'node:test';
import assert from 'node:assert/strict';
import {createWinterFight, configureWinterEncounter, resolveDestinyAbilityRoll as resolve} from './destinyquest-fixtures.mjs';
import {startDestinyRound, rollDestinySpeed, resolveDestinySpeed, endDestinyRound, skipDestinyDeathMove, settleDestinyFight}
  from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {destinyStrike, destinyStat, recordDestinyDefeat, hasDestinyAbility}
  from '../../../public/js/battlesim/engines/destinyquest/effects.js';
import {useDestinyAbility as use, destinyAbilitySpec, destinyUnusedAbilities}
  from '../../../public/js/battlesim/engines/destinyquest/abilities.js';

const rolls=(...v)=>()=>{assert.ok(v.length,'Unexpected dice');return v.shift();};
const make=(options={})=>createWinterFight({speed:30,brawn:20,magic:10,armour:99,health:30,maxHealth:50},777,options);
const start=options=>startDestinyRound(make(options),0,rolls());
const win=f=>resolveDestinySpeed(rollDestinySpeed(f,rolls(6,6,1,1)));
const end=f=>{f.phase='end';let r=endDestinyRound(f,[],rolls());return r.phase==='death-move'?skipDestinyDeathMove(r):r;};
const save=f=>JSON.parse(JSON.stringify(f));

test('source opponents and ally counts are loaded from encounter metadata',()=>{
  const fight=make();assert.deepEqual(fight.opponents.map(o=>[o.speed,o.brawn,o.armour,o.health]),[[13,10,18,120],[14,8,7,50],[13,6,6,60],[13,6,8,50]]);
  assert.equal(fight.abilities['rousing-blast'],1);assert.equal(fight.abilities['habroks-flock'],1);assert.equal(fight.abilities['storm-of-spears'],1);
  assert.equal(fight.abilities['nail-gun'],undefined);assert.equal(fight.abilities['dragon-fire'],undefined);
});

test('miasma heals the living boss by five, caps at 120 and stops when defeated',()=>{
  let fight=start();fight.opponents[0].health=118;fight=end(fight);assert.equal(fight.opponents[0].health,120);
  fight=startDestinyRound(fight,0,rolls());fight.opponents[0].health=100;destinyStrike(fight,1,50,'test');
  fight=end(fight);assert.equal(fight.opponents[0].health,100);
});

test('the collar deals two ignoring armour and its defeat permanently lowers boss armour by ten',()=>{
  let fight=end(start());assert.equal(fight.hero.health,28);fight=startDestinyRound(fight,0,rolls());
  destinyStrike(fight,3,50,'test');assert.equal(destinyStat(fight,0,'armour'),8);recordDestinyDefeat(fight,3);
  assert.equal(destinyStat(fight,0,'armour'),8);fight=end(save(fight));assert.equal(fight.hero.health,28);
  fight=startDestinyRound(fight,0,rolls());assert.equal(destinyStat(fight,0,'armour'),8);
});

test('rattles block speed but not ally modifiers, then release the block immediately on death',()=>{
  let fight=start({abilities:{radiance:1}});assert.throws(()=>use(fight,'radiance',{},rolls()),/blocking/);
  fight=use(fight,'rousing-blast',{attribute:'brawn'},rolls());assert.equal(fight.used['rousing-blast'],1);
  destinyStrike(fight,2,60,'test');assert.equal(use(fight,'radiance',{},rolls()).used.radiance,1);
});

for(const attribute of ['brawn','magic'])test('Rousing blast boosts '+attribute+' for one round and restores four health once',()=>{
  let fight=start();const normal=destinyStat(fight,'hero',attribute);fight=use(fight,'rousing-blast',{attribute},rolls());
  assert.equal(destinyStat(fight,'hero',attribute),normal+4);assert.equal(fight.hero.health,34);
  assert.throws(()=>use(fight,'rousing-blast',{attribute},rolls()),/no uses/);
  fight=startDestinyRound(end(fight),0,rolls());assert.equal(destinyStat(fight,'hero',attribute),normal);
});

test('invalid Rousing blast choices do not spend the ally ability or change health',()=>{
  const fight=start(),before=structuredClone(fight);assert.throws(()=>use(fight,'rousing-blast',{attribute:'armour'},rolls()),/allowed attribute/);
  assert.deepEqual(fight,before);
});

test('Habrok restores an already used speed ability while preserving the per-round slot',()=>{
  let fight=start({abilities:{radiance:1}});destinyStrike(fight,2,60,'test');fight=use(fight,'radiance',{},rolls());
  fight=use(fight,'habroks-flock',{restore:'radiance'},rolls());assert.equal(fight.used.radiance,0);
  assert.throws(()=>use(fight,'radiance',{},rolls()),/Only one/);
  fight=startDestinyRound(end(fight),0,rolls());assert.equal(use(fight,'radiance',{},rolls()).used.radiance,1);
});

test('Habrok refuses unused and modifier abilities without spending its use',()=>{
  let fight=start({abilities:{radiance:1}});assert.throws(()=>use(fight,'habroks-flock',{restore:'radiance'},rolls()),/already used/);
  fight=use(fight,'rousing-blast',{attribute:'magic'},rolls());assert.throws(()=>use(fight,'habroks-flock',{restore:'rousing-blast'},rolls()),/required type/);
  assert.equal(fight.used['habroks-flock'],undefined);
});

test('Storm of spears rolls independent pairs for all opponents, ignores armour and replaces damage',()=>{
  let fight=win(start());fight=use(fight,'storm-of-spears',{},rolls(1,2,3,4,5,6,1,1));
  assert.deepEqual(fight.opponents.map(o=>o.health),[117,43,49,48]);assert.equal(fight.phase,'end');
  assert.equal(fight.turn.used.co,true);assert.equal(fight.used['storm-of-spears'],1);
});

test('deferred spear rolls survive saves and Habrok can restore the granted combat ability',()=>{
  let fight=use(win(start()),'storm-of-spears',{deferDamage:true},rolls(1,2,3,4,5,6,1,1));
  assert.equal(fight.phase,'ability-rolled');assert.deepEqual(fight.turn.pendingAbility.groups.map(g=>g.dice),[[1,2],[3,4],[5,6],[1,1]]);
  fight=resolve(save(fight),rolls());fight=use(fight,'habroks-flock',{restore:'storm-of-spears'},rolls());
  assert.equal(fight.used['storm-of-spears'],0);assert.throws(()=>use(fight,'storm-of-spears',{},rolls()),/unavailable/);
  fight=win(startDestinyRound(end(fight),0,rolls()));assert.equal(use(fight,'storm-of-spears',{},rolls(1,1,1,1,1,1,1,1)).used['storm-of-spears'],1);
});

test('summoned attacks require their own items, retain the printed alias, and do not stack uses',()=>{
  const character={items:['captains-conch','dragons-horn'],gold:12},before=structuredClone(character);
  const fight=make({character,abilities:{'nail-gun':1,'dragon-fire':1},equipment:{transport:{stability:0,toughness:0,abilities:['nail-gun','dragon-fire']}}});
  assert.equal(hasDestinyAbility(fight,'nail-gun'),true);assert.equal(hasDestinyAbility(fight,'dragon-fire'),true);
  assert.equal(fight.abilities['nail-gun'],1);assert.equal(fight.abilities['dragon-fire'],1);
  assert.equal(fight.encounter.grantedAbilities['dragon-fire'].label,'Dragon’s breath');assert.equal(fight.encounter.grantedAbilities['dragon-fire'].definitionSection,'759');
  assert.deepEqual(character,before);assert.deepEqual(fight.character.items,before.items);
  const noItem=make({abilities:{'nail-gun':1},equipment:{transport:{stability:0,toughness:0,abilities:['nail-gun']}}});
  assert.equal(hasDestinyAbility(noItem,'nail-gun'),false);
});

test('conch and horn independently grant their associated attacks',()=>{
  assert.equal(make({character:{items:['captains-conch']}}).abilities['dragon-fire'],undefined);
  assert.equal(make({character:{items:['dragons-horn']}}).abilities['nail-gun'],undefined);
  assert.equal(make({character:{items:['not-dragons-horn']}}).abilities['dragon-fire'],undefined);
});

test('summoned nail gun damages one foe and lowers its armour',()=>{
  let fight=win(start({character:{items:['captains-conch']}}));fight=use(fight,'nail-gun',{target:0},rolls(3,4));
  assert.equal(fight.opponents[0].health,113);assert.equal(destinyStat(fight,0,'armour'),16);
  assert.equal(fight.used['nail-gun'],1);
});

test('summoned Nidhogg uses the explicit section 759 attack: three dice chosen, one each other',()=>{
  let fight=win(start({character:{items:['dragons-horn']}}));fight=use(fight,'dragon-fire',{target:0},rolls(1,2,3,4,5,6));
  assert.deepEqual(fight.opponents.map(o=>o.health),[114,46,55,44]);assert.equal(fight.used['dragon-fire'],1);
});

test('boss defeat wins immediately without destroying surviving support enemies or reviving the boss',()=>{
  const fight=start();destinyStrike(fight,0,120,'test');settleDestinyFight(fight,rolls());assert.equal(fight.status,'win');
  assert.deepEqual(fight.opponents.map(o=>o.health),[0,50,60,50]);assert.equal(fight.history.filter(e=>e.type==='outcome').length,1);
  assert.throws(()=>endDestinyRound(fight,[],rolls()),/unavailable/);
});

test('granted ability definitions and values remain editable encounter metadata',()=>{
  let fight=start();const grant=fight.encounter.grantedAbilities['rousing-blast'];grant.spec.amount=7;grant.spec.heal=2;
  assert.equal(destinyAbilitySpec(fight,'rousing-blast').amount,7);assert.ok(destinyUnusedAbilities(fight).includes('rousing-blast'));
  fight=use(fight,'rousing-blast',{attribute:'magic'},rolls());assert.equal(destinyStat(fight,'hero','magic'),17);assert.equal(fight.hero.health,32);
});

test('changing setup removes encounter grants while preserving originally owned ability counts',()=>{
  let fight=make({character:{items:['captains-conch']}});
  fight=configureWinterEncounter(save(fight),752);assert.equal(fight.abilities['nail-gun'],undefined);
  assert.equal(fight.abilities['rousing-blast'],undefined);
  fight=make({character:{items:['captains-conch']},abilities:{'nail-gun':1}});
  fight=configureWinterEncounter(save(fight),752);assert.equal(fight.abilities['nail-gun'],1);
});
