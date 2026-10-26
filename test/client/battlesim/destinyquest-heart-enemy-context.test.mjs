import test from 'node:test';
import assert from 'node:assert/strict';
import {createDestinyFight,createDestinyTurn} from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {configureDestinyAbilities} from '../../../public/js/battlesim/engines/destinyquest/abilities.js';
import {HEART_ABILITIES as catalog} from '../../../public/js/battlesim/engines/destinyquest/heart-abilities.js';
import {captureDestinyAbsorbedAbility} from '../../../public/js/battlesim/engines/destinyquest/enemy-absorption.js';
import {createDestinyEnemyContext,playDestinyEnemyAbility,resolveDestinyEnemyAbility,destinyEnemyTurn} from '../../../public/js/battlesim/engines/destinyquest/enemy-context.js';
import {destinyStat,addDestinyStatEffect,destinyDamageScore} from '../../../public/js/battlesim/engines/destinyquest/effects.js';
const rolls=(...values)=>()=>{assert.ok(values.length,'Unexpected die roll');return values.shift();};
function setup(name,{abilities={},enemyHealth=100}={}){
  const f=configureDestinyAbilities(createDestinyFight({speed:20,brawn:8,magic:3,armour:10,health:60,maxHealth:60},[{name:'Enemy',speed:15,brawn:12,magic:null,armour:16,health:100}]),abilities,{mainHand:{name:'Original sword',type:'sword'}},{catalog,bookRules:{deathMoves:false,deathPenalties:false}});
  f.encounter={enemyAbsorption:{target:0,categories:['sp','co'],delayRounds:1,ignoreWeaponCareerRequirements:true},growingStatusOnHit:{target:0,kinds:['score','dice'],name:'Boiling blood',increment:1,maximum:4}};
  f.round=1;captureDestinyAbsorbedAbility(f,name,catalog[name]);f.round=2;f.opponents[0].health=enemyHealth;
  const spec=catalog[name];f.phase=spec.phases.includes('speed')?'speed':spec.phases[0];f.turn=createDestinyTurn();
  f.turn.winner=spec.enemyWon?'hero':'opponent';f.turn.heroSpeedDice=[5,6];f.turn.opponentSpeedDice=[3,4];f.turn.healthDamage=4;
  return f;
}
const play=(f,...dice)=>playDestinyEnemyAbility(f,f.enemyAbilityState.queue[0],rolls(...dice));

test('copied self buffs and enemy debuffs affect the correct side without changing the input or player inventory',()=>{
  for(const [name,heroSpeed,enemySpeed] of [['fearless',20,17],['radiance',18,15],['tremor-strike',18,15],['time-shift',20,20]]){
    const original=setup(name,{abilities:{cunning:1}}),before=structuredClone(original),f=play(original);
    assert.deepEqual(original,before);assert.equal(destinyStat(f,'hero','speed'),heroSpeed);assert.equal(destinyStat(f,0,'speed'),enemySpeed);
    assert.deepEqual(f.equipment,before.equipment);assert.deepEqual(f.abilities,before.abilities);
    assert.equal(f.enemyAbilityState.queue[0].used,true);
  }
});

test('copied dice controls remain in the opponent turn and never overwrite the player turn',()=>{
  let f=play(setup('immobilise'));assert.equal(destinyEnemyTurn(f).opponentSpeedReduction,1);
  assert.equal(f.turn.opponentSpeedReduction,undefined);assert.equal(destinyEnemyTurn(f).controlTriggers.length,1);
  f=play(setup('haste'));assert.equal(destinyEnemyTurn(f).heroSpeedCount,3);assert.equal(f.turn.heroSpeedCount,undefined);
});

test('copied damage-score modifiers stay on the opponent and self-sacrifice costs the opponent Health',()=>{
  let f=play(setup('dark-pact'));assert.equal(f.opponents[0].health,96);assert.equal(f.hero.health,60);
  f.turn.damageDice=[4];const view=createDestinyEnemyContext(f);assert.equal(destinyDamageScore(view),20);
  assert.equal(f.turn.damageScoreBonus,undefined);
  f=play(setup('piercing'));assert.equal(destinyEnemyTurn(f).ignoreArmour,true);assert.equal(f.turn.ignoreArmour,undefined);
  f=play(setup('fatal-blow'));assert.equal(destinyEnemyTurn(f).halfArmour,true);
});

