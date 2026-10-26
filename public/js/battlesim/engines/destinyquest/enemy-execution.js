import {destinyAbsorbedCandidates} from './enemy-absorption.js';
import {createDestinyEnemyContext,projectDestinyEnemyContext,playDestinyEnemyAbility,resolveDestinyEnemyAbility} from './enemy-context.js';
import {applyDestinyRoundEvents} from './round-events.js';
import {continueDestinySustainedDamage,prepareDestinyStanceDefense} from './sustained.js';
import {captureDestinyEnemyBaseline} from './enemy-rebase.js';

function nativeAction(fight,action,roll,purpose){
  const view=createDestinyEnemyContext(fight),result=action(view,roll),next=structuredClone(fight);
  if(purpose==='repeat')next.enemyAbilityState.usedCategories.co=fight.round;
  if(purpose==='stance')next.enemyAbilityState.defenceRound=fight.round;
  if(result.phase==='ability-rolled'){
    next.enemyAbilityState.pending={view:result,returnPhase:fight.phase,purpose,baseline:captureDestinyEnemyBaseline(fight)};next.phase='enemy-ability';return next;
  }
  return projectDestinyEnemyContext(next,result);
}

// Validation failures may skip an unavailable ability. Once a die is drawn,
// failures propagate so scheduling never discards or rerolls a real result.
function attempt(action,roll){
  let drawn=false;
  try{return action(()=>{drawn=true;return roll();});}
  catch(error){if(error instanceof RangeError&&!drawn)return null;throw error;}
}

export function advanceDestinyEnemyAbilities(fight,roll=()=>Math.floor(Math.random()*6)+1){
  if(!fight.encounter?.enemyAbsorption||!fight.enemyAbilityState||fight.status!=='active'||!['speed','speed-rolled','damage','damage-rolled','end'].includes(fight.phase)||fight.turn?.pendingAbility)return fight;
  let next=structuredClone(fight),state=next.enemyAbilityState;
  if(state.roundPrepared!==next.round){
    const view=createDestinyEnemyContext(next);applyDestinyRoundEvents(view,{},roll);
    next=projectDestinyEnemyContext(next,view,{projectTurn:false});next.enemyAbilityState.roundPrepared=next.round;
  }
  if(next.status!=='active')return next;
  state=next.enemyAbilityState;
  if(next.turn.winner==='hero'&&next.phase==='damage'&&state.actor?.combatStance&&state.defenceRound!==next.round){
    return nativeAction(next,view=>{prepareDestinyStanceDefense(view,null,roll);return view;},roll,'stance');
  }
  if(next.phase==='damage'&&next.turn.winner!=='opponent'&&state.actor)delete state.actor.sustainedDamage;
  if(next.phase==='damage'&&next.turn.winner==='opponent'&&state.actor?.sustainedDamage&&state.usedCategories.co!==next.round){
    const repeat=attempt(draw=>nativeAction(next,(view,rng)=>continueDestinySustainedDamage(view,{deferDamage:true},rng),draw,'repeat'),roll);
    if(repeat)return repeat;
  }
  // At most one SP and one Co can activate in a single phase sweep.
  for(let step=0;step<2;step++){
    let played=null;
    for(const entry of destinyAbsorbedCandidates(next)){
      played=attempt(draw=>playDestinyEnemyAbility(next,entry,draw),roll);
      if(played)break;
    }
    if(!played)break;
    next=played;if(next.phase==='enemy-ability'||next.status!=='active')break;
  }
  return next;
}

export function resolveAndAdvanceDestinyEnemy(fight,roll){
  return advanceDestinyEnemyAbilities(resolveDestinyEnemyAbility(fight,roll),roll);
}
