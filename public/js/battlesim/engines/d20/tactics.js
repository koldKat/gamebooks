// Resolve source-defined encounter choices, turn features, and escape attempts.
import {combatNumber, rollDie, rollCheck} from './dice.js';
import {mitigateDamage} from './damage.js';
import {addCondition, cannotAct, hasCondition} from './effects.js';

function die(sides, supplied, random) {
  return supplied == null ? rollDie(sides, random) : combatNumber(supplied, 1, sides);
}

export function startActorTurn(source, {roll, random = Math.random} = {}) {
  if (source.pendingCast) throw new RangeError('Resolve the pending spell first');
  const actor = structuredClone(source), events = [];
  actor.conditions = actor.conditions.filter(condition => !condition.expiresAtStart);
  actor.turn = combatNumber(actor.turn ?? 0) + 1;
  actor.martialFuryActive = false;
  actor.bonusAttacksPending = 0;
  actor.movementLostThisTurn = 0;
  actor.normalAttacksRemaining = combatNumber(actor.features?.multiattack?.count ?? 1, 1, 20);
  const invisibility = actor.features?.invisibilityRoll;
  if (actor.hp && !cannotAct(actor) && invisibility && !hasCondition(actor, 'invisible')) {
    const value = die(invisibility.die, roll, random);
    if (value >= invisibility.minimum) Object.assign(actor, addCondition(actor, {name:'invisible'}).actor);
    events.push({kind:'invisibilityRoll', roll:value, invisible:hasCondition(actor, 'invisible')});
  }
  const fury = actor.features?.martialFury;
  if (actor.hp && !cannotAct(actor) && fury?.firstTurn && actor.turn === 1) {
    actor.martialFuryActive = true; actor.furyUsedTurn = actor.turn;
    actor.bonusAttacksPending = combatNumber(fury.bonusAttacks, 1, 10);
    events.push({kind:'martialFury', firstTurn:true});
  }
  return {actor, events};
}

export function selectActorAttack(actor, target, {distance, roll, rayRoll, random = Math.random} = {}) {
  if (!actor.hp || cannotAct(actor)) throw new RangeError('Combatant cannot act');
  const selector = actor.features?.attackSelection;
  if (selector) {
    combatNumber(distance);
    const outside = distance > combatNumber(selector.meleeReach);
    const value = outside ? null : die(selector.die, roll, random);
    if (!outside && value <= selector.biteMaximum) return {attackIndex:combatNumber(selector.meleeIndex, 0, actor.attacks.length - 1), roll:value};
    const ray = die(selector.raysDie, rayRoll, random), attackIndex = selector.rayIndices?.[ray - 1];
    return {attackIndex:combatNumber(attackIndex, 0, actor.attacks.length - 1), roll:value, rayRoll:ray};
  }
  const web = actor.features?.webSelection;
  if (web) {
    const turn = actor.turn ?? 0;
    const blocked = web.noConsecutiveWeb && actor.lastWebTurn != null && actor.lastWebTurn >= turn - 1
      || web.noWebWhileTargetWebbed && target.conditions?.some(condition => condition.name === 'restrained' && condition.web);
    const value = blocked ? null : die(web.die, roll, random);
    return {attackIndex:combatNumber(!blocked && value >= web.minimum ? web.webIndex : web.normalIndex, 0, actor.attacks.length - 1), roll:value, webBlocked:Boolean(blocked)};
  }
  return {attackIndex:0};
}

export function beforeActorAttack(source, target, attack) {
  if (source.sourceMergedUntilRound != null || target.sourceMergedUntilRound != null) throw new RangeError('Combatant is absent');
  if (source.pendingCast) throw new RangeError('Resolve the pending spell first');
  if (source.features?.martialFury && source.normalAttacksRemaining === 0 && !source.bonusAttacksPending) throw new RangeError('No attacks remain this turn');
  const web = source.features?.webSelection;
  if (web && attack.effects?.some(effect => effect.condition?.web)) {
    const turn = source.turn ?? 0;
    if (web.noConsecutiveWeb && source.lastWebTurn != null && source.lastWebTurn >= turn - 1
        || web.noWebWhileTargetWebbed && target.conditions?.some(condition => condition.name === 'restrained' && condition.web)) throw new RangeError('Web is unavailable this turn');
  }
}

export function afterActorAttack(source, attack, {roll, random = Math.random} = {}) {
  const actor = structuredClone(source), events = [], turn = actor.turn ?? 0;
  if (attack.effects?.some(effect => effect.condition?.web)) actor.lastWebTurn = turn;
  if ((actor.normalAttacksRemaining ?? 1) > 0) actor.normalAttacksRemaining = (actor.normalAttacksRemaining ?? 1) - 1;
  else if (actor.bonusAttacksPending) actor.bonusAttacksPending--;
  const fury = actor.features?.martialFury;
  if (fury && actor.furyUsedTurn !== turn) {
    const value = die(fury.selection.die, roll, random);
    if (value >= fury.selection.minimum) {
      actor.martialFuryActive = true; actor.furyUsedTurn = turn;
      actor.bonusAttacksPending = combatNumber(fury.bonusAttacks, 1, 10);
    }
    events.push({kind:'martialFuryRoll', roll:value, active:actor.martialFuryActive});
  }
  return {actor, events};
}

export function attemptEscape(source, index, {dice, random = Math.random} = {}) {
  if (!source.hp || cannotAct(source) || source.pendingCast) throw new RangeError('Combatant cannot act');
  const actor = structuredClone(source), condition = actor.conditions[combatNumber(index, 0, actor.conditions.length - 1)];
  if (!condition.escape) throw new RangeError('No escape check for this condition');
  const rule = condition.escape;
  const bonus = rule.skill ? actor.skillBonuses?.[rule.skill] : actor.abilities[rule.ability];
  const check = rollCheck(combatNumber(bonus, -1000, 1000), {
    disadvantage:hasCondition(actor, 'poisoned') || hasCondition(actor, 'confused'), dice, random});
  check.success = check.total >= combatNumber(rule.dc, 0, 1000);
  if (check.success) actor.conditions.splice(index, 1);
  return {actor, event:{kind:'escape', condition:condition.name, check}};
}

export function damageWeb(source, index, amount, type, options = {}) {
  const actor = structuredClone(source), condition = actor.conditions[combatNumber(index, 0, actor.conditions.length - 1)];
  if (!condition.web) throw new RangeError('No web at that target');
  const result = mitigateDamage(amount, type, condition.web.defenses, options);
  condition.web.hp = Math.max(0, combatNumber(condition.web.hp, 1) - result.amount);
  if (!condition.web.hp) actor.conditions.splice(index, 1);
  return {actor, event:{kind:'webDamage', damage:result, remaining:condition.web.hp, destroyed:!condition.web.hp}};
}
