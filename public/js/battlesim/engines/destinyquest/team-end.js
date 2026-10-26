import {endDestinyRound,reviveDestinyHero} from './core.js';
import {prepareDestinyEndEvents} from './encounter-events.js';
import {switchDestinyTeamHero} from './team-state.js';
import {consumeDestinyDefender} from './team-defender.js';
import {hasPendingDestinyPairs} from './team-pairs.js';
import {destinyPassiveEffects,destinyArmour,destinyPassiveProtection,damageDestinyHero,healDestinyHero,hasDestinyAbility,
  isDestinyOpponentActive,isDestinyOpponentDead,destinyDamageAllowed,reflectDestinyDamage,recordDestinyDefeat} from './effects.js';

const die=()=>Math.floor(Math.random()*6)+1;

// Collect every source before applying damage. Shared statuses tick once for
// their caster, while each hero keeps their own incoming statuses and healing.
export function endDestinyTeamRound(fight,roll=die){
  if(!fight.team||fight.status!=='active')throw new RangeError('An active team battle is required');
  if(hasPendingDestinyPairs(fight))throw new RangeError('Finish every independent combat before ending the team round');
  let next=switchDestinyTeamHero(fight,fight.team.roundWinner??fight.team.active);
  if(next.phase!=='end')throw new RangeError('Finish the team attack before ending the round');
  if(next.team.endAppliedRound===next.round)throw new RangeError('Team effects have already been applied this round');
  if(prepareDestinyEndEvents(next,roll))return next;
  const active=next.team.active,alive=next.opponents.map((_,target)=>isDestinyOpponentActive(next,target));
  const hits=[],opponentHealing=[],sources={},actuals={};
  for(const id of next.team.order){
    next=switchDestinyTeamHero(next,id);
    const effects=next.effects,encounterEnd=next.encounter.endEffects,abilities=next.abilities;
    if(id!==next.team.order[0])next.encounter.endEffects=encounterEnd?.filter(effect=>effect.target==='hero');
    if(next.hero.health<=0)next.abilities={};
    const emitted=[...destinyPassiveEffects(next,roll,{effectOwner:id}),...(next.turn?.encounterEndEffects||[])];
    next.effects=effects;next.abilities=abilities;
    if(encounterEnd===undefined)delete next.encounter.endEffects;else next.encounter.endEffects=encounterEnd;
    for(const effect of emitted){
      const hero=effect.target==='hero';
      if(!hero&&(!alive[effect.target]&&!effect.allowInactive||!destinyDamageAllowed(next,effect.target,'passive')))continue;
      let amount=Math.max(0,effect.amount-(effect.ignoreArmour?0:destinyArmour(next,effect.target)));
      if(hero)amount=destinyPassiveProtection(next,amount);
      hits.push({actor:id,target:effect.target,damage:amount,raw:effect.amount,ignoreArmour:effect.ignoreArmour,source:effect.source||''});
      if(!hero){const ledger=sources[effect.target]??={};ledger[effect.source||'']=(ledger[effect.source||'']||0)+amount;}
    }
    opponentHealing.push(...(next.turn?.encounterEndOpponentHealing||[]));
  }
  const opponentDamage=new Map(),remaining=new Map();
  for(const hit of hits){
    const redirect=next.team.passiveDefender;
    if(hit.target==='hero'&&hit.actor===redirect?.protectedActor&&hit.source===redirect.source&&hit.damage>0){
      next=switchDestinyTeamHero(next,redirect.actor);consumeDestinyDefender(next,hit.actor);
      hit.actor=redirect.actor;hit.damage=destinyPassiveProtection(next,Math.max(0,hit.raw-(hit.ignoreArmour?0:destinyArmour(next,'hero'))));
      delete next.team.passiveDefender;
    }
    next=switchDestinyTeamHero(next,hit.actor);
    next.history.push({type:'passive',round:next.round,target:hit.target,actor:hit.actor,damage:hit.damage,source:hit.source});
    if(hit.target==='hero'){
      let amount=hit.damage;
      if(next.phantomHealth>0){const absorbed=Math.min(next.phantomHealth,amount);next.phantomHealth-=absorbed;amount-=absorbed;}
      damageDestinyHero(next,amount);
    }else{
      const available=remaining.get(hit.target)??next.opponents[hit.target].health;
      const actual=Math.min(available,hit.damage);remaining.set(hit.target,available-actual);
      opponentDamage.set(hit.target,(opponentDamage.get(hit.target)||0)+actual);
      reflectDestinyDamage(next,hit.target,actual,'passive');
    }
  }
  for(const [target,amount] of opponentDamage){next.opponents[target].health-=amount;actuals[target]=amount;}
  for(const id of next.team.order){
    next=switchDestinyTeamHero(next,id);
    next.turn.passiveDamageByTarget={...actuals};next.turn.passiveSourcesByTarget=structuredClone(sources);
    reviveDestinyHero(next);
    const healing=next.effects.filter(effect=>effect.kind==='end-heal'&&effect.from<=next.round&&effect.until>=next.round).reduce((sum,effect)=>sum+effect.amount,0)+
      Object.entries(next.abilityCatalog||{}).reduce((sum,[name,spec])=>sum+(spec.endHeal&&hasDestinyAbility(next,name)?spec.endHeal:0),0)+(next.turn.encounterEndHealing||0);
    if(healing)healDestinyHero(next,healing);
  }
  for(const effect of opponentHealing)if(isDestinyOpponentActive(next,effect.target))next.opponents[effect.target].health=Math.min(next.opponents[effect.target].maxHealth,next.opponents[effect.target].health+effect.amount);
  next=switchDestinyTeamHero(next,active);
  for(const [target] of opponentDamage)if(isDestinyOpponentDead(next,target)){recordDestinyDefeat(next,target);next.turn.deaths.push(target);}
  next.team.endAppliedRound=next.round;
  delete next.team.passiveDefender;
  next=endDestinyRound(next,[],roll);
  next.team.stage=next.status==='active'&&next.phase==='start'?'start':next.phase;
  return next;
}
