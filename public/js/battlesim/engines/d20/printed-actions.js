// Resolve optional printed defenses and limited damage riders without rerolling the attack.
import {combatNumber, rollDamage, rollDie} from './dice.js';
import {healDamage, isDefeated} from './damage.js';
import {addCondition, cannotAct, hasCondition} from './effects.js';
import {spendCombatAction} from './action-allowance.js';

export function printedArmorReaction(fight, action, hit, ranged, ac, target) {
  if (!action.useArmorReaction || !hit.hit) return null;
  const side = action.target.startsWith('enemy') ? fight.groups : [fight.player,...fight.companions];
  const reactorIndex = side.findIndex(actor => {
    const rule = actor.features?.armorReaction;
    return rule && !isDefeated(actor) && !cannotAct(actor) && actor.armorReactionReady !== false
      && actor.armorReactionRound !== fight.round && (!rule.rangedOnly || ranged)
      && (!rule.targetKeys || rule.targetKeys.includes(target.key));
  });
  if (reactorIndex < 0) return null;
  const reactor = side[reactorIndex], rule = reactor.features.armorReaction;
  const distance = reactor === target ? 0 : combatNumber(action.reactionDistance);
  if (distance > rule.range) return null;
  reactor.armorReactionRound = fight.round;
  if (rule.recharge) reactor.armorReactionReady = false;
  const reactorKey = side === fight.groups ? 'enemy'+reactorIndex : reactorIndex ? 'ally'+(reactorIndex-1) : 'player';
  if (rule.lingers) {
    const effect = addCondition(target,{name:'shielded',acBonus:rule.amount,expiresOnSourceStart:reactorKey});
    target.conditions = effect.actor.conditions;
  }
  if (!hit.critical) hit.hit = hit.total >= ac + rule.amount;
  return {kind:'armorReaction',actor:reactorKey,amount:rule.amount,label:rule.name,blocked:!hit.hit};
}

export function refreshPrintedDefense(actor, action, random) {
  const rule = actor.features?.armorReaction;
  if (!rule?.recharge || actor.armorReactionReady !== false) return [];
  const value = action.armorReactionRoll ?? rollDie(6, random);
  const roll = combatNumber(value, 1, 6);
  actor.armorReactionReady = roll >= rule.recharge;
  return [{kind:'armorReactionRecharge',label:rule.name,roll}];
}

export function printedSmite(actor, target, action, attack, hit, random) {
  const rule = actor.features?.meleeSmite;
  if (!action.usePrintedSmite || !hit.hit || !rule || attack.kind === 'save' || attack.range || attack.ranged) return null;
  const remaining = actor.printedSmiteRemaining ?? rule.charges;
  if (!remaining) throw new RangeError('No smite charges remain');
  actor.printedSmiteRemaining = remaining-1;
  const greater = target.tags?.some(tag => ['undead','fiend'].includes(tag));
  const formula = greater ? '3d8' : '2d8';
  const fixed = greater ? 13 : 9;
  const roll = !hit.critical && !action.rollEnemyDamage && !action.printedSmiteDice ? {amount:fixed,rolls:[],fixed:true} :
    rollDamage(formula,{critical:hit.critical,dice:action.printedSmiteDice,random});
  return {type:'radiant',magical:true,amount:roll.amount,roll};
}

export const PRINTED_HEALING_ACTIONS = ['resolvePrintedHealing','layOnHands','renewRecovery','allyHealing','allyBoon','endAllyBoon'];

export function selectPrintedTurn(actor, fight, action, random) {
  const rule = actor.features?.printedTurn;
  if (!rule || isDefeated(actor) || cannotAct(actor) || actor.printedTurnRound === fight.round) {
    throw new RangeError('The printed turn choice is unavailable');
  }
  const supplied = action.roll == null ? rollDie(6,random) : combatNumber(action.roll,1,6);
  let roll = supplied;
  if (actor.hp === actor.maxHp && rule.table[roll-1] === 'heal') {
    const rerolls = [1,2,3,4,5,6].filter(value => rule.table[value-1] !== 'heal');
    roll = rerolls[rollDie(rerolls.length,random)-1];
  }
  actor.printedTurnRound = fight.round;
  actor.printedTurnChoice = rule.table[roll-1];
  return {roll, ...(roll !== supplied ? {originalRoll:supplied} : {}),
    ...(actor.printedTurnChoice === 'heal' ? {note:rule.healingName} : {selection:{attackIndex:actor.printedTurnChoice}})};
}

