import {hasDestinyAbility,healDestinyHero,addDestinyStatEffect,applyDestinyAcceptedHeroRoll,isDestinyOpponentActive,destinyCategoryBlocked} from './effects.js';
import {destinyDie} from './damage.js';
import {recordDestinyQuotaAbility} from './ability-quota.js';

export function queueDestinyCombatModifiers(fight){
  for(const name of Object.keys(fight.abilities||{})){
    const action=fight.abilityCatalog?.[name]?.combatAbilityTrigger;
    if(action&&hasDestinyAbility(fight,name))(fight.turn.automaticModifiers??=[]).push({name,action:structuredClone(action)});
  }
}

function restore(fight,pending){
  fight.phase=pending.returnPhase;
  delete fight.turn.pendingAbility;
  if(pending.suspendedAbility)fight.turn.pendingAbility=pending.suspendedAbility;
}

function beginEffect(fight,pending,roll){
  recordDestinyQuotaAbility(fight,pending.name);
  delete fight.sustainedDamage;
  fight.history.push({type:'ability',name:pending.name,round:fight.round,automatic:true});
  if(pending.action.heal){healDestinyHero(fight,pending.action.heal);restore(fight,pending);return false;}
  pending.stage='effect';pending.dice=[destinyDie(roll)];
  fight.turn.pendingAbility=pending;fight.phase='ability-rolled';return true;
}

// Called only on the action's private fight copy, at the normal settlement
// boundary. It can suspend a damage roll without detaching it from its caster.
export function prepareDestinyAutomaticModifiers(fight,roll){
  if(fight.status!=='active'||fight.hero.health<=0||fight.encounter?.forcedLoss||fight.encounter?.forcedVictory||fight.phase==='ability-choice'||fight.turn?.pendingAbility?.type==='automatic-modifier'||!fight.opponents.some((_,target)=>isDestinyOpponentActive(fight,target)))return false;
  while(fight.turn?.automaticModifiers?.length){
    const event=fight.turn.automaticModifiers.shift();
    if(!hasDestinyAbility(fight,event.name)||fight.turn.failedAbilities?.includes(event.name))continue;
    const spec=fight.abilityCatalog[event.name];
    if(destinyCategoryBlocked(fight,spec.category))continue;
    const checks=Object.keys(fight.abilities).flatMap(name=>{
      const rule=fight.abilityCatalog[name]?.abilityCheck;
      return rule&&hasDestinyAbility(fight,name)&&(!rule.categories||rule.categories.includes(spec.category))&&(!rule.abilities||rule.abilities.includes(event.name))?[{name,rule:structuredClone(rule)}]:[];
    });
    const pending={type:'automatic-modifier',name:event.name,action:event.action,checks,checkIndex:0,returnPhase:fight.phase,
      suspendedAbility:fight.turn.pendingAbility?structuredClone(fight.turn.pendingAbility):null};
    if(checks.length){pending.stage='status';pending.dice=[destinyDie(roll)];fight.turn.pendingAbility=pending;fight.phase='ability-rolled';return true;}
    if(beginEffect(fight,pending,roll))return true;
  }
  return false;
}

export function resolveDestinyAutomaticModifier(fight,pending,roll){
  applyDestinyAcceptedHeroRoll(fight,pending.dice,'ability');
  if(fight.hero.health<=0||fight.encounter?.forcedLoss||fight.encounter?.forcedVictory){restore(fight,pending);return fight;}
  const result=pending.dice.reduce((sum,face)=>sum+face,0);
  if(pending.stage==='status'){
    const check=pending.checks[pending.checkIndex];
    fight.history.push({type:'ability-check',round:fight.round,name:pending.name,status:check.name,dice:[...pending.dice],result,automatic:true});
    if(result<=check.rule.cancelMaximum){(fight.turn.failedAbilities??=[]).push(pending.name);restore(fight,pending);return fight;}
    if(++pending.checkIndex<pending.checks.length){pending.dice=[destinyDie(roll)];fight.turn.pendingAbility=pending;fight.phase='ability-rolled';return fight;}
    beginEffect(fight,pending,roll);return fight;
  }
  fight.history.push({type:'ability-roll',round:fight.round,name:pending.name,dice:[...pending.dice],result,automatic:true});
  if(result===pending.action.face){pending.stage='choice';fight.turn.pendingAbility=pending;fight.phase='ability-choice';}
  else restore(fight,pending);
  return fight;
}

export function chooseDestinyAutomaticModifier(fight,attribute){
  const pending=fight?.turn?.pendingAbility;
  if(fight.status!=='active'||fight.phase!=='ability-choice'||pending?.type!=='automatic-modifier'||pending.stage!=='choice')throw new RangeError('No automatic modifier choice is pending');
  if(attribute!==null&&!pending.action.attributes.includes(attribute))throw new RangeError('Choose an allowed attribute or skip');
  const next=structuredClone(fight);
  if(attribute!==null)addDestinyStatEffect(next,'hero',attribute,pending.action.amount,null,pending.name);
  restore(next,next.turn.pendingAbility);return next;
}
