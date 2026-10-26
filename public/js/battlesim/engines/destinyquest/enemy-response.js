import {useDestinyAbility} from './abilities.js';

export function resumeDestinyEnemyResponse(fight){
  if(!fight.enemyAbilityState?.pending)return fight;
  if(fight.status!=='active'){delete fight.enemyAbilityState.pending;return fight;}
  const pending=fight.turn?.pendingAbility;
  if(pending?.enemyResponse){delete fight.turn.pendingAbility;fight.phase='enemy-ability';}
  else if(!pending&&fight.phase==='ability-rolled')fight.phase='enemy-ability';
  return fight;
}

export const isDestinyEnemyResponseAbility=spec=>!!spec&&!spec.heroDieFace&&!spec.requiresDamageRoll&&!spec.reroll;

// The panel and dispatcher use the same foreign-roll context. This is a
// transient view; creating it never consumes charges or changes saved state.
export function createDestinyEnemyResponse(fight){
  if(fight.phase!=='enemy-ability'||!fight.enemyAbilityState?.pending)throw new RangeError('No opponent ability response is pending');
  const next=structuredClone(fight),native=next.enemyAbilityState.pending.view.turn.pendingAbility;
  next.phase='ability-rolled';
  next.turn.pendingAbility={type:'encounter',name:native.name,enemyResponse:true,returnPhase:'enemy-ability',
    event:{kind:'enemy-dice-damage',owner:'opponent',damageDice:native.type==='damage',attacker:next.encounter.enemyAbsorption.target},
    dice:structuredClone(native.groups?.[0]?.dice??native.dice??[]),bonuses:{}};
  return next;
}

export function respondToDestinyEnemy(fight,name,options,roll){
  const spec=fight.abilityCatalog?.[name];
  if(spec&&!isDestinyEnemyResponseAbility(spec))throw new RangeError('This is an opponent roll, not your damage dice');
  const next=createDestinyEnemyResponse(fight);
  return resumeDestinyEnemyResponse(useDestinyAbility(next,name,options,roll));
}
