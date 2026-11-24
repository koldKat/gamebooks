import { damageDice, percentileCheck } from './checks.js';

export function classicCheck(skill, random = Math.random, { doubled = false, impaling = false } = {}) {
  const chance = Math.min(100, skill * (doubled ? 2 : 1));
  const check = percentileCheck(chance, 0, random);
  return { ...check, level: check.roll > chance ? 1 : impaling && check.roll <= Math.floor(skill / 5) ? 4 : 2 };
}

export function resistanceCheck(active, passive, random = Math.random) {
  if (!Number.isSafeInteger(active) || !Number.isSafeInteger(passive) || active < 0 || passive < 0) {
    throw new RangeError('Invalid resistance rating');
  }
  return classicCheck(Math.min(100, Math.max(0, 50 + (active - passive) * 5)), random);
}

export function classicDamageBonus(strength, size) {
  const total = strength + size;
  if (total < 13) return '-1D6';
  if (total < 17) return '-1D4';
  if (total < 25) return '0';
  if (total < 33) return '1D4';
  return `${1 + Math.ceil(Math.max(0, total - 40) / 16)}D6`;
}

export function resolveClassicManeuver(fight, actor, target, random) {
  const rule = fight.spec.classicManeuver;
  const helper = fight.party.find(member => member.role === rule.assist && member.hp > 0 && !member.unconscious && !member.fled);
  const skill = rule.skill && !fight.classicHold ? classicCheck(actor[rule.skill], random) : null;
  const resistance = !skill || skill.level >= 2 ? resistanceCheck(actor.str + (helper?.str ?? 0), target.str, random) : null;
  const succeeded = resistance?.level >= 2;
  fight.classicHold = succeeded ? (fight.classicHold ?? 0) + 1 : 0;
  let damage = 0;
  if (fight.classicHold >= (rule.holds ?? 1)) {
    fight.status = rule.outcome ?? 'escaped';
  } else if (!succeeded && rule.failureDamage) {
    const victim = rule.victim ? fight.party.find(member => member.role === rule.victim) : actor;
    if (!victim) throw new RangeError('Missing combatant');
    damage = Math.min(victim.hp, damageDice(rule.failureDamage, random).total);
    victim.hp -= damage;
    if (victim.hp === 0) fight.status = 'loss';
  }
  return { attack: skill ?? resistance, defense: skill ? resistance : null, maneuver: { succeeded, damage } };
}
