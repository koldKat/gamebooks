// Resolve printed illusion tactics and reflected attack spells without changing story state.
import {combatNumber, rollAttack, rollDamage, rollDie} from './dice.js';
import {mitigateDamage, DAMAGE_TYPES} from './damage.js';
import {addCondition, actorSave, cannotAct, hasCondition, resolveDamageFeatures} from './effects.js';
import {beginCast, finishCast} from './spells.js';

export const SOURCE_SPELL_ACTIONS = ['scriptedInvisibility','printedMageArmour','displacement','printedIllusion','combatSpeed','reflectSpell'];

function available(actor) {
  if (!actor.hp || cannotAct(actor) || actor.sourceMergedUntilRound != null) throw new RangeError('Combatant cannot act');
}

function resolvedCast(actor, spell, level) {
  return finishCast(beginCast(actor, spell, level).actor, {note:spell}).actor;
}

export function reflectedSpell(reactor, caster, parts, options = {}, random = Math.random) {
  const rule = reactor.features?.reflectSpell;
  if (!rule || !reactor.hp || cannotAct(reactor) || reactor.sourceReflectionTurn === (reactor.turn ?? 0)) throw new RangeError('Reflection reaction is unavailable');
  if (options.attackSpell !== true || !Array.isArray(parts) || !parts.length || parts.length > 10) throw new RangeError('Only attack spells can be reflected');
  for (const part of parts) {
    combatNumber(part.amount);
    if (!DAMAGE_TYPES.includes(part.type)) throw new RangeError('Invalid reflected damage type');
  }
  const source = structuredClone(reactor); source.sourceReflectionTurn = source.turn ?? 0;
  const roll = options.reflectionRoll == null ? rollDie(rule.die, random) : combatNumber(options.reflectionRoll, 1, rule.die);
  const event = {kind:'reflectSpell', roll, amount:0};
  let target = structuredClone(caster);
  if (roll <= rule.maximum) {
    const bonus = combatNumber(options.spellAttackBonus, -1000, 1000) + rule.attackPenalty;
    const ac = target.ac + target.conditions.reduce((sum,c)=>sum+(c.acBonus ?? 0),0);
    event.check = rollAttack(bonus, ac, {dice:options.reflectedAttackDice,
      advantage:options.advantage, disadvantage:options.disadvantage, random});
    if (event.check.hit) for (const part of parts) {
      const amount = Math.floor(combatNumber(part.amount) * rule.damageFraction);
      const dealt = mitigateDamage(amount, part.type, target.defenses, {magical:true,attack:true});
      const result = resolveDamageFeatures(target, dealt.amount, {random});
      target = result.actor; event.amount += dealt.amount;
      (event.effects ??= []).push(...result.events);
    }
  }
  return {reactor:source, caster:target, event};
}

