import {hasDestinyAbility,applyDestinyAcceptedHeroRoll} from './effects.js';
import {destinyDie} from './damage.js';

export function clearDestinyAbilityChecks(fight,name){
  if(fight.turn.passedStatusChecks){
    delete fight.turn.passedStatusChecks[name];
    if(!Object.keys(fight.turn.passedStatusChecks).length)delete fight.turn.passedStatusChecks;
  }
}

// A status check is separate from spending an ability. Failed attempts can be
// blocked for the round without consuming a combat-wide charge or quota slot.
export function prepareDestinyAbilityCheck(fight,name,spec,options,roll){
  if(fight.turn.failedAbilities?.includes(name))throw new RangeError('This ability failed and cannot be retried this round');
  for(let pending=fight.turn.pendingAbility;pending;pending=pending.suspendedAbility)if(pending.type==='ability-check'&&pending.ability===name)throw new RangeError('Resolve this ability check before using it again');
  for(const status of Object.keys(fight.abilities||{})){
    const rule=fight.abilityCatalog?.[status]?.abilityCheck;
    if(!rule||!hasDestinyAbility(fight,status)||rule.categories&&!rule.categories.includes(spec.category)||rule.abilities&&!rule.abilities.includes(name)||fight.turn.passedStatusChecks?.[name]?.includes(status))continue;
    const next=structuredClone(fight);
    next.turn.pendingAbility={type:'ability-check',name:status,rule:structuredClone(rule),ability:name,abilityOptions:structuredClone(options),returnPhase:fight.phase,
      suspendedAbility:fight.turn.pendingAbility?structuredClone(fight.turn.pendingAbility):null,dice:[destinyDie(roll)]};
    next.phase='ability-rolled';return next;
  }
  return null;
}

export function resolveDestinyAbilityCheck(fight,pending,roll,useAbility){
  applyDestinyAcceptedHeroRoll(fight,pending.dice,'ability');
  const result=pending.dice.reduce((sum,face)=>sum+face,0);
  fight.history.push({type:'ability-check',round:fight.round,name:pending.ability,status:pending.name,dice:[...pending.dice],result});
  fight.phase=pending.returnPhase;
  if(pending.suspendedAbility)fight.turn.pendingAbility=pending.suspendedAbility;
  if(fight.hero.health<=0||fight.encounter?.forcedLoss||fight.encounter?.forcedVictory)return fight;
  if(result>pending.rule.cancelMaximum){
    ((fight.turn.passedStatusChecks??={})[pending.ability]??=[]).push(pending.name);
    return useAbility(fight,pending.ability,pending.abilityOptions,roll);
  }
  clearDestinyAbilityChecks(fight,pending.ability);
  (fight.turn.failedAbilities??=[]).push(pending.ability);
  if(pending.rule.blockCategoryOnFailure){
    const category=fight.abilityCatalog[pending.ability].category;
    fight.turn.used[category]=true;
  }
  return fight;
}
