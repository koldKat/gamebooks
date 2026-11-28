// Resolve printed environmental damage, shifting darkness, and weapon corrosion.
import {combatNumber, rollDamage, rollDie} from './dice.js';
import {activeDefenses, healDamage, isDefeated, mitigateDamage, reduceMaximumHp} from './damage.js';
import {actorSave, addCondition, armorClass, cannotAct, drainAbilityScore, hasCondition, resolveDamageFeatures} from './effects.js';
import {spendCombatAction} from './action-allowance.js';
import {combatSkillCheck} from './attack-context.js';
import {refreshPrintedDefense} from './printed-actions.js';

function die(sides, value, random) {
  return value == null ? rollDie(sides, random) : combatNumber(value, 1, sides);
}

function damage(actor, formula, type, dice, random) {
  const roll = rollDamage(formula, {dice, random});
  const dealt = mitigateDamage(roll.amount, type, activeDefenses(actor), {attack:false});
  const result = resolveDamageFeatures(actor, dealt.amount, {damageTypes:[type], random});
  return {actor:result.actor, event:{kind:'sourceDamage', amount:dealt.amount, type, roll, effects:result.events}};
}

function ignite(actor, rule) {
  if (!actor.hp || actor.conditions.some(c => c.name === 'burning')) return actor;
  return addCondition(actor, {name:'burning', startTurnDamage:{formula:rule.formula, type:rule.type}}).actor;
}

export function sourceTurnEffects(fight, key, source, action, random = Math.random) {
  let actor = structuredClone(source); const events = [];
  delete actor.exposedByAttack;
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
  const drain = actor.features?.abilityDrain;
  if (drain && actor.hp && actor.abilityDrainReady === false) {
    const roll = die(6, action.roll, random);
    actor.abilityDrainReady = roll >= drain.recharge;
    if (actor.abilityDrainReady) events.push({kind:'abilityDrainRecharged', roll});
  }
  const trickery = actor.features?.turnInvisibility;
  if (trickery && actor.hp && actor.turnInvisibilityReady === false) {
    const roll = die(6, action.invisibilityRoll, random);
    actor.turnInvisibilityReady = roll >= trickery.recharge;
    if (actor.turnInvisibilityReady) events.push({kind:'turnInvisibilityRecharged', roll});
  }
  if (actor.features?.focusedRecovery && fight.opponent.options?.naturalTerrain !== false
      && actor.hp && hasCondition(actor,'focusedRecovery') && action.naturalTerrain !== false) {
    const healed = healDamage(actor,actor.features.focusedRecovery.amount);
    events.push({kind:'regeneration',amount:healed.hp-actor.hp});
    actor = healed;
  }
  events.push(...refreshPrintedDefense(actor,action,random));
  return {actor, events};
}

