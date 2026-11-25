import {combatNumber} from './dice.js';

function plannedAttacks(fight, actor) {
  const plan = actor.features?.attackPlan;
  if (!plan) return null;
  const opening = plan.firstRounds ?? [];
  if (fight.round < opening.length) return [...opening[fight.round]];
  const cycle = plan.cycle;
  const result = [...(cycle ? cycle[(fight.round - opening.length) % cycle.length] : plan.regular)];
  if (plan.recurring && (fight.round + 1 - plan.recurring.firstRound) >= 0 &&
      (fight.round + 1 - plan.recurring.firstRound) % plan.recurring.every === 0) {
    result.push(...plan.recurring.attacks);
  }
  if (plan.lowHp && actor.hp < plan.lowHp.below) result.push(...plan.lowHp.attacks);
  return result;
}

export function attackAvailable(fight, key, actor, index) {
  const remaining = combatActionsRemaining(fight, key, actor);
  const attack = actor.attacks[index];
  if (!attack || remaining !== null && remaining < (attack.actionCost ?? 1)) return false;
  const plan = plannedAttacks(fight, actor);
  const used = actor.actionRound === fight.round ? actor.attacksSpent?.[index] ?? 0 : 0;
  return !plan || plan.filter(choice => choice === index).length > used;
}

export function combatActionsRemaining(fight, key, actor) {
  const rule = fight.opponent.contextRules?.actionAllowance;
  if (!rule) return null;
  const group = actor.features?.multiattack;
  const reduced = group?.hpThresholds?.filter(hp => actor.hp <= hp).length ?? 0;
  const plan = plannedAttacks(fight, actor);
  const extraCompanions = group?.additionalAtCompanionCount && fight.companions.length >= group.additionalAtCompanionCount ? 1 : 0;
  const base = plan?.length ?? combatNumber(group?.count ?? rule.base, 1, 20) - reduced + extraCompanions;
  const extra = key === 'player' && !fight.opponent.playerProfile &&
    actor.level >= rule.extraAtLevel ? 1 : 0;
  const spent = actor.actionRound === fight.round ? actor.actionsSpent ?? 0 : 0;
  return Math.max(0, base + extra - spent);
}

export function spendCombatAction(fight, key, actor, index) {
  const remaining = combatActionsRemaining(fight, key, actor);
  if (remaining === null) return;
  const cost = index == null ? 1 : actor.attacks[index].actionCost ?? 1;
  if (remaining < cost || index != null && !attackAvailable(fight, key, actor, index)) {
    throw new RangeError('This combat action is unavailable this round');
  }
  if (actor.actionRound !== fight.round) { actor.actionsSpent = 0; actor.attacksSpent = {}; }
  actor.actionsSpent = (actor.actionsSpent ?? 0) + cost;
  if (index != null) {
    actor.attacksSpent ??= {};
    actor.attacksSpent[index] = (actor.attacksSpent[index] ?? 0) + 1;
  }
  actor.actionRound = fight.round;
}

export function restoreCombatAction(fight, actor) {
  if (fight.opponent.contextRules?.actionAllowance && actor.actionRound === fight.round && actor.actionsSpent > 0) {
    actor.actionsSpent--;
  }
}