export function resolvePrintedHealing(fight, action, access, random) {
  const actor = access.getActor(action.actor);
  if (!actor.hp || cannotAct(actor)) throw new RangeError('Combatant cannot act');
  if (['allyHealing','allyBoon','endAllyBoon'].includes(action.kind)) return storyAllyAction(fight,action,actor,random);
  if (action.kind === 'renewRecovery') {
    const rule = actor.features?.focusedRecovery;
    if (!rule || hasCondition(actor,'focusedRecovery') || actor.specialBonusRound === fight.round
        || actor.recoveryLostRound === fight.round) throw new RangeError('Recovery cannot be renewed yet');
    actor.conditions = addCondition(actor,{name:'focusedRecovery',concentrationMinimum:10}).actor.conditions;
    actor.specialBonusRound = fight.round;
    return {};
  }
  if (action.kind === 'resolvePrintedHealing') {
    const rule = actor.features?.printedTurn;
    if (!rule || actor.printedTurnRound !== fight.round || actor.printedTurnChoice !== 'heal') throw new RangeError('No healing action was rolled');
    spendCombatAction(fight,action.actor,actor);
    const roll = rollDamage(rule.healingFormula,{dice:action.dice,random});
    const healed = healDamage(actor,roll.amount);
    const amount = healed.hp-actor.hp;
    actor.hp = healed.hp;
    actor.printedTurnChoice = null;
    return {note:rule.healingName,amount};
  }
  const rule = actor.features?.layOnHands;
  if (!rule || action.actor.startsWith('enemy') !== action.target.startsWith('enemy')
      || (action.actor !== action.target && combatNumber(action.distance) > 5)) throw new RangeError('Lay on Hands is unavailable');
  const remaining = actor.layOnHandsRemaining ?? rule.pool;
  const target = access.getActor(action.target);
  if (target.dead || target.withdrawn) throw new RangeError('Target cannot be healed');
  const condition = action.cure;
  let cost, amount;
  if (condition) {
    if (!['poisoned','diseased'].includes(condition) || remaining < 5 || !hasCondition(target,condition)) throw new RangeError('Condition cannot be cured');
    cost = 5;
    target.conditions.splice(target.conditions.findIndex(item => item.name === condition),1);
  } else {
    const healed = healDamage(target,combatNumber(action.amount,1,remaining));
    amount = healed.hp-target.hp;
    if (!amount) throw new RangeError('No hit points can be restored');
    cost = amount;
    target.hp = healed.hp;
  }
  spendCombatAction(fight,action.actor,actor);
  actor.layOnHandsRemaining = remaining-cost;
  return {amount,current:actor.layOnHandsRemaining,condition};
}

function storyAllyAction(fight, action, actor, random) {
  const rule = actor.features?.storySupport;
  if (!actor.untrackedStoryAlly || !rule) throw new RangeError('No story ally is available');
  const player = fight.player;
  if (action.kind !== 'endAllyBoon') spendCombatAction(fight,action.actor,actor);
  if (action.kind === 'allyHealing') {
    const roll = rollDamage('2d8+2',{dice:action.dice,random});
    const healed = healDamage(player,roll.amount);
    const amount = healed.hp-player.hp;
    player.hp = healed.hp;
    return {amount,note:rule.healingName};
  }
  if (action.kind === 'endAllyBoon') {
    player.conditions = player.conditions.filter(item => item.storyAllyBoon !== action.actor);
    return {note:rule.boonName};
  }
  const effect = rule.boon === 'blessed' ? {name:'blessed',remainingTurns:10}
    : {name:'barkskin',acFloor:combatNumber(action.barkskinAc,16,17)};
  player.conditions = player.conditions.filter(item => item.storyAllyBoon !== action.actor);
  player.conditions = addCondition(player,{...effect,storyAllyBoon:action.actor}).actor.conditions;
  return {note:rule.boonName};
}
