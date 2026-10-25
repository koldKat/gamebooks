// Declarative extensions used by family catalogs. These mutate only the copy
// already owned by useDestinyAbility; no application or character state writes.
import {destinyStat,destinyDamageScore,destinyStrike,hasDestinyAbility,isDestinyOpponentActive,destinyAttackerTarget,destinyOpponentDamageTotal,destinyImmuneToAbility} from './effects.js';
import {prepareDestinyDamage} from './damage.js';

export function applyDestinyCatalogAction(fight,name,spec,options,roll) {
  const attacker=fight.turn.pendingAbility?.event?.attacker ?? destinyAttackerTarget(fight);
  const target=spec.reflectIncoming ? attacker : options.target ?? fight.target;
  if (spec.reflectIncoming && options.target !== undefined && options.target!==attacker) throw new RangeError('Reflect damage to the attacker');
  if (spec.requiresMainHand && fight.equipment?.mainHand?.type!==spec.requiresMainHand) throw new RangeError('Required main-hand weapon is missing');
  if (spec.requiredTargetTrait && !fight.encounter?.traitsByTarget?.[target]?.includes(spec.requiredTargetTrait)) throw new RangeError('This opponent does not have the required trait');
  if(spec.stealPlayedAbility){
    const stolen=options.ability,stolenSpec=fight.abilityCatalog?.[stolen];
    if(!fight.encounter?.heroVersusHero || !fight.encounter.playedAbilitiesByTarget?.[target]?.includes(stolen) || !['sp','mo'].includes(stolenSpec?.category) || stolen===name)throw new RangeError('Choose a speed or modifier ability already played by the opposing hero');
    fight.abilities[stolen]=(fight.abilities[stolen]||0)+1;
    fight.used[stolen]=0;
  }
  if (spec.executeBelowStat || spec.executeBelowHealth !== undefined || spec.summonDamage) {
    if (!Number.isInteger(target) || !isDestinyOpponentActive(fight,target)) throw new RangeError('Choose a living opponent');
  }
  if (spec.executeBelowStat || spec.executeBelowHealth !== undefined) {
    const limit=spec.executeBelowStat ? destinyStat(fight,'hero',spec.executeBelowStat) : spec.executeBelowHealth;
    if (fight.opponents[target].health>limit) throw new RangeError('Opponent health is above the execution threshold');
    destinyStrike(fight,target,fight.opponents[target].health,name,'execution');
    if(spec.forceVictory)(fight.encounter??={}).forcedVictory=true;
  }
  if (spec.chargeDice) {
    const charge=fight.chargedAttacks?.[name];
    if (!charge) {
      (fight.chargedAttacks??={})[name]={round:fight.round,dice:spec.chargeDice};
    } else {
      if (fight.round<=charge.round) throw new RangeError('Release the charge in a later winning round');
      prepareDestinyDamage(fight,name,{category:spec.category,replacement:true,hit:'one',dice:charge.dice},options,roll);
      delete fight.chargedAttacks[name];
    }
  }
  if (spec.summonDamage) fight.effects.push({kind:'ongoing-damage',target,amount:spec.summonDamage,
    from:fight.round,until:Number.MAX_SAFE_INTEGER,source:name,dispelOnDoubles:!!spec.dispelOnDoubles});
  if (spec.cancelDodge) {
    if (!fight.turn.opponentDodged || fight.turn.winner!=='hero') throw new RangeError('The opponent must dodge this round first');
    delete fight.turn.opponentDodged;
    delete fight.turn.normalDamageReplaced;
    fight.phase='damage';
  }
  if (spec.cancelCounterstrike || spec.cancelIncoming || spec.reflectIncoming) {
    const pending=fight.phase==='ability-rolled' ? fight.turn.pendingAbility : null;
    const event=pending?.event;
    if (pending && (pending.type!=='encounter' || event.owner!=='opponent' || !event.damageDice)) throw new RangeError('Resolve an opponent damage roll first');
    if (spec.cancelCounterstrike && !event?.counterstrike) throw new RangeError('This is not an opponent counterstrike');
    if (!pending && fight.turn.winner!=='opponent') throw new RangeError('Resolve an opponent damage roll first');
    if (spec.sacrificeSummon) {
      if (!hasDestinyAbility(fight,spec.sacrificeSummon) || !fight.abilityCatalog?.[spec.sacrificeSummon]?.summon || fight.sacrificedSummons?.includes(spec.sacrificeSummon)) throw new RangeError('No summoned allies remain to sacrifice');
      (fight.sacrificedSummons??=[]).push(spec.sacrificeSummon);
    }
    if (spec.reflectIncoming) {
      let armour=destinyStat(fight,'hero','armour');
      if(fight.turn.ignoreArmour&&!destinyImmuneToAbility(fight,fight.turn.opponentArmourAbility))armour=0;
      else if(fight.turn.halfArmour)armour-=Math.ceil(armour/2);
      const amount=Math.min(fight.hero.health,pending ? destinyOpponentDamageTotal(fight,pending.dice,pending.bonuses) : Math.max(0,destinyDamageScore(fight)-armour));
      destinyStrike(fight,target,amount,name,'reflected');
    }
    if (pending) {
      if (pending.suspendedAbility) {fight.turn.pendingAbility=pending.suspendedAbility;fight.phase='ability-rolled';}
      else {delete fight.turn.pendingAbility;fight.phase=pending.returnPhase;}
    } else fight.turn.avoidDamage=true;
  }
}
