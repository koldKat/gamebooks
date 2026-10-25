import { destinyStrike, addDestinyStatEffect, isDestinyOpponentActive } from './effects.js';
import { destinyDie, applyDestinyDamage } from './damage.js';

export function advanceDestinyAspectCycle(fight, round) {
  const cycle=fight.encounter?.aspectCycle;
  if(!cycle||cycle.activeAspect!==null||fight.opponents[cycle.main].health<=0)return;
  if(cycle.nextAspect<cycle.aspects.length&&cycle.mainRounds>=cycle.roundsBetween){
    const target=cycle.aspects[cycle.nextAspect++];cycle.activeAspect=target;cycle.mainRounds=0;
    fight.encounter.inactiveTargets=[...new Set([...(fight.encounter.inactiveTargets||[]).filter(index=>index!==target),cycle.main])];
    fight.history.push({type:'aspect-enter',round,target});
  }else cycle.mainRounds++;
}

export function reformDestinyOpponent(fight, round) {
  const cycle = fight.encounter?.formCycle;
  if (!cycle || cycle.reformRound === undefined || round < cycle.reformRound || !cycle.parts.some(target => fight.opponents[target].health > 0)) return;
  fight.opponents[cycle.shell].health = cycle.shellHealth;
  fight.encounter.inactiveTargets = [...new Set([...(fight.encounter.inactiveTargets || []).filter(target => target !== cycle.shell), ...cycle.parts])];
  fight.defeated = (fight.defeated || []).filter(target => target !== cycle.shell);
  delete cycle.reformRound;
  fight.history.push({ type: 'form-rejoin', round, target: cycle.shell, health: cycle.shellHealth });
}

export function spawnDestinyRoundOpponents(fight, round, createOpponent) {
  for (const rule of fight.encounter?.spawnAtRoundStart || []) {
    if (round < rule.fromRound || rule.source !== undefined && !isDestinyOpponentActive(fight, rule.source)) continue;
    spawnDestinyOpponents(fight, rule, round, createOpponent);
  }
}

export function spawnDestinyOpponents(fight, rule, round, createOpponent) {
  if (!Number.isSafeInteger(rule.count) || rule.count < 1) throw new RangeError('Invalid spawned opponent count');
  for (let i = 0; i < rule.count; i++) {
    const target = fight.opponents.length;
    fight.opponents.push(createOpponent(rule.opponent));
    if (rule.group) (fight.encounter.opponentGroups[rule.group] ??= []).push(target);
    for (const effect of rule.statWhileAlive || []) (fight.encounter.statWhileAlive ??= []).push({ ...effect, target });
    if (rule.endDamage) (fight.encounter.endEffects ??= []).push({ target: 'hero', amount: rule.endDamage, requiresAlive: [target] });
    fight.history.push({ type: 'spawn', round, source: rule.source, target });
  }
}

export function applyDestinyRoundEvents(fight, options, roll) {
  const ranged = fight.encounter?.rangedCombat;
  if (ranged) {
    fight.encounter.disableHeroAbilities = fight.round <= ranged.throughRound;
    fight.encounter.outnumbered = fight.round > ranged.throughRound && ranged.outnumberedAfter;
  }
  for (const rule of fight.encounter?.roundRampingDamage || []) {
    rule.current = rule.stoppedRound !== undefined && fight.round > rule.stoppedRound
      ? Math.max(0, (rule.current ?? rule.initial) - rule.decay)
      : Math.min(rule.maximum, rule.initial + Math.max(0, fight.round - rule.fromRound) * rule.growth);
  }
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
