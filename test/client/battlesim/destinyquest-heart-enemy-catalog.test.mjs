import test from 'node:test';
import assert from 'node:assert/strict';
import {createDestinyFight,createDestinyTurn} from '../../../public/js/battlesim/engines/destinyquest/core.js';
import {configureDestinyAbilities} from '../../../public/js/battlesim/engines/destinyquest/abilities.js';
import {HEART_ABILITIES as catalog} from '../../../public/js/battlesim/engines/destinyquest/heart-abilities.js';
import {captureDestinyAbsorbedAbility,destinyAbsorbedCandidates} from '../../../public/js/battlesim/engines/destinyquest/enemy-absorption.js';
import {playDestinyEnemyAbility,resolveDestinyEnemyAbility} from '../../../public/js/battlesim/engines/destinyquest/enemy-context.js';
import {addDestinyStatEffect} from '../../../public/js/battlesim/engines/destinyquest/effects.js';

for(const [name,spec] of Object.entries(catalog).filter(([,spec])=>['sp','co'].includes(spec.category)))test('opponent copy supports the printed prerequisites of '+name,()=>{
  const original=configureDestinyAbilities(createDestinyFight({speed:20,brawn:8,magic:4,armour:10,health:500,maxHealth:500},[{speed:15,brawn:12,magic:null,armour:16,health:1000}]),{heal:1},{mainHand:{type:'sword'}},{catalog,bookRules:{deathMoves:false,deathPenalties:false}});
  original.encounter={enemyAbsorption:{target:0,categories:['sp','co'],delayRounds:1,ignoreWeaponCareerRequirements:true}};
  original.round=1;captureDestinyAbsorbedAbility(original,name,spec);original.round=2;original.phase=spec.phases[0];
  original.turn=createDestinyTurn();original.turn.winner=spec.enemyWon||spec.afterEnemyHit?'hero':'opponent';original.turn.healthDamage=5;
  original.turn.heroSpeedDice=[5,6];original.turn.opponentSpeedDice=[3,4];
  if(spec.firstRound||spec.requiresCompanion){
    assert.deepEqual(destinyAbsorbedCandidates(original),[]);assert.throws(()=>playDestinyEnemyAbility(original,original.enemyAbilityState.queue[0],()=>3),RangeError);return;
  }
  if(spec.requiresControlTrigger){
    const turn=createDestinyTurn();turn.controlTriggers=[{name:'immobilise',target:0}];
    original.enemyAbilityState.actor={round:2,turn,effects:[],abilities:{},used:{}};
  }
  // A copied Magic-based attack can become usable after an earlier copied
  // Magic buff; the printed missing Magic stat itself remains null.
  if(spec.advanced&&spec.replacement)addDestinyStatEffect(original,0,'magic',2,null,'wish-master');
  const before=structuredClone(original);
  let result=playDestinyEnemyAbility(original,original.enemyAbilityState.queue[0],()=>3),pauses=0;
  while(result.phase==='enemy-ability'){
    assert.ok(++pauses<=4,'Unexpected extra pending stage');result=resolveDestinyEnemyAbility(JSON.parse(JSON.stringify(result)),()=>3);
  }
  assert.deepEqual(original,before);assert.equal(result.enemyAbilityState.queue[0].used,true);
  assert.deepEqual(result.abilities,before.abilities);assert.deepEqual(result.equipment,before.equipment);
  assert.equal(result.hero.name,before.hero.name);assert.equal(result.opponents[0].magic,null);
});