export function sourceSpellAction(fight, action, access, random = Math.random) {
  let actor = structuredClone(access.getActor(action.actor)); available(actor);
  if (actor.pendingCast) throw new RangeError('Resolve the pending spell first');
  if (action.kind === 'scriptedInvisibility') {
    const rule = actor.features?.scriptedInvisibility;
    if (!rule || actor.sourceInvisibilityUsed || (actor.turn ?? 0) > rule.turn) throw new RangeError('Printed opening is unavailable');
    actor.conditions = actor.conditions.filter(c=>c.concentrationMinimum == null);
    actor = addCondition(actor, {name:'invisible',remainingTurns:rule.durationTurns,concentrationMinimum:rule.concentrationMinimum}).actor;
    actor.sourceInvisibilityUsed = true;
    if (actor.features.displacement) actor.sourceDisplacementReady = true;
    access.setActor(action.actor, actor);
    return {spell:rule.spell,movement:rule.firstMoveFeet,printedSlotException:true};
  }
  if (action.kind === 'printedMageArmour') {
    const rule = actor.features?.printedMageArmour;
    if (!rule || !actor.sourceInvisibilityUsed || actor.sourceMageArmourCast) throw new RangeError('Printed Mage Armour is unavailable');
    actor = resolvedCast(actor, rule.spell, rule.level); actor.sourceMageArmourCast = true;
    access.setActor(action.actor, actor);
    return {spell:rule.spell,movement:hasCondition(actor,'invisible') ? rule.moveFeetWhileInvisible : 0,acAlreadyIncluded:true};
  }
  if (action.kind === 'combatSpeed') {
    if (!actor.features?.displacement) throw new RangeError('No speed-dependent feature');
    actor.currentSpeed = combatNumber(action.amount, 0, 1000);
    if (!actor.currentSpeed) actor.conditions = actor.conditions.filter(c=>c.name !== 'displaced');
    access.setActor(action.actor, actor); return {amount:actor.currentSpeed};
  }
  if (action.kind === 'displacement') {
    if (!actor.features?.displacement || actor.sourceDisplacementReady === false || hasCondition(actor,'displaced')
        || actor.currentSpeed === 0 || actor.sourceDisplacementTurn === (actor.turn ?? 0)) throw new RangeError('Displacement is unavailable');
    actor = addCondition(actor, {name:'displaced',endsOnDamage:true,endsIfIncapacitated:true}).actor;
    actor.sourceDisplacementReady = false; actor.sourceDisplacementTurn = actor.turn ?? 0;
    access.setActor(action.actor, actor); return {};
  }
  const target = access.getActor(action.target);
  if (action.actor === action.target || !target.hp) throw new RangeError('Choose a living target');
  if (action.kind === 'printedIllusion') {
    const rule = actor.features?.printedIllusions?.find(r=>r.key===action.illusion);
    if (!rule || !actor.sourceMageArmourCast || rule.stage !== (actor.sourceIllusionStage ?? 0) + 1) throw new RangeError('Resolve the preceding printed spell first');
    actor = resolvedCast(actor, rule.spell, rule.level);
    actor.sourceIllusionStage = rule.stage;
    const check = actorSave(target, rule.save.ability, rule.save.dc, {dice:action.saveDice,magical:true,random});
    let amount = 0;
    if (!check.success) {
      const roll = rollDamage(rule.damage.formula, {dice:action.damageDice,random});
      amount = mitigateDamage(roll.amount, rule.damage.type, target.defenses, {magical:true,attack:false}).amount;
      access.setActor(action.target, resolveDamageFeatures(target, amount, {random}).actor);
    }
    access.setActor(action.actor, actor);
    return {spell:rule.spell,check,amount,droppedWeapon:!check.success && Boolean(rule.droppedWeaponOnFailure)};
  }
  if (action.kind === 'reflectSpell') {
    const result = reflectedSpell(actor,target,action.damageParts,action,random);
    access.setActor(action.actor,result.reactor); access.setActor(action.target,result.caster);
    return result.event;
  }
  throw new RangeError('Unknown printed spell action');
}

export function reflectResolvedCast(fight, casterKey, before, effects, action, access, random = Math.random) {
  if (action.attackSpell !== true) return [];
  const events = [];
  for (const [key, original] of before) {
    if (!original.hp || cannotAct(original) || original.sourceReflectionTurn === (original.turn ?? 0)) continue;
    const parts = effects.flatMap((effect,i)=>effect.kind==='damage' && effect.target===key
      ? [{amount:effect.amount,type:action.results[i].type}] : []);
    if (!parts.length) continue;
    const result = reflectedSpell(original, access.getActor(casterKey), parts, action, random);
    // The reaction belongs to the incoming spell, including a fatal incoming hit.
    access.getActor(key).sourceReflectionTurn = result.reactor.sourceReflectionTurn;
    access.setActor(casterKey,result.caster); events.push({...result.event,actor:key,target:casterKey});
  }
  return events;
}
