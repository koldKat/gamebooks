// Maintain independent d20 encounters with immutable actions and revision checks.
import {combatNumber, damageExpression, rollAttack, rollCheck, rollDamage, rollSave} from './dice.js';
import {DAMAGE_TYPES, validateDefenses, validateVitality, mitigateDamage, isDefeated, healDamage} from './damage.js';
import {validateCondition, validateHitEffects, attackConditions, actorSave, cannotAct, hasCondition,
  resolveDamageFeatures, resolveHitEffects, endActorTurn} from './effects.js';
import {normalizeSpellcasting, validatePendingCast, beginCast, finishCast, normalizeItemSpells, beginItemCast} from './spells.js';
import {spendCombatAction, restoreCombatAction} from './action-allowance.js';
import {startActorTurn, selectActorAttack, beforeActorAttack, afterActorAttack, attemptEscape, damageWeb} from './tactics.js';
import {ADJUSTMENTS, applyCombatAdjustment} from './adjustments.js';
import {prepareD20Encounter, encounterHazard, consumeLife} from './encounters.js';
import {sourceAttackContext} from './attack-context.js';
import {SOURCE_ACTIONS, sourceTurnEffects, sourceAttackEffects, sourceDamageTransitions, sourceEnvironmentalAction,
  beginAttackedForm, endSourceTurn, useEncounterAsset} from './source-effects.js';
import {sourceEscape, opportunityRetreat} from './source-escape.js';
import {SOURCE_SPELL_ACTIONS, sourceSpellAction, reflectResolvedCast} from './source-spells.js';

export const ABILITIES = Object.freeze(['str', 'dex', 'con', 'int', 'wis', 'cha']);
const statuses = new Set(['fighting', 'win', 'loss', 'fled', 'cancelled']);
function name(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 200) throw new RangeError('Invalid combat name');
  return value.trim();
}

