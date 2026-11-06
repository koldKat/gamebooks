// Resolve encounter conditions, printed drains, and damage-triggered defenses.
import {combatNumber, damageExpression, rollDamage, rollSave} from './dice.js';
import {applyDamage, reduceMaximumHp, DAMAGE_TYPES} from './damage.js';

const abilities = new Set(['str', 'dex', 'con', 'int', 'wis', 'cha']);
const conditions = new Set(['blinded', 'charmed', 'deafened', 'exhaustion', 'frightened', 'grappled',
  'incapacitated', 'invisible', 'paralyzed', 'petrified', 'poisoned', 'prone', 'restrained',
  'stunned', 'unconscious', 'confused', 'blurred', 'quicksand', 'shielded', 'burning']);
const disabling = ['incapacitated', 'paralyzed', 'petrified', 'stunned', 'unconscious'];
const automaticFailure = ['paralyzed', 'petrified', 'stunned', 'unconscious'];

export const hasCondition = (actor, condition) => actor.conditions?.some(item => item.name === condition) ?? false;
export const cannotAct = actor => disabling.some(key => hasCondition(actor, key));

export function validateCondition(source) {
  if (!source || !conditions.has(source.name)) throw new RangeError('Invalid combat condition');
  const value = structuredClone(source);
  if (value.remainingTurns != null) combatNumber(value.remainingTurns, 1, 10000);
  if (value.save) {
    if (!abilities.has(value.save.ability)) throw new RangeError('Invalid condition save');
    combatNumber(value.save.dc, 0, 1000);
  }
  if (value.repeatSave && !value.save) throw new RangeError('Missing repeated save');
  if (value.concentrationMinimum != null) combatNumber(value.concentrationMinimum, 0, 1000);
  if (value.acBonus != null) combatNumber(value.acBonus, -100, 100);
  if (value.expiresAtStart != null && typeof value.expiresAtStart !== 'boolean') throw new RangeError('Invalid condition timing');
  if (value.startTurnDamage) {
    damageExpression(value.startTurnDamage.formula);
    if (!DAMAGE_TYPES.includes(value.startTurnDamage.type)) throw new RangeError('Invalid ongoing damage type');
  }
  return value;
}

export function validateHitEffects(effects = []) {
  if (!Array.isArray(effects) || effects.length > 10) throw new RangeError('Invalid attack effects');
  return effects.map(effect => {
    if (!['condition', 'maximumHpDrain', 'strengthDrain'].includes(effect?.kind)) throw new RangeError('Invalid attack effect');
    if (effect.save) {
      if (!abilities.has(effect.save.ability)) throw new RangeError('Invalid effect save');
      combatNumber(effect.save.dc, 0, 1000);
    }
    if (effect.kind === 'condition') validateCondition(effect.condition);
    if (effect.kind === 'strengthDrain') damageExpression(effect.formula);
    if (effect.skipTags != null && (!Array.isArray(effect.skipTags)
        || effect.skipTags.some(tag => typeof tag !== 'string' || !tag || tag.length > 60))) throw new RangeError('Invalid condition exception');
    return structuredClone(effect);
  });
}

// Standard condition mechanics follow the 2014 SRD; a book-specific confused
// condition also affects saves, as specified by its own effect description.
export function attackConditions(attacker, target, {distance, ignoreInvisibility = false, ignoreBlur = false} = {}) {
  if (cannotAct(attacker)) throw new RangeError('Combatant cannot act');
  const nearMatters = hasCondition(target, 'prone') || hasCondition(target, 'paralyzed') || hasCondition(target, 'unconscious');
  if (nearMatters) combatNumber(distance);
  const near = distance != null && distance <= 5;
  return {
    advantage:!ignoreInvisibility && hasCondition(attacker, 'invisible')
      || ['paralyzed', 'petrified', 'stunned', 'unconscious', 'restrained', 'quicksand', 'blinded'].some(key => hasCondition(target, key))
      || hasCondition(target, 'prone') && near,
    disadvantage:['blinded', 'poisoned', 'prone', 'restrained', 'confused', 'quicksand'].some(key => hasCondition(attacker, key))
      || !ignoreInvisibility && hasCondition(target, 'invisible') || !ignoreBlur && hasCondition(target, 'blurred')
      || hasCondition(target, 'prone') && !near,
    criticalOnHit:near && (hasCondition(target, 'paralyzed') || hasCondition(target, 'unconscious')),
  };
}

export function actorSave(actor, ability, dc, options = {}) {
  if (!abilities.has(ability)) throw new RangeError('Invalid saving throw');
  combatNumber(dc, 0, 1000);
  if (['str', 'dex'].includes(ability) && automaticFailure.some(key => hasCondition(actor, key))) {
    return {rolls:[], automaticFailure:true, success:false, bonus:actor.saves[ability], total:null};
  }
  return rollSave(actor.saves[ability], dc, {...options,
    advantage:Boolean(options.advantage || options.magical && actor.magicResistance),
    disadvantage:Boolean(options.disadvantage || hasCondition(actor, 'confused') || ability === 'dex' && hasCondition(actor, 'restrained'))});
}

