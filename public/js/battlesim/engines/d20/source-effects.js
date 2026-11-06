// Resolve printed environmental damage, shifting darkness, and weapon corrosion.
import {combatNumber, rollDamage, rollDie} from './dice.js';
import {mitigateDamage} from './damage.js';
import {addCondition, cannotAct, resolveDamageFeatures} from './effects.js';
import {combatSkillCheck} from './attack-context.js';

function die(sides, value, random) {
  return value == null ? rollDie(sides, random) : combatNumber(value, 1, sides);
}

function damage(actor, formula, type, dice, random) {
  const roll = rollDamage(formula, {dice, random});
  const dealt = mitigateDamage(roll.amount, type, actor.defenses, {attack:false});
  const result = resolveDamageFeatures(actor, dealt.amount, {random});
  return {actor:result.actor, event:{kind:'sourceDamage', amount:dealt.amount, type, roll, effects:result.events}};
}

function ignite(actor, rule) {
  if (!actor.hp || actor.conditions.some(c => c.name === 'burning')) return actor;
  return addCondition(actor, {name:'burning', startTurnDamage:{formula:rule.formula, type:rule.type}}).actor;
}

export function sourceTurnEffects(fight, key, source, action, random = Math.random) {
  let actor = structuredClone(source); const events = [];
  for (const condition of actor.conditions) if (actor.hp && condition.startTurnDamage) {
    const rule = condition.startTurnDamage;
    const result = damage(actor, rule.formula, rule.type, action.burningDice, random);
    actor = result.actor; events.push({...result.event, kind:'burningDamage'});
  }
  actor.sourceTurnDisadvantage = false;
  const darkness = !key.startsWith('enemy') && fight.groups.find(a => a.hp && a.features?.shiftingDarkness)?.features.shiftingDarkness;
  if (darkness) {
    const value = die(darkness.die, action.darknessRoll, random);
    actor.sourceTurnDisadvantage = value <= darkness.maximum;
    events.push({kind:'shiftingDarkness', roll:value, disadvantage:actor.sourceTurnDisadvantage});
  }
  const emerge = actor.features?.emergeDistance;
  if (actor.hp && !cannotAct(actor) && emerge) events.push({kind:'emergeDistance', roll:die(emerge.die, action.emergeRoll, random)});
  return {actor, events};
}

export function sourceAttackEffects(fight, action, attack, event, access, random = Math.random) {
  if (!event.check.hit) return;
  let attacker = access.getActor(action.actor), target = access.getActor(action.target);
  const contact = target.features?.fireForm?.contactDamage;
  if (contact && attack.kind !== 'save' && attack.range == null && combatNumber(action.distance) <= contact.meleeDistance) {
    const result = damage(attacker, contact.formula, contact.type, action.contactDamageDice, random);
    access.setActor(action.actor, result.actor); event.effects.push({...result.event, kind:'fireContact'});
    attacker = access.getActor(action.actor);
  }
  if (attacker.features?.ignition) {
    access.setActor(action.target, ignite(target, attacker.features.ignition));
    event.effects.push({kind:'ignited', condition:'burning'});
  }
  if (target.features?.firstSuccessfulHitCorrosion && !fight.sourceCorrosionResolved) {
    fight.sourceCorrosionResolved = true;
    if (!attack.magical && (attack.material === 'metal' || action.metalWeapon === true)) {
      const rule = target.features.firstSuccessfulHitCorrosion;
      const updated = structuredClone(attacker), weapon = updated.attacks[action.attackIndex];
      weapon.damagePenalty = combatNumber(weapon.damagePenalty ?? 0, 0, 1000) + combatNumber(rule.damagePenalty, 0, 1000);
      access.setActor(action.actor, updated);
      event.effects.push({kind:'weaponCorrosion', amount:rule.damagePenalty});
    }
  }
}