export function normalizeD20Actor(source) {
  if (!source || typeof source !== 'object') throw new RangeError('Invalid combatant');
  const actor = structuredClone(source);
  actor.name = name(source.name ?? source.displayName);
  actor.hp = combatNumber(source.hp);
  actor.maxHp = combatNumber(source.maxHp ?? source.hp, 1);
  actor.baseMaxHp = combatNumber(source.baseMaxHp ?? actor.maxHp, actor.maxHp);
  actor.ac = combatNumber(source.ac, 0, 1000);
  if (actor.level != null) combatNumber(actor.level, 1, 100);
  if (actor.actionRound != null) combatNumber(actor.actionRound);
  if (actor.actionsSpent != null) combatNumber(actor.actionsSpent, 0, 100);
  validateVitality(actor);
  if (!source.abilities || !source.saves || !Array.isArray(source.attacks) || !source.attacks.length || source.attacks.length > 20) {
    throw new RangeError('Enter complete combat stats');
  }
  for (const key of ABILITIES) {
    combatNumber(source.abilities[key], -1000, 1000);
    combatNumber(source.saves[key], -1000, 1000);
  }
  actor.defenses = validateDefenses(source.defenses);
  actor.attacks = source.attacks.map(attack => {
    name(attack.name);
    if (attack.kind != null && !['attack', 'save'].includes(attack.kind)) throw new RangeError('Invalid attack kind');
    if (attack.kind === 'save') {
      if (!ABILITIES.includes(attack.save?.ability)) throw new RangeError('Invalid attack save');
      combatNumber(attack.save.dc, 0, 1000);
    } else combatNumber(attack.bonus, -1000, 1000);
    if (!Array.isArray(attack.damage) || attack.damage.length > 10) throw new RangeError('Invalid attack damage');
    for (const part of attack.damage) {
      damageExpression(part.formula);
      if (!DAMAGE_TYPES.includes(part.type)) throw new RangeError('Invalid damage type');
      if (part.ability != null && !ABILITIES.includes(part.ability)) throw new RangeError('Invalid damage ability');
    }
    if (attack.weakenedAtHp) {
      combatNumber(attack.weakenedAtHp.below, 1);
      damageExpression(attack.weakenedAtHp.formula);
    }
    if (attack.rerollDamageBelow != null) combatNumber(attack.rerollDamageBelow, 2, 1001);
    if (attack.actionCost != null) combatNumber(attack.actionCost, 1, 20);
    for (const key of ['magical', 'silvered']) if (attack[key] !== undefined && typeof attack[key] !== 'boolean') throw new RangeError('Invalid attack');
    if (attack.ability != null && !ABILITIES.includes(attack.ability)) throw new RangeError('Invalid attack ability');
    return {...structuredClone(attack), effects:validateHitEffects(attack.effects)};
  });
  actor.conditions = source.conditions == null ? [] : structuredClone(source.conditions);
  if (!Array.isArray(actor.conditions) || actor.conditions.length > 30) throw new RangeError('Invalid conditions');
  actor.conditions = actor.conditions.map(validateCondition);
  if (actor.conditionImmunities != null) {
    if (!Array.isArray(actor.conditionImmunities)) throw new RangeError('Invalid condition immunities');
    actor.conditionImmunities.forEach(value => validateCondition({name:value}));
  }
  if (actor.tags != null && (!Array.isArray(actor.tags) || actor.tags.some(tag => typeof tag !== 'string' || !tag || tag.length > 60))) throw new RangeError('Invalid creature tags');
  if (actor.magicResistance != null && typeof actor.magicResistance !== 'boolean') throw new RangeError('Invalid magic resistance');
  if (actor.features?.undeadFortitude) combatNumber(actor.features.undeadFortitude.dcBase, 0, 1000);
  if (actor.dead != null && (typeof actor.dead !== 'boolean' || actor.dead && actor.hp !== 0)) throw new RangeError('Invalid dead combatant');
  if (actor.withdrawn != null && typeof actor.withdrawn !== 'boolean') throw new RangeError('Invalid withdrawn combatant');
  if (actor.encounterAdvantageCharges != null) combatNumber(actor.encounterAdvantageCharges, 0, 100);
  if (actor.spellcasting) {
    const normalized = normalizeSpellcasting(actor.spellcasting, actor.spellSlots);
    actor.spellcasting = normalized.casting; actor.spellSlots = normalized.slots;
  } else if (actor.spellSlots) throw new RangeError('Missing spellcasting rules');
  if (actor.itemSpells != null) actor.itemSpells = normalizeItemSpells(actor.itemSpells);
  validatePendingCast(actor);
  return actor;
}

function party(fight) { return [fight.player, ...fight.companions]; }
function actorAt(fight, key) {
  if (key === 'player') return fight.player;
  const match = /^(ally|enemy)(\d{1,2})$/.exec(key);
  if (!match) throw new RangeError('Invalid combat target');
  const actors = match[1] === 'ally' ? fight.companions : fight.groups;
  const actor = actors[combatNumber(Number(match[2]), 0, actors.length - 1)];
  if (!actor) throw new RangeError('Unavailable combat target');
  return actor;
}
function replaceActor(fight, key, value) {
  const original = actorAt(fight, key);
  for (const key of Object.keys(original)) if (!(key in value)) delete original[key];
  Object.assign(original, value);
}
function terminal(fight) {
  if (party(fight).every(isDefeated)) fight.status = 'loss';
  else if (fight.groups.every(isDefeated)) fight.status = 'win';
  if (fight.status !== 'fighting') fight.phase = 'complete';
}

