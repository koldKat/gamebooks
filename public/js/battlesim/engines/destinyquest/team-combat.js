import {startDestinyRound,createDestinyTurn,rollDestinySpeed,acceptDestinySpeedRoll,resolveDestinySpeed,settleDestinyFight,rollDestinyDamage,resolveDestinyDamage,continueDestinyCombat} from './core.js';
import {resetDestinyCombatActor} from './combat-reset.js';
import {resolveDestinyAbilityRoll} from './ability-rolls.js';
import {useDestinyAbility} from './abilities.js';
import {destinyStat,destinyAttackerTarget} from './effects.js';
import {setDestinyTeamRoles,destinyTeamHero,switchDestinyTeamHero,destinyTeamEnemyTarget} from './team-state.js';
import {useDestinyTeamDefender,resumeDestinyDefendedEvent} from './team-defender.js';
import {startDestinyPairedRound,startDestinySiegeRound,advanceDestinyPairedRound,rollDestinyPairedSpeed,resolveDestinyPairedSpeed} from './team-pairs.js';

function shareChangedOpponentDice(fight,before){
  if(fight.team.independentRound)return fight;
  const dice=fight.turn?.opponentSpeedDice;
  if(!fight.team.opponentDice||!Array.isArray(dice)||!Array.isArray(before)||dice.length===before.length&&dice.every((face,index)=>face===before[index]))return fight;
  fight.team.opponentDice=[...dice];
  for(const ally of fight.allies)if(ally.turn?.opponentSpeedDice)ally.turn.opponentSpeedDice=[...dice];
  return fight;
}

export function startDestinyTeamRound(fight,roles,target,roll){
  if(!fight.team||fight.status!=='active'||fight.phase!=='start')throw new RangeError('Choose team roles before a round');
  if(fight.encounter?.pairedTeam&&!fight.team.pairing?.resolved)return startDestinyPairedRound(fight,roles,roll);
  if(fight.encounter?.siegeTeam){
    const boss=fight.encounter.siegeTeam.bossTarget;
    if(target&&typeof target==='object'){
      if(fight.team.order.some(id=>roles[id]==='attack'&&target[id]!==boss))return startDestinySiegeRound(fight,roles,target,roll);
      target=boss;
    }
    if(target!==boss)throw new RangeError('Assign a boss attacker before choosing shrine attacks');
  }
  const living=fight.team?.order.filter(id=>destinyTeamHero(fight,id).hero.health>0)||[];
  if(living.length===1&&(fight.team.stunnedUntil?.[living[0]]??-1)>=fight.round+1){
    const lost=structuredClone(fight);lost.encounter.forcedLoss=true;settleDestinyFight(lost,roll);lost.team.stage=lost.phase;return lost;
  }
  let next=setDestinyTeamRoles(fight,roles);
  delete next.team.independentRound;delete next.team.targetsByActor;
  if(next.hero.health<=0){next=switchDestinyTeamHero(next,roles.indexOf('attack'));next.phase='start';}
  next=startDestinyRound(next,target,roll);
  for(const ally of next.allies){ally.turn=createDestinyTurn();ally.phase='speed';}
  next.team.stage='speed';next.team.rolled=[];next.team.opponentDice=null;
  delete next.team.speedChoices;delete next.team.roundWinner;
  return next;
}

export function continueDestinyTeamCombat(fight){
  if(!fight.team||fight.status!=='active'||fight.phase!=='between-combats')throw new RangeError('No following team combat is pending');
  const oldRound=fight.round,stuns=structuredClone(fight.team.stunnedUntil||{});
  let next=switchDestinyTeamHero(fight,0);next.phase='between-combats';
  next=continueDestinyCombat(next);if(next.status!=='active')return next;
  for(const id of next.team.order.filter(id=>id!==0)){
    next=switchDestinyTeamHero(next,id);resetDestinyCombatActor(next,next.encounter.consecutiveCombats);
  }
  next=switchDestinyTeamHero(next,0);next.team.stage='start';next.team.roles=null;next.team.rolled=[];next.team.opponentDice=null;
  next.team.lastDamageByTarget={};delete next.team.endAppliedRound;delete next.team.roundWinner;delete next.team.speedChoices;
  next.team.stunnedUntil=Object.fromEntries(Object.entries(stuns).filter(([,until])=>until>oldRound).map(([id,until])=>[id,until-oldRound]));
  return next;
}

