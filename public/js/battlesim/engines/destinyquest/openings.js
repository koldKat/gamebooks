import { hasDestinyAbility, destinyStrike, addDestinyStatEffect, isDestinyOpponentActive, destinyDamageAllowed } from './effects.js';
import { destinyDie, prepareDestinyDamage } from './damage.js';
import { settleDestinyFight } from './core.js';
import { destinyDeathMovesEnabled } from './book-rules.js';
import {checkDestinyAbilityQuota,recordDestinyQuotaAbility} from './ability-quota.js';

export function useDestinyOpening(fight, name, options, roll, spec = {}) {
  if (fight?.status !== 'active' || (fight.round !== 0 && !(fight.encounter?.pathProgress && !fight.encounter.pathProgress.combatStarted)) || fight.phase !== 'start' ||
      !hasDestinyAbility(fight, name) || fight.used[name]) throw new RangeError('Use this ability once before combat');
  if (spec.excludedCareer && fight.character?.career === spec.excludedCareer) throw new RangeError('This career cannot use that opening');
  if (spec.requiresMainHand && fight.equipment?.mainHand?.type !== spec.requiresMainHand) throw new RangeError('Required main-hand weapon is missing');
  if (spec.requiresLeftHand && fight.equipment?.leftHand?.type !== spec.requiresLeftHand) throw new RangeError('Required left-hand weapon is missing');
  if ((!spec.exclusiveCareer || fight.character?.career === spec.exclusiveCareer) &&
      spec.openingExclusiveWith?.some(ability => fight.used[ability])) throw new RangeError('These opening attacks cannot be combined');
  checkDestinyAbilityQuota(fight,name);
  const next = structuredClone(fight);
  next.turn ??= { used: { sp: false, co: false, dm: false, backpack: false }, deaths: [], deathMoveDeathsSeen: 0 };
  if(spec.openingTargets) {
    prepareDestinyDamage(next,name,{...spec,hit:spec.openingTargets,fixedDamage:spec.openingDamage,
      damageKind:spec.openingKind||'fixed-opening'},options,roll);
  } else if(spec.openingBleedMark) {
    if(!Number.isInteger(options.target)||!isDestinyOpponentActive(next,options.target)) throw new RangeError('Choose a living opponent');
    next.bloodMark={target:options.target,amount:spec.openingBleedMark};
  } else if (spec.openingDamage !== undefined || spec.openingDice) {
    const target = options.target;
    if (!Number.isInteger(target) || !isDestinyOpponentActive(next, target)) throw new RangeError('Choose a living opponent');
    if (spec.openingDice) prepareDestinyDamage(next, name, {...spec,hit:'one',dice:spec.openingDice,damageKind:'first-strike'}, options, roll);
    else if (!spec.passiveAttack || destinyDamageAllowed(next, target, 'passive')) {
      destinyStrike(next, target, spec.openingDamage, name, spec.openingKind || 'first-strike');
    }
  } else if (name === 'first-blood' || name === 'first-cut') {
    const target = options.target;
    if (!Number.isInteger(target) || !isDestinyOpponentActive(next, target)) throw new RangeError('Choose a living opponent');
    destinyStrike(next, target, name === 'first-blood' ? 4 : 1, name, 'first-strike');
  } else if (name === 'best-laid-plans') {
    if (!['snap-jack', 'cluster-mine'].includes(options.trap)) throw new RangeError('Choose a trap');
    next.trap = { kind: options.trap, trigger: destinyDie(roll), fired: false };
  } else if (name === 'sweet-spot') {
    if (!Number.isInteger(options.number) || options.number < 1 || options.number > 6) throw new RangeError('Choose a number from one to six');
    next.sweetSpot = options.number;
  } else if (name === 'armour-plating') {
    if (!next.equipment?.transport) throw new RangeError('Requires a transport');
    addDestinyStatEffect(next, 'hero', 'armour', Math.floor(next.equipment.transport.toughness / 2), null, name);
  } else if (name === 'ice-mantle') {
    if (options.bonusAlreadyIncluded !== undefined && typeof options.bonusAlreadyIncluded !== 'boolean') throw new RangeError('Specify whether the permanent bonus is already included');
    if (!options.bonusAlreadyIncluded) {
      next.hero.armour += 2;
      next.hero.normal.armour += 2;
    }
    next.iceMantle = true;
  } else if (!spec.openingPassive) throw new RangeError('Unknown opening ability');
  recordDestinyQuotaAbility(next,name);
  next.used[name] = 1;
  next.history.push({ type: 'opening', name, round: next.round });
  if (!settleDestinyFight(next, roll) && destinyDeathMovesEnabled(next) && next.turn.deaths.length > next.turn.deathMoveDeathsSeen) {
    next.phase = 'death-move';
    next.turn.afterDeathMove = 'start';
  }
  return next;
}
