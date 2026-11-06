// Resolve source-defined visibility, awareness, cover, and retreat attack modifiers.
import {combatNumber, rollCheck, rollDie} from './dice.js';
import {hasCondition} from './effects.js';

export function combatSkillCheck(actor, skill, dc, {dice, random = Math.random} = {}) {
  const ability = {perception:'wis', survival:'wis', athletics:'str', acrobatics:'dex'}[skill];
  if (!ability) throw new RangeError('Invalid encounter skill');
  const bonus = combatNumber(actor.skillBonuses?.[skill] ?? actor.abilities[ability], -1000, 1000);
  const check = rollCheck(bonus, {dice, random,
    disadvantage:hasCondition(actor, 'poisoned') || hasCondition(actor, 'confused')});
  return {...check, success:check.total >= combatNumber(dc, 0, 1000)};
}

export function sourceAttackContext(attacker, target, attack, action, random = Math.random) {
  const result = {advantage:false, disadvantage:Boolean(attacker.sourceTurnDisadvantage),
    bonusAdjustment:0, automaticMiss:false, targetSaveAdvantage:false, events:[]};
  const location = target.features?.targetLocation;
  if (location && (!location.whileInvisible || hasCondition(target, 'invisible'))) {
    const check = combatSkillCheck(attacker, location.skill, location.dc, {dice:action.locationDice, random});
    let located = check.success, wildShot;
    if (!located && location.wildShot && action.attemptWildShot) {
      wildShot = action.wildShotRoll == null ? rollDie(location.wildShot.die, random)
        : combatNumber(action.wildShotRoll, 1, location.wildShot.die);
      located = wildShot >= location.wildShot.minimum;
    }
    result.automaticMiss = !located;
    result.disadvantage ||= located && Boolean(location.successDisadvantage);
    result.targetSaveAdvantage = located && Boolean(action.areaSpell && location.areaSpellSaveAdvantage);
    result.events.push({kind:'targetLocation', check, roll:wildShot, located});
  }
  const camouflage = target.features?.camouflage;
  if (camouflage) {
    if (action.opportunity) {
      result.disadvantage ||= attacker.sourceAttackAwareness?.[action.target] !== true;
    } else if (action.targetStationary && camouflage.invisibleWhileStill) {
      result.disadvantage = true;
    } else {
      const check = combatSkillCheck(attacker, camouflage.skill, camouflage.dc, {dice:action.locationDice, random});
      result.awareness = check.success;
      result.disadvantage ||= !check.success && Boolean(camouflage.failureAttackDisadvantage);
      result.events.push({kind:'camouflage', check});
    }
  }
  const awareness = attacker.features?.defenderAwareness;
  if (!result.automaticMiss && awareness) {
    const skill = action.awarenessSkill ?? awareness.skills[0];
    if (!awareness.skills.includes(skill)) throw new RangeError('Invalid encounter awareness skill');
    const check = combatSkillCheck(target, skill, awareness.dc, {dice:action.awarenessDice, random});
    result.advantage ||= !check.success && Boolean(awareness.failureAttackAdvantage);
    result.events.push({kind:'defenderAwareness', check});
  }
  const cover = target.features?.submergedCover;
  if (cover && !attacker.tags?.includes(cover.ignoredByTag)) result.bonusAdjustment += combatNumber(cover.attackPenalty, -1000, 0);
  if (action.opportunity && target.features?.retreatOpportunityDisadvantage) result.disadvantage = true;
  return result;
}