export function useDestinyTeamAbility(fight,actor,name,options={},roll){
  if(name==='defender')return useDestinyTeamDefender(fight,actor,options);
  let next=switchDestinyTeamHero(fight,actor),spec=next.encounter?.grantedAbilities?.[name]?.spec??next.abilityCatalog[name];
  if(next.status!=='active'||next.hero.health<=0||!spec||!['speed','damage','end'].includes(next.team.stage))throw new RangeError('This team hero cannot act now');
  const role=next.team.roles[actor];
  if(role==='support'&&spec.category!=='mo')throw new RangeError('A support hero can use modifier abilities');
  if(spec.category==='sp'&&(next.team.independentRound?next.turn?.opponentSpeedDice:next.team.opponentDice))throw new RangeError('Play Speed abilities before the team rolls');
  if(spec.category==='co'&&next.team.stage!=='speed'&&next.team.roundWinner!==actor)throw new RangeError('Only the hero resolving this attack can play a combat ability');
  const opponentDice=next.turn?.opponentSpeedDice?[...next.turn.opponentSpeedDice]:null;
  next=useDestinyAbility(next,name,options,roll);
  shareChangedOpponentDice(next,opponentDice);
  if(spec.controlTrigger&&next.turn.controlTriggers?.length){
    for(const trigger of next.turn.controlTriggers)trigger.actor??=actor;
    for(const ally of next.allies){
      ally.turn??=createDestinyTurn();ally.turn.controlTriggers??=[];
      for(const trigger of next.turn.controlTriggers)if(!ally.turn.controlTriggers.some(old=>old.actor===trigger.actor&&old.name===trigger.name&&old.target===trigger.target))ally.turn.controlTriggers.push(structuredClone(trigger));
    }
  }
  if(next.phase==='between-combats'||next.team.active===next.team.roundWinner&&next.phase==='end')next.team.stage=next.phase;
  return advanceDestinyPairedRound(next);
}

export function rollDestinyTeamDamage(fight,roll,options={}){
  if(!fight.team||fight.team.stage!=='damage')throw new RangeError('No team damage roll is pending');
  return advanceDestinyPairedRound(rollDestinyDamage(switchDestinyTeamHero(fight,fight.team.roundWinner),roll,options));
}

export function resolveDestinyTeamDamage(fight,roll){
  if(!fight.team||fight.team.stage!=='damage')throw new RangeError('No team damage roll is pending');
  const next=resolveDestinyDamage(switchDestinyTeamHero(fight,fight.team.roundWinner),roll);
  if(['end','between-combats'].includes(next.phase)||next.status!=='active')next.team.stage=next.phase;
  return advanceDestinyPairedRound(next);
}

export function resolveDestinyTeamAbilityRoll(fight,roll,options){
  if(!fight.team)throw new RangeError('A team battle is required');
  const next=resumeDestinyDefendedEvent(resolveDestinyAbilityRoll(fight,roll,options));
  if(next.team.active===fight.team.active)shareChangedOpponentDice(next,fight.turn?.opponentSpeedDice);
  if(next.phase==='between-combats')next.team.stage=next.phase;
  if(next.team.active===next.team.roundWinner&&(next.phase==='end'||next.status!=='active'))next.team.stage=next.phase;
  return advanceDestinyPairedRound(next);
}

