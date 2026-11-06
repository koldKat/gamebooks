// Track prepared spells and slots without inventing unprinted spell outcomes.
import {combatNumber} from './dice.js';

export function normalizeSpellcasting(source, remaining) {
  if (!source || !source.spells || !source.slots) throw new RangeError('Invalid spellcasting');
  const casting = structuredClone(source), slots = {};
  if (remaining != null && (typeof remaining !== 'object' || Array.isArray(remaining)
      || Object.keys(remaining).length !== Object.keys(casting.slots).length)) throw new RangeError('Invalid saved slots');
  for (const [level, spells] of Object.entries(casting.spells)) {
    if (!/^[0-9]$/.test(level) || !Array.isArray(spells) || spells.length > 100
        || spells.some(spell => typeof spell !== 'string' || !spell.trim() || spell.length > 100)
        || new Set(spells).size !== spells.length) throw new RangeError('Invalid prepared spells');
  }
  for (const [level, maximum] of Object.entries(casting.slots)) {
    if (!/^[1-9]$/.test(level)) throw new RangeError('Invalid slot level');
    combatNumber(maximum, 0, 100);
    slots[level] = combatNumber(remaining == null ? maximum : remaining[level], 0, maximum);
  }
  if (remaining && Object.keys(remaining).some(level => !(level in slots))) throw new RangeError('Invalid saved slots');
  return {casting, slots};
}

export function validatePendingCast(actor) {
  const pending = actor.pendingCast;
  if (!pending) return;
  if (!actor.spellcasting || typeof pending.spell !== 'string' || !/^[0-9]$/.test(String(pending.level))) throw new RangeError('Invalid pending spell');
  const base = Object.entries(actor.spellcasting.spells).find(([, spells]) => spells.includes(pending.spell));
  if (!base || Number(base[0]) > pending.level || (Number(base[0]) === 0) !== (pending.level === 0)) throw new RangeError('Invalid pending spell');
  if (pending.level && (!(pending.level in actor.spellSlots)
      || actor.spellSlots[pending.level] >= actor.spellcasting.slots[pending.level])) throw new RangeError('Pending spell slot was not spent');
}

export function beginCast(source, spell, level) {
  if (!source.spellcasting || source.pendingCast) throw new RangeError('Resolve the pending spell first');
  combatNumber(level, 0, 9);
  const {casting, slots} = normalizeSpellcasting(source.spellcasting, source.spellSlots);
  const base = Object.entries(casting.spells).find(([, spells]) => spells.includes(spell));
  if (!base || Number(base[0]) > level || (Number(base[0]) === 0) !== (level === 0)) throw new RangeError('Spell is not prepared at that level');
  if (level && !slots[level]) throw new RangeError('No spell slot available');
  if (level) slots[level]--;
  const actor = {...source, spellSlots:slots, pendingCast:{spell, level}};
  return {actor, event:{kind:'cast', spell, level, remaining:level ? slots[level] : null}};
}

export function finishCast(source, {cancel = false, note} = {}) {
  validatePendingCast(source);
  if (!source.pendingCast) throw new RangeError('No pending spell');
  if (typeof note !== 'string' || !note.trim() || note.length > 500) throw new RangeError('Record the spell resolution');
  const actor = structuredClone(source), pending = actor.pendingCast;
  // Cancellation is available only before any result has been committed.
  if (cancel && pending.level) actor.spellSlots[pending.level]++;
  const displacement = actor.features?.displacement;
  if (!cancel && displacement && pending.level >= displacement.rechargesAfterIllusionSpellMinimumLevel
      && displacement.illusionSpells.includes(pending.spell)) actor.sourceDisplacementReady = true;
  delete actor.pendingCast;
  return {actor, event:{kind:cancel ? 'cancelCast' : 'resolveCast', ...pending, note:note.trim()}};
}