test('copied direct damage respects player shields, triggers Lightning only on actual damage and starts Boiling Blood',()=>{
  for(const [shield,health,enemyHealth] of [[0,51,98],[5,56,98],[20,60,100]]){
    const original=setup('rake',{abilities:{lightning:1}});original.portableShieldHealth=shield;
    const f=play(original,2,3,4);assert.equal(f.hero.health,health);assert.equal(f.opponents[0].health,enemyHealth);
    assert.equal(!!f.encounter.growingStatus,shield<9);assert.equal(f.equipment.mainHand.type,'sword');
  }
});

test('copied avoidance and attack reversal preserve the real player identity',()=>{
  let f=play(setup('dodge'));assert.equal(destinyEnemyTurn(f).avoidDamage,true);assert.equal(f.turn.winner,'hero');
  f=play(setup('command'));assert.equal(f.turn.winner,'opponent');assert.equal(f.hero.brawn,8);assert.equal(f.opponents[0].brawn,12);
});

test('copied Primal can grant a new combat Magic bonus without inventing printed Magic',()=>{
  const f=play(setup('primal'));
  assert.equal(f.opponents[0].magic,null);assert.equal(destinyStat(f,0,'brawn'),14);
  assert.equal(destinyStat(createDestinyEnemyContext(f),'hero','magic'),2);assert.equal(f.hero.magic,3);
});

test('pending copied damage survives save/resume and applies buffs and damage exactly once',()=>{
  let f=play(setup('thorn-armour'),4);assert.equal(f.phase,'enemy-ability');assert.equal(f.hero.health,60);
  assert.equal(f.enemyAbilityState.pending.view.turn.pendingAbility.type,'damage');
  f=resolveDestinyEnemyAbility(JSON.parse(JSON.stringify(f)),rolls());
  assert.equal(f.hero.health,56);assert.equal(destinyStat(f,0,'armour'),19);
  assert.equal(f.effects.filter(e=>e.source==='thorn-armour'&&e.kind==='stat').length,1);
  assert.throws(()=>resolveDestinyEnemyAbility(f,rolls()),/pending/);
});

test('copied table rolls can pause again for damage without duplicating their healing',()=>{
  let f=play(setup('ley-line-infusion',{enemyHealth:60}),6);assert.equal(f.phase,'enemy-ability');
  f=resolveDestinyEnemyAbility(JSON.parse(JSON.stringify(f)),rolls(4));assert.equal(f.phase,'enemy-ability');
  f=resolveDestinyEnemyAbility(JSON.parse(JSON.stringify(f)),rolls());
  assert.equal(f.opponents[0].health,68);assert.equal(f.hero.health,56);
});

test('actual player buffs never become opponent buffs while the enemy context is built',()=>{
  const original=setup('fearless');addDestinyStatEffect(original,'hero','brawn',20,null,'cunning');
  original.effects.push({kind:'score-per-die',amount:8,from:1,until:100,source:'test'});
  const f=play(original);f.turn.winner='opponent';f.turn.damageDice=[4];
  assert.equal(destinyDamageScore(createDestinyEnemyContext(f)),16);assert.equal(destinyStat(f,'hero','brawn'),28);
});

test('copied summons damage the player and their doubles-removal belongs to the opponent',()=>{
  const f=play(setup('packmaster'));
  const summon=f.effects.find(effect=>effect.source==='packmaster');assert.equal(summon.target,'hero');assert.equal(summon.dispelBy,'opponent');
  assert.equal(summon.amount,2);assert.equal(f.hero.health,60);
});

test('a player revival after copied lethal damage does not record a false battle outcome',()=>{
  const original=setup('rake');original.hero.health=1;
  original.abilityCatalog['test-revival']={category:'pa',phases:[],reviveHealth:5,cleanseOnRevive:true};original.abilities['test-revival']=1;
  const f=play(original,2,3,4);assert.equal(f.status,'active');assert.equal(f.hero.health,5);assert.equal(f.used['test-revival'],1);
  assert.equal(f.history.filter(e=>e.type==='outcome').length,0);assert.equal(f.encounter.growingStatus,undefined);
});