export function startD20Fight(player, encounter, companions = [], setup = {}) {
  if (!encounter || !Array.isArray(encounter.profiles) || !encounter.profiles.length || encounter.profiles.length > 20
      || !Array.isArray(companions) || companions.length > 5) throw new RangeError('Invalid encounter');
  if (encounter.options?.noCompanions && companions.length ||
      companions.some(actor => encounter.options?.excludeAllies?.includes(actor.key))) {
    throw new RangeError('This combatant cannot join the encounter');
  }
  const opponent = structuredClone(encounter); opponent.name = name(encounter.name);
  const groups = encounter.profiles.flatMap(profile => Array.from({length:combatNumber(profile.count ?? 1, 1, 20)},
    () => normalizeD20Actor(profile)));
  if (groups.length > 30 || groups.some(actor => actor.hp === 0)) throw new RangeError('Invalid opponent group');
  const fight = {family:'d20', rulesVersion:1, player:normalizeD20Actor(player),
    companions:companions.map(normalizeD20Actor), groups, opponent, status:'fighting', phase:'combat',
    round:0, revision:0, events:[]};
  if (party(fight).every(actor => actor.hp === 0)) throw new RangeError('No conscious player combatant');
  prepareD20Encounter(fight, setup);
  return validateD20Fight(fight);
}

export function validateD20Fight(fight) {
  if (!fight || fight.family !== 'd20' || fight.rulesVersion !== 1 || !statuses.has(fight.status)
      || !Array.isArray(fight.groups) || !fight.groups.length || fight.groups.length > 30
      || !Array.isArray(fight.companions) || fight.companions.length > 5
      || !Array.isArray(fight.events) || fight.events.length > 100) throw new RangeError('Invalid saved fight');
  combatNumber(fight.revision); combatNumber(fight.round);
  if (!Array.isArray(fight.openingAttacks) || fight.openingAttacks.length > 30) throw new RangeError('Invalid opening attacks');
  for (const key of fight.openingAttacks) actorAt(fight, key);
  name(fight.opponent?.name);
  for (const actor of [...party(fight), ...fight.groups]) {
    // Maximum-HP drain can kill a combatant by reducing their maximum to zero.
    validateVitality(actor);
    normalizeD20Actor({...actor, maxHp:Math.max(1, actor.maxHp)});
  }
  if (fight.status === 'fighting' && (fight.phase !== 'combat' || fight.groups.every(isDefeated)
      || party(fight).every(isDefeated))) throw new RangeError('Invalid active encounter');
  if (fight.status !== 'fighting' && fight.phase !== 'complete') throw new RangeError('Invalid terminal encounter');
  if (fight.status === 'win' && fight.groups.some(actor => !isDefeated(actor))) throw new RangeError('Invalid victory');
  if (fight.status === 'loss' && party(fight).some(actor => !isDefeated(actor))) throw new RangeError('Invalid defeat');
  return fight;
}

