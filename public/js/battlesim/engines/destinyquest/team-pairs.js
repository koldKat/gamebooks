import {startDestinyRound,createDestinyTurn,rollDestinySpeed,resolveDestinySpeed,onDestinyHeroRoundWon} from './core.js';
import {destinyStat,isDestinyOpponentActive,addDestinyStatEffect,beginDestinyCombatBoosts} from './effects.js';
import {setDestinyTeamRoles,switchDestinyTeamHero,destinyTeamHero} from './team-state.js';

export function updateDestinyPairOutcome(fight){
  const rule=fight.encounter?.pairedTeam,pair=fight.team?.pairing;
  if(!rule||!pair)return;
  const captive=destinyTeamHero(fight,pair.prisonActor);
  for(const [key,happened,changes] of [
    ['freed',fight.opponents[rule.prisonTarget].health===0,rule.onPrisonDestroyed],
    ['fallen',captive.hero.health<=0,rule.onPrisonHeroDefeated],
  ]){
    if(!happened||pair[key])continue;
    pair[key]=true;pair.resolved=true;
    for(const [attribute,amount] of Object.entries(changes||{}))addDestinyStatEffect(fight,rule.bossTarget,attribute,amount,null,`paired-${key}`);
    fight.history.push({type:'paired-outcome',round:fight.round,actor:pair.prisonActor,outcome:key});
  }
}

export function startDestinyPairedRound(fight,roles,roll){
  let next=setDestinyTeamRoles(fight,roles),rule=next.encounter.pairedTeam;
  if(!next.team.pairing){
    const ordered=next.team.order.map(id=>({id,speed:destinyStat(switchDestinyTeamHero(next,id),'hero','speed')})).sort((a,b)=>b.speed-a.speed||a.id-b.id);
    next.team.pairing={bossActor:ordered[0].id,prisonActor:ordered.at(-1).id,resolved:false};
    next.history.push({type:'pair-assignment',bossActor:ordered[0].id,prisonActor:ordered.at(-1).id});
  }
  for(const id of next.team.order)if(destinyTeamHero(next,id).hero.health>0&&roles[id]!=='attack')throw new RangeError('Each paired hero must fight their assigned opponent');
  const pair=next.team.pairing;
  return prepareIndependentRound(next,{[pair.bossActor]:rule.bossTarget,[pair.prisonActor]:rule.prisonTarget},roll);
}

export function startDestinySiegeRound(fight,roles,targets,roll){
  const next=setDestinyTeamRoles(fight,roles),rule=next.encounter.siegeTeam;
  const attackers=next.team.order.filter(id=>roles[id]==='attack');
  if(!attackers.some(id=>targets[id]===rule.bossTarget))throw new RangeError('At least one hero must attack the boss');
  if(attackers.some(id=>!Number.isInteger(targets[id])||![rule.bossTarget,...rule.freeTargets].includes(targets[id])||!isDestinyOpponentActive(next,targets[id])))throw new RangeError('Choose a living boss or shrine for each attacker');
  return prepareIndependentRound(next,targets,roll);
}

function prepareIndependentRound(next,targets,roll){
  next.team.targetsByActor={...targets};
  next.team.independentRound={done:[]};
  const first=next.team.order.find(id=>destinyTeamHero(next,id).hero.health>0);
  next=switchDestinyTeamHero(next,first);next.phase='start';
  next=startDestinyRound(next,next.team.targetsByActor[first],roll);
  for(const ally of next.allies){ally.turn=createDestinyTurn();ally.phase='speed';}
  for(const id of next.team.order){next=switchDestinyTeamHero(next,id);if(next.hero.health>0)beginDestinyCombatBoosts(next);}
  next=switchDestinyTeamHero(next,first);next.team.stage='speed';next.team.rolled=[];next.team.opponentDice=null;
  delete next.team.roundWinner;delete next.team.speedChoices;
  return next;
}

