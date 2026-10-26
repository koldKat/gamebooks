import {destinyStat} from './effects.js';

// Actor IDs remain stable when the selected hero and ally change places.
// Only combat snapshots move; no run, account or application inventory is read.
const actorFields=['hero','abilities','equipment','used','abilityCatalog','bookRules','character','abilityQuota','abilityGrantSources','turn','phase',
  'scoreRerollAbility','sustainedDamage','combatStance','chargedAttacks','sacrificedSummons','lastHealthHitRound','nextHeroSpeedDice',
  'savedHeroDie','savedOpponentDice','portableShieldHealth','phantomHealth','crystalArmour','powerTotemActive','takeBaitSucceededRound','combatBoostsApplied',
  'bleedBonus','chronicTriggered','sweetSpot','trap','iceMantle','clearedCurses','bearForm','autoWinRound','opponentFaceCounts'];
const encounterFields=['heroStatuses','growingStatus','cancelledAbilities','sacrificedAbilities','grantedAbilities','blockedRounds'];
export const destinySharedTeamEffect=effect=>typeof effect.target==='number'||effect.opponent!==undefined||effect.kind==='score-flat'&&effect.hero===false;

function snapshot(fight){
  const actor=Object.fromEntries(actorFields.filter(key=>fight[key]!==undefined).map(key=>[key,structuredClone(fight[key])]));
  actor.effects=fight.effects.filter(effect=>!destinySharedTeamEffect(effect)).map(effect=>structuredClone(effect));
  actor.encounter=Object.fromEntries(encounterFields.filter(key=>fight.encounter?.[key]!==undefined).map(key=>[key,structuredClone(fight.encounter[key])]));
  return actor;
}

export function enableDestinyTeam(fight){
  if(fight?.status!=='active'||fight.round!==0||fight.phase!=='start'||fight.team||fight.allies?.length!==1||Object.keys(fight.used).length||Object.keys(fight.allies[0].used).length)throw new RangeError('Configure a two-hero team before combat');
  const next=structuredClone(fight);
  next.encounter??={};
  next.team={active:0,order:[0,1],roles:null,lastDamageByTarget:{}};
  next.allies[0].teamActorId=1;
  next.allies[0].phase='start';
  return next;
}

export function destinyTeamHero(fight,id){
  if(!fight.team||!fight.team.order.includes(id))throw new RangeError('Choose a team hero');
  return fight.team.active===id?fight:fight.allies.find(ally=>ally.teamActorId===id);
}

export function switchDestinyTeamHero(fight,id){
  const actor=destinyTeamHero(fight,id);
  if(fight.team.active===id){const next=structuredClone(fight);if(next.team.targetsByActor)next.target=next.team.targetsByActor[id];return next;}
  if(fight.turn?.pendingAbility)throw new RangeError('Resolve the selected hero’s pending action first');
  const next=structuredClone(fight),slot=next.allies.findIndex(ally=>ally.teamActorId===id);
  const outgoing=snapshot(next),incoming=structuredClone(actor),shared=next.effects.filter(destinySharedTeamEffect);
  outgoing.teamActorId=next.team.active;
  for(const key of actorFields)delete next[key];
  for(const key of actorFields)if(incoming[key]!==undefined)next[key]=incoming[key];
  next.effects=[...shared,...(incoming.effects||[])];
  next.encounter??={};
  for(const key of encounterFields)delete next.encounter[key];
  Object.assign(next.encounter,incoming.encounter||{});
  next.allies[slot]=outgoing;next.team.active=id;
  if(fight.phase==='start'&&fight.team.stage==='start')next.phase='start';
  if(next.team.targetsByActor)next.target=next.team.targetsByActor[id];
  return next;
}

export function setDestinyTeamRoles(fight,roles){
  if(!fight.team||fight.status!=='active'||fight.phase!=='start'||!Array.isArray(roles)||roles.length!==fight.team.order.length)throw new RangeError('Choose team roles before a round');
  for(const id of fight.team.order){
    const alive=destinyTeamHero(fight,id).hero.health>0;
    if(alive?!['attack','support'].includes(roles[id]):roles[id]!=='fallen')throw new RangeError('Choose attack/support for living heroes and fallen for defeated heroes');
    if(alive&&roles[id]==='attack'&&(fight.team.stunnedUntil?.[id]??-1)>=fight.round+1)throw new RangeError('This hero is stunned for the next combat round');
  }
  if(!roles.includes('attack'))throw new RangeError('At least one living hero must attack');
  const next=structuredClone(fight);next.team.roles=[...roles];return next;
}

export function destinyTeamEnemyTarget(fight,target=fight.target){
  if(!fight.team)throw new RangeError('A team battle is required');
  const living=fight.team.order.filter(id=>destinyTeamHero(fight,id).hero.health>0);
  if(!living.length)throw new RangeError('No living team hero');
  const previous=fight.team.lastDamageByTarget[target];
  if(living.includes(previous))return previous;
  return living.reduce((best,id)=>{
    const context=switchDestinyTeamHero(fight,id),bestContext=switchDestinyTeamHero(fight,best);
    return destinyStat(context,'hero','armour')>destinyStat(bestContext,'hero','armour')?id:best;
  },living[0]);
}
