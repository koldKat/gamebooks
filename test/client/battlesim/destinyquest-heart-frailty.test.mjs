import test from 'node:test';
import assert from 'node:assert/strict';
import {HEART_ABILITIES as catalog} from '../../../public/js/battlesim/engines/destinyquest/heart-abilities.js';
import {createDestinyFight,startDestinyRound,rollDestinySpeed,resolveDestinySpeed,rollDestinyDamage,resolveDestinyDamage} from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {configureDestinyAbilities} from '../../../public/js/battlesim/engines/destinyquest/abilities.js';
import {onDestinyHeroDice} from '../../../public/js/battlesim/engines/destinyquest/effects.js';
import {createDestinySession,beginDestinySession,applyDestinySessionAction as action} from '../../../public/js/battlesim/engines/destinyquest/session.js';
const rolls=(...values)=>()=>{assert.ok(values.length,'Unexpected die roll');return values.shift();};
const clone=f=>JSON.parse(JSON.stringify(f));
const hero={speed:20,brawn:4,magic:0,armour:0,health:20,maxHealth:30};
const foe={name:'Opponent',speed:0,brawn:0,armour:0,health:100};
const options={catalog,bookRules:{deathMoves:false,deathPenalties:false}};
const setup=()=>configureDestinyAbilities(createDestinyFight(hero,[foe]),{'curse-of-frailty':1},{},options);

test('Frailty lowers maximum and current Health by five, preserves wounds and cannot stack on setup edits',()=>{
  let f=setup();assert.equal(f.hero.health,15);assert.equal(f.hero.maxHealth,25);
  f=configureDestinyAbilities(clone(f),{'curse-of-frailty':1},{},options);assert.equal(f.hero.health,15);assert.equal(f.hero.maxHealth,25);
  f=configureDestinyAbilities(f,{},{},options);assert.equal(f.hero.health,20);assert.equal(f.hero.maxHealth,30);
});

test('only hero doubles lift Frailty; restored Health preserves subsequent wounds and removes the curse',()=>{
  let f=startDestinyRound(setup(),0);f=rollDestinySpeed(f,rolls(6,5,2,2));
  assert.equal(f.hero.health,15);assert.equal(f.hero.maxHealth,25);
  f.hero.health=8;onDestinyHeroDice(f,[3,3]);assert.equal(f.hero.health,13);assert.equal(f.hero.maxHealth,30);
  assert.equal(f.abilities['curse-of-frailty'],undefined);assert.deepEqual(f.clearedCurses,['curse-of-frailty']);
  onDestinyHeroDice(f,[4,4]);assert.equal(f.hero.health,13);assert.equal(f.hero.maxHealth,30);
  const dead=setup();dead.hero.health=0;onDestinyHeroDice(dead,[2,2]);assert.equal(dead.hero.health,0);
});

test('lifting rune curses updates the session setup so cleared curses do not return in the next fight',()=>{
  let s=beginDestinySession(createDestinySession(),{hero,opponents:[foe],abilities:{'curse-of-frailty':1,'curse-of-weakness':1,'curse-of-vulnerability':1}}, {...options,outcomeId:'first'});
  s=action(s,'start-round',{target:0});s=action(s,'roll-speed',{}, {roll:rolls(3,3,1,2)});
  assert.deepEqual(s.setup.abilities,{});assert.equal(s.fight.hero.health,20);assert.equal(s.fight.hero.maxHealth,30);
  s=action(s,'concede');s=action(s,'record-outcome');
  s=beginDestinySession(s,s.setup,{...options,outcomeId:'second'});
  assert.equal(s.fight.hero.maxHealth,30);assert.equal(s.fight.effects.some(effect=>effect.dispelOnDoubles),false);
});

test('persisting an uncleared Health curse stores unmodified setup Health so the next fight does not deduct twice',()=>{
  let s=beginDestinySession(createDestinySession(),{hero:{...hero,brawn:100},opponents:[foe],abilities:{'curse-of-frailty':1}}, {...options,outcomeId:'first'});
  s.fight.encounter={persistHeroHealth:true};
  s.fight=resolveDestinyDamage(rollDestinyDamage(resolveDestinySpeed(rollDestinySpeed(startDestinyRound(s.fight,0),rolls(6,5,1,2))),rolls(1)));
  assert.equal(s.fight.hero.health,25);s=action(s,'record-outcome');assert.equal(s.setup.hero.health,30);
  s=beginDestinySession(s,s.setup,{...options,outcomeId:'second'});assert.equal(s.fight.hero.health,25);assert.equal(s.fight.hero.maxHealth,25);
});