export function addCondition(actor, source) {
  const condition = validateCondition(source);
  if (actor.conditionImmunities?.includes(condition.name)) return {actor, immune:true};
  // Independently applied effects retain independent durations and saves.
  if ((actor.conditions?.length ?? 0) >= 30) throw new RangeError('Too many active conditions');
  return {actor:{...actor, conditions:[...(actor.conditions ?? []), condition]}, immune:false};
}

export function resolveDamageFeatures(before, amount, {critical = false, radiant = false, dice = {}, random = Math.random} = {}) {
  combatNumber(amount);
  let actor = applyDamage(before, amount); const events = [];
  const fortitude = before.features?.undeadFortitude;
  if (before.hp > 0 && actor.hp === 0 && amount > 0 && fortitude && !critical && !radiant) {
    const dc = combatNumber(fortitude.dcBase, 0, 1000) + amount;
    const check = actorSave(actor, 'con', dc, {dice:dice.fortitude, random});
    if (check.success) actor.hp = 1;
    events.push({kind:'fortitude', dc, check});
  }
  if (amount > 0) {
    const retained = [];
    for (const [index, condition] of (actor.conditions ?? []).entries()) {
      if (condition.concentrationMinimum == null) { retained.push(condition); continue; }
      const dc = Math.max(condition.concentrationMinimum, Math.floor(amount / 2));
      const check = actorSave(actor, 'con', dc, {dice:dice.concentration?.[index], random});
      events.push({kind:'concentration', condition:condition.name, dc, check});
      if (check.success && actor.hp > 0) retained.push(condition);
    }
    actor.conditions = retained;
  }
  return {actor, events};
}

export function resolveHitEffects(target, attack, amount, {dice = [], initialSaveResolved = false, random = Math.random} = {}) {
  combatNumber(amount);
  let actor = structuredClone(target); const events = [];
  for (const [index, effect] of validateHitEffects(attack.effects).entries()) {
    if (effect.skipTags?.some(tag => actor.tags?.includes(tag))) {
      events.push({kind:effect.kind, exception:true}); continue;
    }
    const check = effect.save && !(effect.initialSaveAlreadyResolved && initialSaveResolved) ? actorSave(actor, effect.save.ability, effect.save.dc,
      {dice:dice[index]?.save, magical:effect.magical, random}) : null;
    if (check?.success) { events.push({kind:effect.kind, check, applied:false}); continue; }
    if (effect.kind === 'maximumHpDrain') {
      actor = reduceMaximumHp(actor, amount); events.push({kind:effect.kind, amount, check, applied:true});
    } else if (effect.kind === 'strengthDrain') {
      if (actor.abilityScores?.str == null) throw new RangeError('Enter current Strength');
      const previous = combatNumber(actor.abilityScores.str, 1, 1000);
      const roll = rollDamage(effect.formula, {dice:dice[index]?.damage, random});
      const current = Math.max(0, previous - roll.amount);
      const difference = Math.floor(current / 2) - Math.floor(previous / 2);
      actor.abilityScores.str = current;
      actor.abilities.str += difference; actor.saves.str += difference;
      for (const item of actor.attacks) {
        if (item.ability === 'str') item.bonus += difference;
        for (const part of item.damage) if (part.ability === 'str') {
          const parsed = damageExpression(part.formula), modifier = parsed.modifier + difference;
          part.formula = parsed.count ? `${parsed.count}d${parsed.sides}${modifier < 0 ? '' : '+'}${modifier}` : String(Math.max(0, modifier));
        }
      }
      if (current === 0) { actor.hp = 0; actor.dead = true; }
      events.push({kind:effect.kind, amount:roll.amount, current, roll, applied:true});
    } else {
      const condition = {...effect.condition, magical:Boolean(effect.magical || attack.magical)};
      if (effect.repeatSave) { condition.save = effect.save; condition.repeatSave = true; }
      const result = addCondition(actor, condition); actor = result.actor;
      events.push({kind:effect.kind, condition:condition.name, check, applied:!result.immune, immune:result.immune});
    }
  }
  return {actor, events};
}

export function endActorTurn(source, {dice = [], random = Math.random} = {}) {
  const actor = structuredClone(source), events = [], retained = [];
  for (const [index, original] of (actor.conditions ?? []).entries()) {
    const condition = validateCondition(original);
    const check = condition.repeatSave ? actorSave(actor, condition.save.ability, condition.save.dc,
      {dice:dice[index], magical:condition.magical, random}) : null;
    if (condition.remainingTurns != null) condition.remainingTurns--;
    const ended = Boolean(check?.success || condition.remainingTurns === 0);
    events.push({kind:'conditionTurn', condition:condition.name, check, ended});
    if (!ended) retained.push(condition);
  }
  actor.conditions = retained;
  return {actor, events};
}
