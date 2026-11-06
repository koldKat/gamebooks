// Apply explicitly resolved combat effects to encounter actors only.
import {combatNumber} from './dice.js';
import {mitigateDamage, healDamage, reduceMaximumHp} from './damage.js';
import {addCondition, resolveDamageFeatures} from './effects.js';

export const ADJUSTMENTS = Object.freeze(['damage', 'heal', 'maximumHp', 'condition', 'removeCondition']);

export function applyCombatAdjustment(context, action, random = Math.random) {
  if (!ADJUSTMENTS.includes(action.kind) || typeof action.reason !== 'string'
      || !action.reason.trim() || action.reason.length > 200) throw new RangeError('Describe the resolved combat effect');
  const target = context.getActor(action.target), event = {kind:action.kind, target:action.target, reason:action.reason.trim()};
  if (action.kind === 'heal' && target.dead) throw new RangeError('Ordinary healing cannot revive the dead');
  if (action.kind === 'condition') {
    const result = addCondition(target, action.condition); context.setActor(action.target, result.actor);
    event.condition = action.condition.name; event.immune = result.immune;
  } else if (action.kind === 'removeCondition') {
    const index = combatNumber(action.index, 0, target.conditions.length - 1);
    event.condition = target.conditions[index].name; target.conditions.splice(index, 1);
  } else {
    const amount = combatNumber(action.amount); event.amount = amount;
    if (action.kind === 'damage') {
      event.damage = mitigateDamage(amount, action.type, target.defenses,
        {magical:action.magical ?? false, silvered:action.silvered ?? false, attack:action.isAttack ?? false});
      event.amount = event.damage.amount;
      const result = resolveDamageFeatures(target, event.amount, {critical:action.critical ?? false,
        radiant:action.type === 'radiant' && event.amount > 0, dice:action.featureDice, random});
      context.setActor(action.target, result.actor); event.effects = result.events;
    } else context.setActor(action.target, action.kind === 'heal' ? healDamage(target, amount) : reduceMaximumHp(target, amount));
  }
  return event;
}