export function sourceDamageTransitions(before, fight, event) {
  const rows = f => [f.player, ...f.companions, ...f.groups];
  const previous = rows(before);
  for (const [i, actor] of rows(fight).entries()) {
    const rule = actor.features?.mergeIntoFire;
    if (rule && actor.hp && actor.sourceMergedUntilRound == null && previous[i].hp - actor.hp > rule.damageAbove) {
      actor.sourceMergedUntilRound = fight.round + combatNumber(rule.absentRounds, 1, 100);
      (event.effects ??= []).push({kind:'mergedIntoFire'});
    }
  }
}

export const SOURCE_ACTIONS = ['douse', 'touchFire', 'enterFireSpace', 'water', 'reappear'];

export function sourceEnvironmentalAction(fight, action, access, random = Math.random) {
  const original = access.getActor(action.actor);
  if (!original.hp) throw new RangeError('Combatant cannot act');
  let actor = structuredClone(original);
  if (action.kind === 'douse') {
    if (cannotAct(actor) || !actor.conditions.some(c => c.name === 'burning')) throw new RangeError('Cannot douse the fire');
    actor.conditions = actor.conditions.filter(c => c.name !== 'burning');
    access.setActor(action.actor, actor); return {};
  }
  if (action.kind === 'water') {
    const rule = actor.features?.waterSusceptibility;
    if (!rule || !['feet', 'gallons'].includes(action.unit)) throw new RangeError('No water susceptibility');
    const count = combatNumber(action.amount, 0, 10000);
    const amount = action.unit === 'feet' ? Math.floor(count / 5) * rule.coldDamagePerFiveFeet : count * rule.coldDamagePerGallon;
    const result = damage(actor, String(amount), 'cold', [], random);
    access.setActor(action.actor, result.actor); return {amount:result.event.amount};
  }
  const target = access.getActor(action.target);
  if (action.actor.startsWith('enemy') === action.target.startsWith('enemy') || !target.hp) throw new RangeError('Choose an opposing target');
  if (action.kind === 'reappear') {
    const rule = actor.features?.mergeIntoFire;
    if (!rule || actor.sourceMergedUntilRound == null || fight.round < actor.sourceMergedUntilRound) throw new RangeError('The elemental has not returned');
    const check = combatSkillCheck(target, 'perception', rule.reappearPerceptionDc, {dice:action.dice, random});
    delete actor.sourceMergedUntilRound;
    access.setActor(action.actor, actor);
    if (!check.success && rule.failedCheckSurpriseAttack) fight.openingAttacks.push(action.actor);
    return {check, roll:check.success ? undefined : die(rule.spawnDistanceDie, action.spawnRoll, random)};
  }
  if (cannotAct(actor) || actor.sourceMergedUntilRound != null || target.sourceMergedUntilRound != null) throw new RangeError('Combatant is unavailable');
  if (action.kind === 'touchFire') {
    const rule = target.features?.fireForm?.contactDamage;
    if (!rule || combatNumber(action.distance) > rule.meleeDistance) throw new RangeError('No fire within reach');
    const result = damage(actor, rule.formula, rule.type, action.dice, random);
    access.setActor(action.actor, result.actor); return {amount:result.event.amount};
  }
  if (action.kind === 'enterFireSpace') {
    const rule = actor.features?.fireForm?.enterSpaceDamage;
    if (!rule || combatNumber(action.distance) !== 0) throw new RangeError('Enter the target space first');
    actor.sourceEnteredSpaces ??= {};
    if (actor.sourceEnteredSpaces[action.target] === (actor.turn ?? 0)) throw new RangeError('Space damage already applied this turn');
    actor.sourceEnteredSpaces[action.target] = actor.turn ?? 0;
    const result = damage(target, rule.formula, rule.type, action.dice, random);
    access.setActor(action.actor, actor);
    access.setActor(action.target, rule.ignites ? ignite(result.actor, actor.features.ignition) : result.actor);
    return {amount:result.event.amount};
  }
  throw new RangeError('Unknown source action');
}
