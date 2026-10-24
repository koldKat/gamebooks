import { destinyStat, destinyStrike, addDestinyStatEffect, isDestinyOpponentActive } from './effects.js';
import { destinyDie, prepareDestinyDamage, applyDestinyDamage } from './damage.js';
import { settleDestinyFight } from './core.js';
import { resolveDestinyEncounterEvent, resumeDestinyEncounterQueue } from './encounter-events.js';

export function prepareDestinyAbilityRoll(fight, name, options, roll) {
  const target = options.target ?? fight.target;
  if (!Number.isInteger(target) || !isDestinyOpponentActive(fight, target)) throw new RangeError('Choose a living opponent');
  const count = name === 'take-the-bait' ? 3 : 1;
  fight.turn.pendingAbility = { type: 'test', name, target, options: structuredClone(options),
    dice: Array.from({ length: count }, () => destinyDie(roll)) };
  fight.phase = 'ability-rolled';
}

export function finishDestinyAbilityAction(fight, roll = () => Math.floor(Math.random() * 6) + 1) {
  if (['speed-rolled', 'damage', 'damage-rolled'].includes(fight.phase) && !isDestinyOpponentActive(fight, fight.target)) fight.phase = 'end';
  if (fight.phase === 'end' && !fight.turn.pendingPassiveDeath && !fight.turn.used.dm &&
      fight.turn.deaths.length > fight.turn.deathMoveDeathsSeen) {
    fight.phase = 'death-move';
    fight.turn.afterDeathMove = 'end';
  }
  settleDestinyFight(fight);
  resumeDestinyEncounterQueue(fight, roll);
  return fight;
}

export function resolveDestinyAbilityRoll(fight, roll = () => Math.floor(Math.random() * 6) + 1) {
  if (fight?.status !== 'active' || fight.phase !== 'ability-rolled' || !fight.turn.pendingAbility) throw new RangeError('No pending ability roll');
  const next = structuredClone(fight);
  const pending = next.turn.pendingAbility;
  delete next.turn.pendingAbility;
  if (pending.type === 'encounter') resolveDestinyEncounterEvent(next, pending, roll);
  else if (pending.type === 'resource') {
    const before = next.encounter.resources[pending.resource];
    next.encounter.resources[pending.resource] = Math.max(0, before - pending.dice.reduce((sum, value) => sum + value, 0));
    if (before > 0 && next.encounter.resources[pending.resource] === 0) {
      for (const change of pending.onZeroStats) for (const [attribute, amount] of Object.entries(change.changes)) {
        addDestinyStatEffect(next, change.target, attribute, amount, null, pending.name);
      }
    }
    next.phase = pending.returnPhase;
  } else if (pending.type === 'damage') {
    applyDestinyDamage(next, pending);
    next.phase = pending.spec.replacement ? 'end' : pending.returnPhase;
    if (pending.spec.category === 'dm') next.phase = next.turn.afterDeathMove;
  } else {
    const { name, target, dice, options } = pending;
    const result = dice.reduce((total, value) => total + value, 0);
    next.phase = 'end';
    next.history.push({ type: 'ability-roll', name, round: next.round, dice: [...dice], result });
    if (name === 'take-the-bait') {
      const total = result + (next.equipment?.leftHand?.speed || 0);
      if (total >= destinyStat(next, target, 'speed')) {
        destinyStrike(next, target, total, name);
        next.turn.combatAbilityDamage = true;
        addDestinyStatEffect(next, target, 'speed', -2, 1, name, 1);
        next.takeBaitSucceededRound = next.round;
      }
    } else if (name === 'warg-strike') {
      prepareDestinyDamage(next, name, { category: 'co', replacement: true, hit: 'one', dice: result <= 2 ? 2 : 3,
        ongoing: result >= 5 ? 1 : 0 }, { ...options, target }, roll);
    } else if (name === 'chaotic-catalyst') {
      if (result <= 2) next.opponents[target].health = Math.min(next.opponents[target].maxHealth, next.opponents[target].health + 6);
      else if (result <= 4) next.effects.push({ kind: 'ongoing-damage', target, amount: 2,
        from: next.round, until: Number.MAX_SAFE_INTEGER, source: name });
      else {
        const groups = [];
        for (const index of [target - 1, target, target + 1]) {
          if (!isDestinyOpponentActive(next, index)) continue;
          groups.push({ targets: [index], dice: Array.from({ length: index === target ? 4 : 1 }, () => destinyDie(roll)), bonuses: {} });
        }
        const damage = { type: 'damage', name, spec: { category: 'co', replacement: true }, options, groups, returnPhase: 'end' };
        if (options.deferDamage) { next.turn.pendingAbility = damage; next.phase = 'ability-rolled'; }
        else applyDestinyDamage(next, damage);
      }
    } else if (name === 'head-blow') {
      if (result <= 2) next.turn.used.sp = true;
      else {
        next.turn.passedSpeedAbility = options.ability;
        next.turn.passedSpeedOptions = options.abilityOptions;
      }
      next.phase = pending.returnPhase;
    } else if (name === 'gambit') {
      if (result === 6) {
        next.turn.pendingAbility = { ...pending, type: 'choice', name: 'gambit-restore' };
        next.phase = 'ability-choice';
      } else if (pending.suspendedAbility) {
        next.turn.pendingAbility = pending.suspendedAbility;
        next.phase = 'ability-rolled';
      } else next.phase = pending.returnPhase;
    } else if (name === 'crystal-armour') {
      if (result <= 4) {
        next.crystalArmour = false;
        next.effects = next.effects.filter(effect => effect.source !== 'crystal-armour');
        if (result <= 2) next.hero.health = Math.max(0, next.hero.health - 4);
      }
      next.phase = pending.returnPhase;
    } else if (name === 'pick-n-mix') {
      if (next.hero.health > 0) next.hero.health = Math.min(next.hero.maxHealth, next.hero.health + Math.ceil(result / 2) * 2);
      next.phase = pending.returnPhase;
    } else throw new RangeError('Unknown ability roll');
  }
  return finishDestinyAbilityAction(next, roll);
}
