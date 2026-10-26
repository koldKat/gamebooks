import {hasDestinyAbility,destinyAttackerTarget} from './effects.js';
import {checkDestinyAbilityQuota,recordDestinyQuotaAbility} from './ability-quota.js';
import {destinyTeamHero,switchDestinyTeamHero} from './team-state.js';

function validate(fight,actor){
  const hero=destinyTeamHero(fight,actor);
  if(fight.status!=='active'||hero.hero.health<=0||!hasDestinyAbility(hero,'defender')||hero.used.defender)throw new RangeError('Defender is unavailable');
  checkDestinyAbilityQuota(hero,'defender');
}

export function consumeDestinyDefender(fight,protectedActor){
  validate(fight,fight.team.active);
  recordDestinyQuotaAbility(fight,'defender');fight.used.defender=1;
  delete fight.sustainedDamage;
  fight.history.push({type:'ability',name:'defender',round:fight.round,actor:fight.team.active,protectedActor});
}

// Score attacks move with their rolled dice. The defender retains their own
// hero effects, armour, used-category flags and Health-hit consequences.
export function useDestinyTeamDefender(fight,actor,{type='score',source}={}){
  validate(fight,actor);
  if(type==='passive'){
    if(fight.team.endAppliedRound===fight.round||!['damage','end'].includes(fight.team.stage))throw new RangeError('Choose incoming passive damage before round end');
    if(typeof source!=='string'||!source)throw new RangeError('Choose a passive damage source');
    const protectedActor=fight.team.order.find(id=>id!==actor);
    if(destinyTeamHero(fight,protectedActor).hero.health<=0)throw new RangeError('Choose a living ally to defend');
    const next=structuredClone(fight);next.team.passiveDefender={actor,protectedActor,source};return next;
  }
  let next=structuredClone(fight),protectedActor;
  if(type==='event'){
    protectedActor=next.team.active;
    const pending=next.turn?.pendingAbility;
    if(next.phase!=='ability-rolled'||pending?.type!=='encounter'||pending.event.kind!=='enemy-dice-damage')throw new RangeError('Choose incoming enemy damage dice');
    if(actor===protectedActor)throw new RangeError('Defend another hero');
    const incoming=structuredClone(pending);delete next.turn.pendingAbility;
    next.phase=pending.returnPhase;
    const resume={actor:protectedActor,roundWinner:next.team.roundWinner,phase:pending.returnPhase,pending:incoming.suspendedAbility??null};
    delete incoming.suspendedAbility;
    next=switchDestinyTeamHero(next,actor);consumeDestinyDefender(next,protectedActor);
    next.turn.pendingAbility=incoming;next.phase='ability-rolled';next.team.defenderResume=resume;
    return next;
  }
  if(type!=='score')throw new RangeError('Choose score, event or passive damage');
  protectedActor=next.team.roundWinner;
  if(actor===protectedActor||!next.team.order.includes(protectedActor))throw new RangeError('Defend another hero');
  next=switchDestinyTeamHero(next,protectedActor);
  if(next.team.stage!=='damage'||next.turn.winner!=='opponent'||!['damage','damage-rolled'].includes(next.phase)||next.turn.avoidDamage)throw new RangeError('Choose an unresolved enemy attack');
  const incoming=structuredClone(next.turn),phase=next.phase;
  incoming.enemyAttackTarget=destinyAttackerTarget(next);
  next.turn.defendedBy=actor;next.phase='end';
  next=switchDestinyTeamHero(next,actor);
  const ownTurn=next.turn;
  if(next.team.independentRound)next.team.pairedDefenderResume={protectedActor,turn:structuredClone(ownTurn),phase:next.phase,roundWinner:next.team.roundWinner};
  next.turn={...incoming,used:{...ownTurn.used},heroSpeedDice:ownTurn.heroSpeedDice,
    lastHeroDamage:ownTurn.lastHeroDamage,passiveSourcesByTarget:ownTurn.passiveSourcesByTarget,passiveDamageByTarget:ownTurn.passiveDamageByTarget};
  next.phase=phase;consumeDestinyDefender(next,protectedActor);
  next.team.roundWinner=actor;next.team.defendedActor=protectedActor;
  return next;
}

export function resumeDestinyDefendedEvent(fight){
  const resume=fight.team?.defenderResume;
  if(!resume||fight.turn.pendingAbility||fight.status!=='active')return fight;
  let next=switchDestinyTeamHero(fight,resume.actor);
  next.phase=resume.phase;
  if(resume.pending)next.turn.pendingAbility=resume.pending;
  next.team.roundWinner=resume.roundWinner;delete next.team.defenderResume;
  return next;
}