export function rollDestinyTeamSpeed(fight,actor,roll){
  if(!fight.team||fight.team.stage!=='speed'||fight.team.roles[actor]!=='attack'||fight.team.rolled.includes(actor))throw new RangeError('Choose an attacker who has not rolled');
  if(fight.team.independentRound)return rollDestinyPairedSpeed(fight,actor,roll);
  let next=switchDestinyTeamHero(fight,actor);
  if(next.hero.health<=0)throw new RangeError('A fallen hero cannot attack');
  const saved=next.savedOpponentDice;
  if(next.team.opponentDice)next.savedOpponentDice={round:next.round,target:destinyAttackerTarget(next),dice:[...next.team.opponentDice]};
  else {
    const reduction=Math.max(0,...next.team.order.map(id=>destinyTeamHero(next,id).turn?.opponentSpeedReduction||0));
    const counts=next.team.order.map(id=>destinyTeamHero(next,id).turn?.opponentSpeedCount).filter(Number.isFinite);
    if(reduction){next.turn.opponentSpeedReduction=reduction;next.turn.controlledOpponent=destinyAttackerTarget(next);}
    if(counts.length){next.turn.opponentSpeedCount=Math.min(...counts);next.turn.controlledOpponent=destinyAttackerTarget(next);}
  }
  next=rollDestinySpeed(next,roll);
  if(saved===undefined)delete next.savedOpponentDice;else next.savedOpponentDice=saved;
  next.team.opponentDice=[...next.turn.opponentSpeedDice];next.team.rolled.push(actor);
  return next;
}

export function resolveDestinyTeamSpeed(fight,{actor}={},roll){
  if(!fight.team||!['speed','speed-choice'].includes(fight.team.stage))throw new RangeError('No team Speed contest is pending');
  if(fight.team.independentRound)return resolveDestinyPairedSpeed(fight,actor,roll);
  const attackers=fight.team.order.filter(id=>fight.team.roles[id]==='attack'&&destinyTeamHero(fight,id).hero.health>0);
  if(attackers.some(id=>!fight.team.rolled.includes(id)))throw new RangeError('Every living attacker must roll first');
  let next=structuredClone(fight);
  for(const id of attackers){
    next=switchDestinyTeamHero(next,id);
    if(next.turn.pendingAbility)throw new RangeError('Resolve each attacker’s pending action first');
    acceptDestinySpeedRoll(next,roll);
  }
  if(settleDestinyFight(next,roll)){next.team.stage=next.phase;return next;}
  const scores=attackers.filter(id=>destinyTeamHero(next,id).hero.health>0).map(id=>{
    const context=switchDestinyTeamHero(next,id),turn=context.turn;
    return {id,score:turn.forcedOpponentWin?-Infinity:turn.autoWin?Infinity:turn.heroSpeedDice.reduce((sum,face)=>sum+face,0)+destinyStat(context,'hero','speed')};
  });
  const bonus=next.team.order.reduce((sum,id)=>sum+(destinyTeamHero(next,id).turn?.opponentSpeedBonus||0),0);
  const enemyLoses=next.team.opponentDice.length>1&&new Set(next.team.opponentDice).size<next.team.opponentDice.length&&next.effects.some(effect=>effect.kind==='lose-speed-doubles'&&effect.target===destinyAttackerTarget(next)&&effect.from<=next.round&&effect.until>=next.round);
  const enemy=enemyLoses?-Infinity:next.team.opponentDice.reduce((sum,face)=>sum+face,0)+destinyStat(next,destinyAttackerTarget(next),'speed')+bonus;
  const highest=Math.max(-Infinity,...scores.map(entry=>entry.score));
  const winners=scores.filter(entry=>entry.score===highest).map(entry=>entry.id);
  if(highest>enemy&&winners.length>1&&actor===undefined){next.team.stage='speed-choice';next.team.speedChoices=winners;return next;}
  if(actor!==undefined&&(!winners.includes(actor)||highest<=enemy))throw new RangeError('Choose one of the tied winning heroes');
  const selected=highest<enemy?destinyTeamEnemyTarget(next):actor??winners[0];
  next=switchDestinyTeamHero(next,selected);
  next.turn??=createDestinyTurn();next.turn.heroSpeedDice??=[];
  next.turn.opponentSpeedDice=[...next.team.opponentDice];next.turn.opponentSpeedBonus=bonus;
  if(highest<enemy)next.turn.forcedOpponentWin=true;
  next.phase='speed-rolled';next=resolveDestinySpeed(next,roll);
  next.team.roundWinner=selected;next.team.stage=next.phase==='end'?'end':'damage';
  delete next.team.speedChoices;
  return next;
}