export function d20Action(source, action, random = Math.random) {
  validateD20Fight(source);
  if (source.status !== 'fighting' || !action || action.expectedRevision !== source.revision) throw new RangeError('Stale combat action');
  if (source.surrenderOffer === 'offered' && !['acceptSurrender','refuseSurrender','cancel'].includes(action.kind)) {
    throw new RangeError('Respond to the surrender offer first');
  }
  if ([...party(source), ...source.groups].some(actor => actor.pendingCast)
      && !['resolveCast', 'cancelCast'].includes(action.kind)) throw new RangeError('Resolve the pending spell first');
  if (action.kind === 'flee') {
    if (source.opponent.options?.noRetreat) throw new RangeError('Retreat is unavailable for this encounter');
    const performAttack = (fight, attack) => d20Action(fight, attack, random);
    const result = sourceEscape(source, action, performAttack, random)
      ?? (source.opponent.contextRules?.retreat === 'opportunity' ? opportunityRetreat(source, action, performAttack) : null);
    if (result) return validateD20Fight(result);
  }
  const fight = structuredClone(source), event = {kind:action.kind, round:fight.round};
  const adjustments = {getActor:key => actorAt(fight, key), setActor:(key, value) => replaceActor(fight, key, value)};
  while (fight.openingAttacks.length && !actorAt(fight, fight.openingAttacks[0]).hp) fight.openingAttacks.shift();
  if (fight.openingAttacks.length && (['attack', 'cast'].includes(action.kind) && action.actor !== fight.openingAttacks[0]
      || ['initiative', 'startTurn', 'round'].includes(action.kind))) throw new RangeError('Resolve the opening attack first');
  if (action.kind === 'cancel' || action.kind === 'flee') {
    fight.status = action.kind === 'cancel' ? 'cancelled' : 'fled'; fight.phase = 'complete';
  } else if (action.kind === 'acceptSurrender' || action.kind === 'refuseSurrender') {
    if (fight.surrenderOffer !== 'offered') throw new RangeError('No surrender offer');
    fight.surrenderOffer = action.kind === 'acceptSurrender' ? 'accepted' : 'refused';
    if (fight.surrenderOffer === 'accepted') {
      fight.status = 'fled';
      fight.phase = 'complete';
    }
  } else if (action.kind === 'attack') {
    const attacker = actorAt(fight, action.actor), target = actorAt(fight, action.target);
    if (!attacker.hp || isDefeated(attacker) || isDefeated(target) || attacker === target) throw new RangeError('Unavailable combatant');
    if (action.actor.startsWith('enemy') === action.target.startsWith('enemy')) throw new RangeError('Choose an opposing target');
    const attack = attacker.attacks[combatNumber(action.attackIndex, 0, attacker.attacks.length - 1)];
    if (cannotAct(attacker)) throw new RangeError('Combatant cannot act');
    if (!action.opportunity) spendCombatAction(fight, action.actor, attacker, action.attackIndex);
    beforeActorAttack(attacker, target, attack);
    const formChange = beginAttackedForm(target);
    if (action.useAdvantageCharge && (!attacker.encounterAdvantageCharges || attack.kind === 'save')) throw new RangeError('No applicable advantage charge');
    if (attack.range != null || attack.reach != null) {
      combatNumber(action.distance);
      if (action.distance > (attack.longRange ?? attack.range ?? attack.reach)) throw new RangeError('Target is out of range');
    }
    const printed = sourceAttackContext(attacker, target, attack, action, random);
    if (printed.awareness != null) {
      attacker.sourceAttackAwareness ??= {};
      attacker.sourceAttackAwareness[action.target] = printed.awareness;
    }
    let hit, save;
    if (printed.automaticMiss) hit = {hit:false, critical:false, rolls:[], reason:'targetLocation'};
    else if (attack.kind === 'save') {
      save = actorSave(target, attack.save.ability, attack.save.dc,
        {dice:action.saveDice, magical:attack.magical, advantage:printed.targetSaveAdvantage, random});
      hit = {hit:!save.success, critical:false};
    } else {
      const modifiers = attackConditions(attacker, target, action);
      const ac = target.ac + target.conditions.reduce((sum, condition) => sum + (condition.acBonus ?? 0), 0);
      hit = rollAttack(attack.bonus + printed.bonusAdjustment, ac, {advantage:Boolean(action.advantage || printed.advantage || modifiers.advantage || target.martialFuryActive || action.useAdvantageCharge
        || fight.openingAttacks[0] === action.actor && fight.opponent.options?.openingAttackAdvantage),
        disadvantage:Boolean(action.disadvantage || printed.disadvantage || modifiers.disadvantage || attack.range != null
          && (action.distance > attack.range || action.distance <= 5 && !cannotAct(target))
          || attacker.nextAttackDisadvantage || attacker.openingActionDisadvantage), dice:action.dice, random});
      if (hit.hit && modifiers.criticalOnHit) hit.critical = true;
    }
    event.actor = action.actor; event.target = action.target; event.attack = attack.name; event.check = hit; event.damage = [];
    event.effects = formChange ? [{...formChange, actor:action.target}, ...printed.events] : printed.events;
    if (save) event.save = save;
    if (hit.hit || save?.success && attack.halfOnSave) {
      const rule = fight.opponent.contextRules?.weaponDamage;
      const weaponHit = attack.kind !== 'save';
      const doubleTotal = weaponHit && hit.critical && rule?.critical === 'double-total';
      const rolled = attack.damage.map((part, index) => {
        const weakened = index === 0 && attack.weakenedAtHp && attacker.hp < attack.weakenedAtHp.below;
        const formula = weakened ? attack.weakenedAtHp.formula : part.formula;
        const roll = rollDamage(formula, {critical:hit.critical && !doubleTotal, random, dice:action.damageDice?.[index],
          rerollBelow:index === 0 && action.rerollLowDamage !== false ? attack.rerollDamageBelow : undefined,
          rerollDice:action.rerollDamageDice?.[index]});
        const penalty = index === 0 ? combatNumber(attack.damagePenalty ?? 0, 0, 1000) : 0;
        return {...part, roll, amount:Math.max(0, roll.amount - penalty)};
      });
      if (weaponHit && rule?.minimumOnHit && rolled.length && rolled.every(part => part.amount === 0)) {
        rolled[0].amount = combatNumber(rule.minimumOnHit, 1);
      }
      for (const part of rolled) {
        const rolledAmount = doubleTotal ? part.amount * 2 : part.amount;
        const result = mitigateDamage(save?.success ? Math.floor(rolledAmount / 2) : rolledAmount,
          part.type, target.defenses, {magical:attack.magical ?? false, silvered:attack.silvered ?? false,
            ranged:attack.ranged === true || attack.range != null});
        event.damage.push({...result, type:part.type, roll:part.roll});
      }
      const amount = event.damage.reduce((sum, part) => sum + part.amount, 0);
      const damaged = resolveDamageFeatures(target, amount, {critical:hit.critical,
        radiant:event.damage.some(part => part.type === 'radiant' && part.amount > 0),
        damageTypes:event.damage.filter(part => part.amount > 0).map(part => part.type), dice:action.featureDice, random});
      const effects = hit.hit ? resolveHitEffects(damaged.actor, attack, amount,
        {dice:action.effectDice, initialSaveResolved:Boolean(save), random}) : {actor:damaged.actor, events:[]};
      replaceActor(fight, action.target, effects.actor); event.amount = amount;
      if (attack.disintegratesAtZero && effects.actor.hp === 0) {
        actorAt(fight, action.target).dead = true; event.disintegrated = true;
      }
      event.effects.push(...damaged.events, ...effects.events);
    } else event.amount = 0;
    sourceAttackEffects(fight, action, attack, event, adjustments, random);
    if (attacker.features?.invisibilityEndsOnAttack) attacker.conditions = attacker.conditions.filter(item => item.name !== 'invisible');
    if (attack.kind !== 'save') attacker.nextAttackDisadvantage = false;
    delete attacker.openingActionDisadvantage;
    if (action.useAdvantageCharge) attacker.encounterAdvantageCharges--;
    if (fight.openingAttacks[0] === action.actor) fight.openingAttacks.shift();
    const aftermath = afterActorAttack(attacker, attack, {roll:action.tacticsRoll, random});
    replaceActor(fight, action.actor, aftermath.actor); event.effects = [...(event.effects ?? []), ...aftermath.events];
  } else if (action.kind === 'save' || action.kind === 'check') {
    const actor = actorAt(fight, action.actor);
    if (!actor.hp || !ABILITIES.includes(action.ability)) throw new RangeError('Invalid combat check');
    event.actor = action.actor; event.ability = action.ability;
    const options = {advantage:action.advantage, disadvantage:Boolean(action.disadvantage || actor.openingActionDisadvantage || hasCondition(actor, 'confused') || hasCondition(actor, 'hindered')
      || action.kind === 'check' && hasCondition(actor, 'poisoned')), dice:action.dice, magical:action.magical, random};
    const dc = action.dc ?? fight.opponent.contextRules?.abilityDcDefault;
    if (action.kind === 'save') event.check = actorSave(actor, action.ability, dc, options);
    else {
      if (cannotAct(actor)) throw new RangeError('Combatant cannot act');
      event.check = rollSave(actor.abilities[action.ability], combatNumber(dc, 0, 1000), options);
    }
    if (action.kind === 'check') delete actor.openingActionDisadvantage;
  } else if (ADJUSTMENTS.includes(action.kind)) {
    Object.assign(event, applyCombatAdjustment(adjustments, action, random));
  } else if (action.kind === 'cast') {
    const actor = actorAt(fight, action.actor);
    if (!actor.hp || cannotAct(actor) || actor.sourceMergedUntilRound != null) throw new RangeError('Combatant cannot cast');
    spendCombatAction(fight, action.actor, actor);
    const result = fight.opponent.contextRules?.spellSource === 'items'
      ? beginItemCast(actor, action.itemIndex, action.freeHand)
      : beginCast(actor, action.spell, action.level);
    replaceActor(fight, action.actor, result.actor);
    Object.assign(event, result.event, {actor:action.actor});
  } else if (action.kind === 'resolveCast' || action.kind === 'cancelCast') {
    const actor = actorAt(fight, action.actor), cancelled = action.kind === 'cancelCast';
    if (!Array.isArray(action.results) || action.results.length > 100 || cancelled && action.results.length) throw new RangeError('Invalid spell results');
    const result = finishCast(actor, {cancel:cancelled, note:action.note});
    if (cancelled) restoreCombatAction(fight, result.actor);
    replaceActor(fight, action.actor, result.actor);
    const reflectors = action.attackSpell && !cancelled ? action.results.flatMap(part => {
      const target = actorAt(fight,part.target);
      return target.features?.reflectSpell && part.target !== action.actor ? [[part.target,structuredClone(target)]] : [];
    }) : [];
    const beforeReflections = new Map(reflectors);
    const effects = action.results.map(part => applyCombatAdjustment(adjustments, part, random));
    if (!cancelled) effects.push(...reflectResolvedCast(fight,action.actor,beforeReflections,effects,action,adjustments,random));
    if (!cancelled && fight.openingAttacks[0] === action.actor) fight.openingAttacks.shift();
    Object.assign(event, result.event, {actor:action.actor, effects});
  } else if (action.kind === 'encounterAsset') {
    if (!action.target?.startsWith('enemy')) throw new RangeError('Choose an opposing target');
    event.target = action.target;
    Object.assign(event, useEncounterAsset(actorAt(fight, action.target), action.asset));
  } else if (action.kind === 'combatItem') {
    const actor = actorAt(fight, action.actor);
    if (!fight.opponent.contextRules?.actionAllowance || !actor.hp || cannotAct(actor)
        || !['potion','equipment'].includes(action.source)) throw new RangeError('Item action unavailable');
    spendCombatAction(fight, action.actor, actor);
    event.actor = action.actor;
    event.source = action.source;
    event.note = name(action.note);
    if (action.source === 'potion') {
      const roll = rollDamage(action.formula, {random, dice:action.damageDice});
      const healed = healDamage(actor, roll.amount);
      event.amount = healed.hp - actor.hp;
      replaceActor(fight, action.actor, healed);
    } else if (action.armorClass != null) {
      actor.ac = combatNumber(action.armorClass, 0, 1000);
    }
  } else if (action.kind === 'startTurn') {
    const actor = actorAt(fight, action.actor);
    if (fight.opponent.contextRules?.actionAllowance) {
      if (actor.sourceStartRound === fight.round) throw new RangeError('This turn already started');
      actor.sourceStartRound = fight.round;
    }
    const result = startActorTurn(actor, {roll:action.roll, random});
    const printed = sourceTurnEffects(fight, action.actor, result.actor, action, random);
    replaceActor(fight, action.actor, printed.actor); event.actor = action.actor; event.effects = [...result.events, ...printed.events];
  } else if (SOURCE_ACTIONS.includes(action.kind)) {
    Object.assign(event, {actor:action.actor, target:action.target}, sourceEnvironmentalAction(fight, action, adjustments, random));
  } else if (SOURCE_SPELL_ACTIONS.includes(action.kind)) {
    Object.assign(event, {actor:action.actor, target:action.target}, sourceSpellAction(fight, action, adjustments, random));
  } else if (action.kind === 'selectAttack') {
    const actor = actorAt(fight, action.actor), target = actorAt(fight, action.target);
    event.selection = selectActorAttack(actor, target, {distance:action.distance, roll:action.roll, rayRoll:action.rayRoll, random});
    event.actor = action.actor; event.target = action.target;
  } else if (action.kind === 'escape') {
    const result = attemptEscape(actorAt(fight, action.actor), action.index, {dice:action.dice, random});
    replaceActor(fight, action.actor, result.actor); Object.assign(event, result.event, {actor:action.actor});
  } else if (action.kind === 'webDamage') {
    const result = damageWeb(actorAt(fight, action.target), action.index, action.amount, action.type,
      {magical:action.magical ?? false, silvered:action.silvered ?? false, attack:action.isAttack ?? true});
    replaceActor(fight, action.target, result.actor); Object.assign(event, result.event, {target:action.target});
  } else if (action.kind === 'arenaGore' || action.kind === 'boneFloor') {
    const result = encounterHazard(fight, actorAt(fight, action.actor), action.kind, {roll:action.roll, dice:action.dice, random});
    replaceActor(fight, action.actor, result.actor); Object.assign(event, result.event, {actor:action.actor});
    if (result.arenaGoreRound != null) fight.arenaGoreRound = result.arenaGoreRound;
  } else if (action.kind === 'consumeLife') {
    if (action.actor.startsWith('enemy') === action.target.startsWith('enemy')) throw new RangeError('Choose an opposing target');
    const result = consumeLife(actorAt(fight, action.actor), actorAt(fight, action.target), {distance:action.distance, dice:action.dice, random});
    replaceActor(fight, action.actor, result.attacker); replaceActor(fight, action.target, result.target);
    Object.assign(event, result.event, {actor:action.actor, target:action.target});
  } else if (action.kind === 'endTurn') {
    const target = actorAt(fight, action.actor); event.actor = action.actor;
    const result = endActorTurn(target, {dice:action.dice, random}); replaceActor(fight, action.actor, result.actor);
    event.effects = result.events;
    const withdrawal = endSourceTurn(target);
    if (withdrawal) event.effects.push({...withdrawal,actor:action.actor});
  } else if (action.kind === 'initiative') {
    const allies = [['player', fight.player], ...fight.companions.map((actor, i) => ['ally'+i, actor])];
    const enemies = fight.groups.map((actor, i) => ['enemy'+i, actor]);
    if (fight.opponent.contextRules?.initiative === 'party-first') {
      const order = fight.protagonistSurprised && fight.round === 0 ? [...enemies, ...allies] : [...allies, ...enemies];
      event.order = order.filter(([, actor]) => actor.hp).map(([key]) => ({key}));
    } else {
      event.order = [...allies, ...enemies].filter(([, actor]) => actor.hp).map(([key, actor], i) => ({key,
        check:rollCheck(actor.abilities.dex, {random, dice:action.dice?.[i]})})).sort((a, b) => b.check.total - a.check.total);
    }
  } else if (action.kind === 'round') {
    fight.round++; event.round = fight.round;
  } else throw new RangeError('Unknown combat action');
  sourceDamageTransitions(source, fight, event);
  terminal(fight); fight.revision++; fight.events = [...fight.events.slice(-99), event];
  return validateD20Fight(fight);
}
