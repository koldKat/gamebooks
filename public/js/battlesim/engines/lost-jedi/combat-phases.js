// Preserve combatants across printed combat phases and resolve explicit disarm rolls.
import {integer,rollDie} from './math.js';
import {expandActors,queueRound} from './rounds.js';

export function continueFight(original,encounter) {
  if (!original || original.section!==encounter.rules.continuationOf || original.pending
      || original.outcome!=='phase') throw new RangeError('Complete the preceding combat phase first.');
  const fight=structuredClone(original),rules=structuredClone(encounter.rules);
  for (const actor of fight.actors.filter(a=>a.team!=='rebels')) Object.assign(actor,rules.survivingEnemyProfile ?? {});
  fight.actors.push(...expandActors(encounter.actors,{team:'imperial'},'continuation-'+encounter.section));
  fight.rules={...fight.rules,...rules};delete fight.rules.roundLimit;delete fight.rules.combatContinuation;
  fight.section=encounter.section;fight.name=encounter.name;fight.outcome=null;delete fight.phaseReason;
  fight.round++;fight.pending=null;fight.selectedTargetId=null;fight.events.push({kind:'continueCombat',actor:'havet'});
  queueRound(fight);return fight;
}

export function beginWeaponGrab(original,points,die=rollDie()) {
  if (!original?.rules.weaponGrabTest || original.outcome || original.pending || original.queue[0]!=='havet') {
    throw new RangeError('The weapon cannot be seized on this turn.');
  }
  const fight=structuredClone(original);
  fight.pending={kind:'grab',points:integer(points,0,fight.jediPoints,'Jedi Points to spend'),die:integer(die,1,6,'Die')};
  return fight;
}

export function previewWeaponGrab(pending,adjustment,points) {
  const change=integer(adjustment,-999,999,'Die adjustment');
  const cost=pending.points+Math.abs(change);
  if (cost>points) throw new RangeError('Not enough Jedi Power Points.');
  const die=integer(pending.die+change,1,6,'Adjusted die');
  return {die,cost,result:pending.points===die?'equal':pending.points>die?'greater':'less'};
}

export function confirmWeaponGrab(original,adjustment=0) {
  if (original?.pending?.kind!=='grab') throw new RangeError('Roll to seize the weapon first.');
  const fight=structuredClone(original),result=previewWeaponGrab(fight.pending,adjustment,fight.jediPoints);
  const destinations=fight.rules.weaponGrabDestinations;
  if (!destinations?.[result.result]) throw new RangeError('The printed disarm result is unavailable.');
  fight.jediPoints-=result.cost;
  if (result.result==='equal') {fight.player.weapon='dart-launcher';fight.player.ready=true;}
  fight.events.push({kind:'grabWeapon',actor:'havet',...result});
  fight.readerSection=destinations[result.result];fight.pending=null;
  fight.outcome='phase';fight.phaseReason='weapon-grab';return fight;
}

export function setParticipation(fight,side) {
  const factions=new Set(fight.actors.filter(a=>a.id!=='havet').map(a=>a.faction ?? a.team));
  if (side!=='observe' && !factions.has(side)) throw new RangeError('Choose which side to join.');
  fight.participation=side;fight.rules.thirdPartyOnly=side==='observe';
  for (const actor of fight.actors.filter(a=>a.id!=='havet')) {
    actor.faction ??= actor.team;
    actor.team=actor.faction===side ? 'rebels' : actor.faction;
  }
  if (side!=='observe' && fight.rules.joinMustDraw) fight.player.ready=false;
}

export function joinFight(original,side) {
  if (!original?.rules.chooseParticipation || !original.rules.thirdPartyOnly || original.pending || original.outcome) {
    throw new RangeError('Finish the current roll before joining the fight.');
  }
  const fight=structuredClone(original);setParticipation(fight,side);
  if (side==='observe') throw new RangeError('Choose a side to join.');
  fight.queue.push('havet');fight.events.push({kind:'joinCombat',actor:'havet'});return fight;
}