export function sourceAttackEffects(fight, action, attack, event, access, random = Math.random) {
  let attacker = access.getActor(action.actor), target = access.getActor(action.target);
  if (attack.exposesAttacker) attacker.exposedByAttack = true;
  if (!event.check.hit) return;
  if (attacker.features?.smother?.attackIndices.includes(action.attackIndex) && !action.opportunity) {
    if (attacker.smotherHitsRound !== fight.round) attacker.smotherHits = {};
    attacker.smotherHitsRound = fight.round;
    const hits = attacker.smotherHits[action.target] ??= [];
    if (!hits.includes(action.attackIndex)) hits.push(action.attackIndex);
  }
  const temporaryHp = attacker.features?.temporaryHpOnMeleeHit;
  if (temporaryHp && attack.kind !== 'save' && attack.range == null && !attack.ranged) {
    if (attacker.lastMeleeHitRound !== fight.round) attacker.meleeHitsThisRound = 0;
    attacker.lastMeleeHitRound = fight.round;
    attacker.meleeHitsThisRound++;
    const granted = attacker.meleeHitsThisRound < 2 ? temporaryHp.first : temporaryHp.repeated;
    const amount = Math.max(0, granted-(attacker.temporaryHp ?? 0));
    attacker.temporaryHp = (attacker.temporaryHp ?? 0)+amount;
    event.effects.push({kind:'temporaryHpGranted', amount, current:attacker.temporaryHp});
  }
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
  if (attack.drainDamageType) {
    target = access.getActor(action.target);
    const drained = event.damage.filter(part => part.type === attack.drainDamageType).reduce((sum, part) => sum + part.amount, 0);
    if (drained) {
      const reduced = reduceMaximumHp(target, drained);
      if (!reduced.maxHp) reduced.dead = true;
      access.setActor(action.target, reduced);
      access.setActor(action.actor, healDamage(attacker, drained));
      event.effects.push({kind:'vitalityDrain', amount:drained, target:action.target, current:reduced.maxHp});
    }
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
  const current = rows(fight);
  for (const [i, actor] of current.entries()) {
    if (actor.features?.focusedRecovery && hasCondition(previous[i],'focusedRecovery') && !hasCondition(actor,'focusedRecovery')) {
      actor.recoveryLostRound = fight.round;
    }
    if (actor.smothering) {
      const {index, key} = actor.smothering;
      const target = current[index];
      if (isDefeated(actor) || isDefeated(target) || !target.conditions.some(condition => condition.smotherer === key)) {
        target.conditions = target.conditions.filter(condition => condition.smotherer !== key);
        delete actor.smothering;
      }
    }
    const rule = actor.features?.mergeIntoFire;
    if (rule && actor.hp && actor.sourceMergedUntilRound == null && previous[i].hp - actor.hp > rule.damageAbove) {
      actor.sourceMergedUntilRound = fight.round + combatNumber(rule.absentRounds, 1, 100);
      (event.effects ??= []).push({kind:'mergedIntoFire'});
    }
    const threshold = actor.features?.withdrawAtOrBelow;
    if (threshold != null && !actor.withdrawn && actor.hp <= threshold && actor.hp < previous[i].hp) {
      actor.withdrawn = true;
      (event.effects ??= []).push({kind:'enemyWithdrew',actor:'enemy'+fight.groups.indexOf(actor)});
    }
  }
  const surrender = fight.groups.find(actor => actor.hp && !actor.withdrawn && actor.features?.offerSurrenderBelow);
  if (surrender && !fight.surrenderOffer && fight.player.hp < combatNumber(surrender.features.offerSurrenderBelow, 1)
      && fight.player.hp < before.player.hp) {
    fight.player.hp = Math.max(1, fight.player.hp);
    delete fight.player.dead;
    fight.surrenderOffer = 'offered';
    (event.effects ??= []).push({kind:'surrenderOffered'});
  }
  const pair = fight.opponent.options?.pairedOpponents;
  if (pair) {
    const primary = fight.groups.find(actor => actor.key === pair.primary);
    const support = fight.groups.find(actor => actor.key === pair.support);
    if (primary && support && isDefeated(primary) && !isDefeated(support)) {
      support.withdrawn = true;
      (event.effects ??= []).push({kind:'enemyWithdrew', actor:'enemy'+fight.groups.indexOf(support)});
    } else if (primary && support && isDefeated(support) && !isDefeated(primary) && !primary.encounterAttackPenalty) {
      primary.encounterAttackPenalty = {amount:combatNumber(pair.attackPenalty,1,100)};
      (event.effects ??= []).push({kind:'lostSupport', actor:'enemy'+fight.groups.indexOf(primary)});
    }
  }
}

export function beginAttackedForm(actor) {
  const form = actor.features?.formOnFirstAttack;
  if (!form || actor.attackedFormActive) return null;
  actor.attackedFormActive = true;
  actor.name = form.name;
  actor.hp = actor.maxHp = combatNumber(form.hp, 1, actor.baseMaxHp);
  return {kind:'attackedForm', current:actor.hp};
}

export function endSourceTurn(actor) {
  if (actor.zeroRecoveryTurn != null && (actor.turn ?? 0) >= actor.zeroRecoveryTurn) {
    const recovered = healDamage(actor, combatNumber(actor.features.zeroHpRecovery.amount,1));
    actor.hp = recovered.hp;
    delete actor.zeroRecoveryTurn;
    return actor.hp ? {kind:'regeneration', amount:actor.hp} : {kind:'regenerationBlocked'};
  }
  if (actor.hp && actor.attackedFormActive && actor.features?.formOnFirstAttack?.withdrawAfterTurn) {
    actor.withdrawn = true;
    return {kind:'enemyWithdrew'};
  }
  return null;
}

export function useEncounterAsset(actor, id) {
  const assets = actor.features?.defeatingAssets;
  const rule = assets?.find(asset => asset.id === id);
  if (!actor.hp || actor.withdrawn || !rule) throw new RangeError('This asset does not defeat the opponent');
  actor.withdrawn = true;
  const reward = actor.experience ?? 0;
  return {asset:rule.label, gamebookXp:Math.floor(reward / 2)};
}

export const SOURCE_ACTIONS = ['douse', 'touchFire', 'enterFireSpace', 'water', 'reappear', 'abilityDrain',
  'demoralizingLaugh', 'smother', 'escapeSmother', 'turnInvisibility'];

export function sourceEnvironmentalAction(fight, action, access, random = Math.random) {
  const original = access.getActor(action.actor);
  if (!original.hp) throw new RangeError('Combatant cannot act');
  let actor = structuredClone(original);
  if (action.kind === 'turnInvisibility') {
    if (!actor.features?.turnInvisibility || actor.turnInvisibilityReady === false || cannotAct(actor)
        || actor.specialBonusRound === fight.round) throw new RangeError('Invisibility is unavailable');
    actor = addCondition(actor,{name:'invisible',expiresAtStart:true,endsOnAttackOrCast:true}).actor;
    actor.turnInvisibilityReady = false;
    actor.specialBonusRound = fight.round;
    access.setActor(action.actor, actor);
    return {};
  }
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
  if (['demoralizingLaugh','smother','escapeSmother'].includes(action.kind)) {
    return sourceBonusAction(fight, action, actor, target, access, random);
  }
  if (action.kind === 'abilityDrain') {
    const rule = actor.features?.abilityDrain;
    const ability = action.ability;
    if (!rule || actor.abilityDrainReady === false || cannotAct(actor) || combatNumber(action.distance) > rule.range
        || !Object.hasOwn(target.abilities, ability)) throw new RangeError('Ability drain is unavailable');
    const previous = combatNumber(target.abilityScores?.[ability], 1, 1000);
    spendCombatAction(fight, action.actor, actor);
    const check = actorSave(target, ability, rule.dc, {dice:action.dice, random});
    const current = drainAbilityScore(target, ability, check.success ? 1 : 2);
    actor.abilityDrainReady = false;
    access.setActor(action.actor, actor);
    return {ability, check, current, amount:previous-current};
  }
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

function sourceBonusAction(fight, action, actor, target, access, random) {
  if (cannotAct(actor) || actor.specialBonusRound === fight.round) throw new RangeError('Bonus action unavailable');
  let check;
  if (action.kind === 'demoralizingLaugh') {
    const rule = actor.features?.demoralizingLaugh;
    if (!rule || combatNumber(action.distance) > rule.range || hasCondition(target,'deafened')) throw new RangeError('Target cannot hear the effect');
    if (armorClass(target) > rule.acCap) {
      check = actorSave(target,'wis',rule.dc,{dice:action.dice,magical:true,random});
      if (!check.success) access.setActor(action.target, addCondition(target,{name:'demoralized', acCap:rule.acCap, remainingTurns:1}).actor);
    }
  } else {
    if (!['str','dex'].includes(action.ability)) throw new RangeError('Choose Strength or Dexterity');
    if (action.kind === 'smother') {
      const rule = actor.features?.smother;
      const hits = actor.smotherHitsRound === fight.round ? actor.smotherHits[action.target] : null;
      if (!rule || actor.smothering || combatNumber(action.distance) > rule.range
          || !rule.attackIndices.every(index => hits?.includes(index))) throw new RangeError('Both attacks must hit the same target');
      check = actorSave(target,action.ability,rule.dc,{dice:action.dice,random});
      if (!check.success) {
        let affected = target;
        for (const name of ['grappled','blinded']) affected = addCondition(affected,{name,smotherer:action.actor}).actor;
        access.setActor(action.target, affected);
        const index = action.target === 'player' ? 0 : action.target.startsWith('ally')
          ? Number(action.target.slice(4))+1 : 1+fight.companions.length+Number(action.target.slice(5));
        actor.smothering = {key:action.actor,target:action.target,index};
      }
    } else {
      const rule = target.features?.smother;
      if (!rule || target.smothering?.target !== action.actor) throw new RangeError('No smother to escape');
      check = actorSave(actor,action.ability,rule.dc,{dice:action.dice,random});
      if (check.success) {
        actor.conditions = actor.conditions.filter(condition => condition.smotherer !== action.target);
        delete target.smothering;
      }
    }
  }
  actor.specialBonusRound = fight.round;
  access.setActor(action.actor,actor);
  return {check};
}
