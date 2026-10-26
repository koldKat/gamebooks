import {hasDestinyAbility,addDestinyStatEffect,applyDestinyHeroRoll,applyDestinyAcceptedHeroRoll} from './effects.js';
import {prepareDestinyDamage,destinyDie} from './damage.js';
import {finishDestinyAbilityAction} from './ability-rolls.js';
import {queueDestinyEncounterEvent} from './encounter-events.js';
import {queueDestinyCombatModifiers} from './automatic-modifiers.js';

export function startDestinySustainedAbility(fight,name,spec,options){
  if(spec.repeatDamage)fight.sustainedDamage={name,target:options.target??fight.target,index:0,round:fight.round};
  if(spec.combatStance){
    const passives=Object.keys(fight.abilities).filter(ability=>{
      const rule=fight.encounter?.grantedAbilities?.[ability]?.spec??fight.abilityCatalog[ability];
      return rule?.category==='pa'&&rule.phases.length===0&&hasDestinyAbility(fight,ability);
    });
    fight.combatStance={name,...structuredClone(spec.combatStance),passives};
    addDestinyStatEffect(fight,'hero','speed',spec.combatStance.speed,null,name);
  }
}

export function continueDestinySustainedDamage(fight,options={},roll=()=>Math.floor(Math.random()*6)+1){
  const chain=fight?.sustainedDamage,spec=fight?.abilityCatalog?.[chain?.name];
  if(fight?.status!=='active'||fight.phase!=='damage'||fight.turn.winner!=='hero'||fight.turn.used.co||!chain||chain.round!==fight.round-1||chain.target!==fight.target||!hasDestinyAbility(fight,chain.name)||chain.index+1>=spec.repeatDamage.length)throw new RangeError('No consecutive ability attack is available');
  if(options.target!==undefined&&options.target!==chain.target)throw new RangeError('Continue against the same opponent');
  const next=structuredClone(fight),current=next.sustainedDamage;
  current.index++;current.round=next.round;next.turn.used.co=true;
  prepareDestinyDamage(next,current.name,{...spec,dice:spec.repeatDamage[current.index]}, {...options,target:current.target},roll);
  next.turn.normalDamageReplaced=true;
  queueDestinyCombatModifiers(next);
  if(next.phase!=='ability-rolled')next.phase='end';
  next.history.push({type:'ability-repeat',name:current.name,round:next.round,target:current.target,dice:spec.repeatDamage[current.index]});
  return finishDestinyAbilityAction(next,roll);
}

export function removeDestinyCombatStance(fight){
  if(fight?.status!=='active'||!fight.combatStance||fight.phase!=='damage'||fight.turn.winner!=='hero')throw new RangeError('Win a round and forgo its damage to remove this stance');
  const next=structuredClone(fight),name=next.combatStance.name;
  next.effects=next.effects.filter(effect=>effect.source!==name);
  delete next.combatStance;next.turn.normalDamageReplaced=true;next.phase='end';
  next.history.push({type:'stance-ended',name,round:next.round});
  return next;
}

export function prepareDestinyStanceDefense(fight,event,roll){
  const stance=fight.combatStance;
  if(!stance?.avoidMaximum||fight.turn.winner!=='opponent')return false;
  fight.turn.pendingAbility={type:'stance-defense',name:stance.name,maximum:stance.avoidMaximum,returnPhase:'damage',followUp:event?structuredClone(event):null,dice:applyDestinyHeroRoll(fight,[destinyDie(roll)],'ability')};
  fight.phase='ability-rolled';return true;
}

export function resolveDestinyStanceDefense(fight,pending,roll){
  applyDestinyAcceptedHeroRoll(fight,pending.dice,'ability');
  if(fight.encounter?.forcedLoss||fight.encounter?.forcedVictory){fight.phase=pending.returnPhase;return fight;}
  const avoided=pending.dice.reduce((sum,face)=>sum+face,0)<=pending.maximum;
  fight.history.push({type:'stance-defense',name:pending.name,round:fight.round,dice:[...pending.dice],avoided});
  fight.phase=avoided?'end':pending.returnPhase;
  if(!avoided&&pending.followUp&&fight.hero.health>0)queueDestinyEncounterEvent(fight,pending.followUp,fight.phase,roll);
  return fight;
}
