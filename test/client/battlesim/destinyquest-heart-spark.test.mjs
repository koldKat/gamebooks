import test from 'node:test';
import assert from 'node:assert/strict';
import {HEART_ABILITIES as catalog} from '../../../public/js/battlesim/engines/destinyquest/heart-abilities.js';
import {createDestinyFight,startDestinyRound,rollDestinySpeed,resolveDestinySpeed,rollDestinyDamage,resolveDestinyDamage,endDestinyRound} from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {configureDestinyAbilities,useDestinyAbility as use} from '../../../public/js/battlesim/engines/destinyquest/abilities.js';
import {rerollDestinyScoreDice as reroll} from '../../../public/js/battlesim/engines/destinyquest/catalog-dice.js';
import {resolveDestinyAbilityRoll} from '../../../public/js/battlesim/engines/destinyquest/ability-rolls.js';
import {createDestinySession,applyDestinySessionAction} from '../../../public/js/battlesim/engines/destinyquest/session.js';
const rolls=(...values)=>()=>{assert.ok(values.length,'Unexpected die roll');return values.shift();};
const clone=f=>JSON.parse(JSON.stringify(f));
function setup(extra={}){
  return configureDestinyAbilities(createDestinyFight({speed:20,brawn:4,magic:0,armour:0,health:20,maxHealth:30},[{name:'Opponent',speed:0,brawn:0,armour:0,health:200}]),{'bright-spark':1,...extra},{},{catalog,bookRules:{deathMoves:false,deathPenalties:false}});
}
const win=f=>resolveDestinySpeed(rollDestinySpeed(startDestinyRound(f,0),rolls(6,5,1,2)));

test('Bright Spark activates once, permits independent score-die rerolls and persists through later rounds',()=>{
  let f=use(win(setup({compulsion:1,charm:1,'high-five':1})),'bright-spark');
  f=use(f,'compulsion');f=rollDestinyDamage(f,rolls(2,3));
  f=reroll(clone(f),[0],rolls(1));assert.deepEqual(f.turn.damageDice,[1,3]);
  assert.throws(()=>reroll(f,[0],rolls()),/Accepted/);
  assert.throws(()=>use(f,'charm',{die:0},rolls()),/Saved dice/);
  assert.throws(()=>use(f,'high-five',{die:0}),/Saved dice/);
  f=reroll(f,[1],rolls(6));assert.deepEqual(f.turn.damageDice,[1,6]);
  f=endDestinyRound(resolveDestinyDamage(f));f=rollDestinyDamage(win(clone(f)),rolls(3));
  f=reroll(f,[0],rolls(2));assert.deepEqual(f.turn.damageDice,[2]);assert.equal(f.used['bright-spark'],1);
  assert.throws(()=>use(f,'bright-spark'),/no uses left/);
});

test('score rerolls validate atomically and cannot affect enemy scores, saved dice or replacement damage',()=>{
  const inactive=rollDestinyDamage(win(setup()),rolls(2));assert.throws(()=>reroll(inactive,[0],rolls()),/unavailable/);
  let f=rollDestinyDamage(use(win(setup({trample:1})),'bright-spark'),rolls(2));const before=clone(f);
  for(const selected of [[],[0,0],[1],[-1]])assert.throws(()=>reroll(f,selected,rolls()));
  assert.deepEqual(f,before);
  f.turn.winner='opponent';assert.throws(()=>reroll(f,[0],rolls()),/unavailable/);
  f=use(use(win(setup({trample:1})),'bright-spark'),'trample',{deferDamage:true},rolls(1,2,3));
  assert.throws(()=>reroll(f,[0],rolls()),/unavailable/);
});

test('failed Elysium activation grants no rerolls, while a passed activation needs no fresh check for each die',()=>{
  for(const check of [1,2]){
    let f=use(win(setup({'elysium-soaked':1})),'bright-spark',{},rolls(check));
    f=resolveDestinyAbilityRoll(f,rolls());f=rollDestinyDamage(f,rolls(2));
    if(check===1){assert.throws(()=>reroll(f,[0],rolls()),/unavailable/);assert.equal(f.used['bright-spark'],undefined);}
    else{f=reroll(f,[0],rolls(5));assert.deepEqual(f.turn.damageDice,[5]);}
  }
});

test('session score-reroll settles health hazards and preserves accepted dice on save/resume',()=>{
  let f=rollDestinyDamage(use(win(setup()),'bright-spark'),rolls(2));
  f.encounter={heroRollFaces:[{kinds:['damage'],faces:[1],amount:30,name:'Hazard'}]};
  let session=createDestinySession();session.fight=f;
  session=applyDestinySessionAction(clone(session),'score-reroll',{dice:[0]}, {roll:rolls(1)});
  assert.equal(session.fight.hero.health,0);assert.equal(session.fight.status,'loss');
});
