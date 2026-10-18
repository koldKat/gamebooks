import {character} from './combat.js';

export function recover(player, effect) {
  const next = character(player);
  if (!next.stamina || next.stamina >= next.maxStamina) throw new RangeError('Recovery unavailable');
  const options = {healing: ['healingUses', 5], ointment: ['ointmentUses', 4], balm: ['balmUses', next.maxStamina]};
  const option = options[effect];
  if (!option || !next[option[0]] || effect === 'healing' && !next.abilities.includes('healing')) throw new RangeError('No recovery uses');
  next[option[0]]--;
  next.stamina = Math.min(next.maxStamina, next.stamina + option[1]);
  return next;
}
