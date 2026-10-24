import { destinyStrike, addDestinyStatEffect, isDestinyOpponentActive } from './effects.js';
import { destinyDie, applyDestinyDamage } from './damage.js';

export function applyDestinyRoundEvents(fight, options, roll) {
  for (const effect of fight.encounter?.startStats || []) {
    if (effect.round !== fight.round) continue;
    for (const [attribute, amount] of Object.entries(effect.changes)) addDestinyStatEffect(fight, effect.target, attribute, amount, null, 'encounter-start');
  }
  let trapTargets = null;
  if (fight.trap && !fight.trap.fired && fight.trap.trigger === fight.round) {
    trapTargets = options.trapTargets;
    const maximum = fight.trap.kind === 'snap-jack' ? 1 : fight.trap.trigger;
    if (!Array.isArray(trapTargets) || !trapTargets.length || trapTargets.length > maximum ||
        new Set(trapTargets).size !== trapTargets.length || trapTargets.some(target =>
          !Number.isInteger(target) || !isDestinyOpponentActive(fight, target))) {
      throw new RangeError('Choose the opponents affected by the triggered trap');
    }
  }
  for (const effect of fight.effects) {
    if (!['vortex', 'dry-ice'].includes(effect.kind) || fight.round < effect.from) continue;
    const result = destinyDie(roll);
    fight.history.push({ type: 'round-event', name: effect.kind, round: fight.round, result, unmodifiable: effect.kind === 'vortex' });
    if (effect.kind === 'vortex') {
      if (result <= 2) fight.hero.health = Math.max(0, fight.hero.health - 2);
      else fight.opponents.forEach((opponent, target) => {
        if (isDestinyOpponentActive(fight, target)) destinyStrike(fight, target, 2, 'vortex', 'passive');
      });
    } else if (result <= 2) addDestinyStatEffect(fight, 'hero', 'speed', -1, 1, 'dry-ice');
    else if (result >= 5) fight.opponents.forEach((opponent, target) => {
      if (isDestinyOpponentActive(fight, target)) addDestinyStatEffect(fight, target, 'speed', -2, 1, 'dry-ice');
    });
  }
  if (trapTargets) {
    fight.trap.fired = true;
    // Another round-start event may already have defeated a selected victim.
    const targets = trapTargets.filter(target => isDestinyOpponentActive(fight, target));
    if (fight.trap.kind === 'snap-jack') {
      targets.forEach(target => destinyStrike(fight, target, 10, 'snap-jack', 'passive'));
    } else if (targets.length) {
      const pending = { type: 'damage', name: 'cluster-mine', returnPhase: 'speed', options: {},
        spec: { category: 'pa', armourLoss: 1, passive: true },
        groups: targets.map(target => ({ targets: [target], dice: [destinyDie(roll)], bonuses: {} })) };
      if (options.deferTrapDamage && fight.hero.health > 0) {
        fight.turn.pendingAbility = pending;
        fight.phase = 'ability-rolled';
      } else applyDestinyDamage(fight, pending);
    }
  }
}
