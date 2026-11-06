// Apply database-defined encounter openings, hazards, and limited combat boons.
import {combatNumber, rollDie, rollCheck} from './dice.js';
import {healDamage, mitigateDamage} from './damage.js';
import {addCondition, actorSave, cannotAct, hasCondition, resolveDamageFeatures} from './effects.js';

export function prepareD20Encounter(fight, setup = {}) {
  const options = fight.opponent.options ?? {}, rules = fight.opponent.contextRules ?? {};
  fight.openingAttacks = [];
  for (const actor of [fight.player, ...fight.companions]) actor.encounterAdvantageCharges = 0;
  if (options.quicksand) {
    if (!rules.quicksand) throw new RangeError('Missing quicksand rule');
    Object.assign(fight.player, addCondition(fight.player, {name:'quicksand', escape:rules.quicksand}).actor);
  }
  if (options.enemyOpeningAttack || options.enemyOpeningAttackIfFailedDexteritySave && setup.failedDexteritySave === true) {
    fight.openingAttacks = fight.groups.map((_, index) => 'enemy'+index);
  }
  if (options.readyAttack && setup.readiedAttack !== false) fight.openingAttacks.push('player');
  if (options.advantagedAttacks != null) fight.player.encounterAdvantageCharges = combatNumber(options.advantagedAttacks, 0, 100);
  fight.arenaGoreRound = null;
  if (options.initialPoisonTurns) Object.assign(fight.player,
    addCondition(fight.player, {name:'poisoned', remainingTurns:combatNumber(options.initialPoisonTurns, 1, 100)}).actor);
  if (options.previousDamageEntryRequired) {
    const amount = combatNumber(setup.priorEnemyDamage ?? 0);
    Object.assign(fight.groups[0], resolveDamageFeatures(fight.groups[0], amount).actor);
  }
  if (setup.corrosionAlreadyResolved === true) fight.sourceCorrosionResolved = true;
  return fight;
}

export function encounterHazard(fight, actor, kind, {roll, dice, random = Math.random} = {}) {
  if (!actor.hp || kind === 'boneFloor' && cannotAct(actor)) throw new RangeError('Combatant cannot act');
  if (kind === 'arenaGore') {
    const rule = fight.opponent.contextRules?.arena;
    if (!fight.opponent.options?.arenaGore || !rule || fight.arenaGoreRound === fight.round) throw new RangeError('Arena hazard unavailable');
    const value = roll == null ? rollDie(rule.goreRoll.sides, random) : combatNumber(roll, 1, rule.goreRoll.sides);
    const result = structuredClone(actor), event = {kind, roll:value, damage:0};
    if (value > rule.goreRoll.above) {
      const check = actorSave(result, rule.goreSave.ability, rule.goreSave.dc, {dice, random}); event.check = check;
      if (!check.success) {
        const damage = mitigateDamage(rule.goreDamage.amount, rule.goreDamage.type, result.defenses, {attack:false});
        const injured = resolveDamageFeatures(result, damage.amount, {random}); Object.assign(result, injured.actor);
        event.damage = damage.amount; event.effects = injured.events;
        if (rule.nextAttackDisadvantageOnFailedSave) result.nextAttackDisadvantage = true;
      }
    }
    return {actor:result, event, arenaGoreRound:fight.round};
  }
  if (kind === 'boneFloor') {
    const rule = fight.groups.find(group => group.features?.boneFloor)?.features.boneFloor;
    if (!rule || actor.features?.boneFloor?.immuneToOwnFloor) throw new RangeError('No floor check is needed');
    const check = rollCheck(actor.abilities[rule.check.ability], {
      disadvantage:hasCondition(actor, 'poisoned') || hasCondition(actor, 'confused'), dice, random});
    check.success = check.total >= rule.check.dc;
    const result = structuredClone(actor);
    if (!check.success) result.movementLostThisTurn = combatNumber(result.movementLostThisTurn ?? 0) + rule.movementLoss;
    return {actor:result, event:{kind, check, movementLost:check.success ? 0 : rule.movementLoss}};
  }
  throw new RangeError('Unknown encounter hazard');
}

export function consumeLife(attacker, target, {distance, dice, random = Math.random} = {}) {
  const rule = attacker.features?.consumeLife;
  if (!attacker.hp || cannotAct(attacker) || !rule || target.hp !== 0 || !target.maxHp || target.dead) throw new RangeError('Consume Life is unavailable');
  if (combatNumber(distance) > rule.range) throw new RangeError('Target is out of range');
  const check = actorSave(target, rule.save.ability, rule.save.dc, {dice, magical:true, random});
  const source = structuredClone(attacker), victim = structuredClone(target);
  if (!check.success) { victim.dead = true; Object.assign(source, healDamage(source, rule.healing)); }
  if (source.features.invisibilityEndsOnAttack) source.conditions = source.conditions.filter(condition => condition.name !== 'invisible');
  return {attacker:source, target:victim, event:{kind:'consumeLife', check, killed:!check.success, healing:source.hp - attacker.hp}};
}