// End effects belong to the shared round, after every independent contest.
// A completed actor's own turn remains available for its remaining modifiers.
export function advanceDestinyPairedRound(fight){
  if(!fight.team?.independentRound)return fight;
  if(fight.status!=='active'){fight.team.stage=fight.phase;return fight;}
  if(fight.turn?.pendingAbility)return fight;
  const defended=fight.team.pairedDefenderResume;
  if(defended&&fight.phase==='end'){
    if(!fight.team.independentRound.done.includes(defended.protectedActor))fight.team.independentRound.done.push(defended.protectedActor);
    fight.turn=defended.turn;fight.phase=defended.phase;delete fight.team.pairedDefenderResume;
    fight.team.roundWinner=defended.roundWinner;
    fight.team.stage=['speed','speed-rolled'].includes(fight.phase)?'speed':fight.phase==='end'?'end':'damage';
  }
  if(fight.phase!=='end'&&fight.hero.health>0&&isDestinyOpponentActive(fight,fight.target))return fight;
  const done=fight.team.independentRound.done;
  if(!done.includes(fight.team.active))done.push(fight.team.active);
  const remaining=fight.team.order.filter(id=>!done.includes(id)&&destinyTeamHero(fight,id).hero.health>0&&isDestinyOpponentActive(fight,fight.team.targetsByActor[id]));
  if(!remaining.length){fight.phase='end';fight.team.stage='end';return fight;}
  const next=switchDestinyTeamHero(fight,remaining[0]);
  next.team.stage='speed';next.phase=next.team.rolled.includes(remaining[0])?'speed-rolled':'speed';
  return next;
}

export function hasPendingDestinyPairs(fight){
  return !!fight.team?.independentRound&&fight.team.order.some(id=>!fight.team.independentRound.done.includes(id)&&destinyTeamHero(fight,id).hero.health>0&&isDestinyOpponentActive(fight,fight.team.targetsByActor[id]));
}

export function rollDestinyPairedSpeed(fight,id,roll){
  if(fight.team.independentRound.done.includes(id)||fight.team.rolled.includes(id)||fight.team.roles[id]!=='attack')throw new RangeError('Choose an unresolved paired attacker');
  let next=switchDestinyTeamHero(fight,id);
  if(next.encounter?.siegeTeam?.freeTargets.includes(next.target))throw new RangeError('This shrine attack wins automatically without a Speed roll');
  if(next.hero.health<=0||!isDestinyOpponentActive(next,next.target))throw new RangeError('Choose a living paired attacker and opponent');
  next=rollDestinySpeed(next,roll);next.team.rolled.push(id);
  return advanceDestinyPairedRound(next);
}

export function resolveDestinyPairedSpeed(fight,id,roll){
  id??=fight.team.rolled.find(id=>!fight.team.independentRound.done.includes(id));
  id??=fight.team.order.find(id=>!fight.team.independentRound.done.includes(id)&&fight.encounter?.siegeTeam?.freeTargets.includes(fight.team.targetsByActor[id]));
  const automatic=fight.encounter?.siegeTeam?.freeTargets.includes(fight.team.targetsByActor[id]);
  if(!fight.team.order.includes(id)||!fight.team.rolled.includes(id)&&!automatic||fight.team.independentRound.done.includes(id))throw new RangeError('Roll this paired attacker first');
  let next=switchDestinyTeamHero(fight,id);
  if(next.hero.health<=0)throw new RangeError('Choose a living paired attacker');
  if(!isDestinyOpponentActive(next,next.target)){next.phase='end';return advanceDestinyPairedRound(next);}
  if(automatic){
    next.turn.winner='hero';next.turn.autoWin=true;next.turn.heroSpeedDice=[];next.turn.opponentSpeedDice=[];next.phase='damage';
    next.history.push({type:'automatic-team-win',round:next.round,actor:id,target:next.target});onDestinyHeroRoundWon(next,roll);
  }else next=resolveDestinySpeed(next,roll);
  next.team.roundWinner=id;
  if(next.phase==='damage')next.team.stage='damage';
  return advanceDestinyPairedRound(next);
}
