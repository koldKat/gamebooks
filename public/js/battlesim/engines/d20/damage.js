// Apply typed encounter damage without changing story, inventory, or campaign state.
import {combatNumber} from './dice.js';

export const DAMAGE_TYPES = Object.freeze(['acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning',
  'necrotic', 'piercing', 'poison', 'psychic', 'radiant', 'slashing', 'thunder']);
const physical = new Set(['bludgeoning', 'piercing', 'slashing']);

export function validateDefenses(defenses = {}) {
  if (!defenses || typeof defenses !== 'object' || Array.isArray(defenses)) throw new RangeError('Invalid defenses');
  const result = {};
  for (const key of ['immunities', 'resistances', 'vulnerabilities']) {
    const values = defenses[key] ?? [];
    if (!Array.isArray(values) || values.some(type => !DAMAGE_TYPES.includes(type))) throw new RangeError('Invalid damage type');
    result[key] = [...new Set(values)];
  }
  for (const key of ['nonmagicalPhysicalResistance', 'nonmagicalAttackResistance', 'silverBypassesPhysicalResistance']) {
    if (defenses[key] !== undefined && typeof defenses[key] !== 'boolean') throw new RangeError('Invalid resistance');
    result[key] = defenses[key] ?? false;
  }
  return result;
}

export function mitigateDamage(amount, type, defenses = {}, {magical = false, silvered = false, attack = true} = {}) {
  combatNumber(amount);
  if (!DAMAGE_TYPES.includes(type) || typeof magical !== 'boolean' || typeof silvered !== 'boolean'
      || typeof attack !== 'boolean') throw new RangeError('Invalid damage');
  const traits = validateDefenses(defenses);
  if (traits.immunities.includes(type)) return {amount:0, immune:true, resisted:false, vulnerable:false};
  const resisted = traits.resistances.includes(type) || attack && !magical && (traits.nonmagicalAttackResistance
    || traits.nonmagicalPhysicalResistance && physical.has(type) && !(silvered && traits.silverBypassesPhysicalResistance));
  const vulnerable = traits.vulnerabilities.includes(type);
  // Multiple applicable resistances never stack; round the halved damage down.
  return {amount:(resisted ? Math.floor(amount / 2) : amount) * (vulnerable ? 2 : 1),
    immune:false, resisted:Boolean(resisted), vulnerable};
}

export function validateVitality(actor) {
  if (!actor || typeof actor !== 'object') throw new RangeError('Invalid combatant');
  combatNumber(actor.maxHp);
  combatNumber(actor.hp, 0, actor.maxHp);
  combatNumber(actor.baseMaxHp ?? actor.maxHp, Math.max(1, actor.maxHp));
  return actor;
}

export function applyDamage(actor, amount) {
  validateVitality(actor); combatNumber(amount);
  return {...actor, hp:Math.max(0, actor.hp - amount)};
}

export function healDamage(actor, amount) {
  validateVitality(actor); combatNumber(amount);
  return {...actor, hp:Math.min(actor.maxHp, actor.hp + amount)};
}

export function reduceMaximumHp(actor, amount) {
  validateVitality(actor); combatNumber(amount);
  const maxHp = Math.max(0, actor.maxHp - amount);
  return {...actor, baseMaxHp:actor.baseMaxHp ?? actor.maxHp, maxHp, hp:Math.min(actor.hp, maxHp)};
}
