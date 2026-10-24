import { createRosterLoader } from '../../roster-data.js';

export let MARSH_ENCOUNTERS = Object.freeze([]);
export const loadRoster = createRosterLoader(521, 'MARSH_ENCOUNTERS', rows => { MARSH_ENCOUNTERS = Object.freeze(rows); });

export function expandMarshEncounter(section, { count, manualDamage } = {}) {
  const encounter = MARSH_ENCOUNTERS.find(entry => String(entry.section) === String(section));
  if (!encounter) throw new RangeError('Unknown encounter');
  if (count !== undefined && !encounter.configurableCount?.includes(count)) throw new RangeError('Invalid enemy count');
  if (encounter.manualDamageRequired && (!Number.isInteger(manualDamage) || manualDamage < 0)) {
    throw new RangeError('This source omits damage; set it explicitly rather than inventing a value');
  }
  const foes = encounter.foes.flatMap(foe => Array.from({ length: count ?? foe.count }, (_, index) => ({
    name: foe.name + (foe.count > 1 ? ` ${index + 1}` : ''),
    expertise: foe.expertise, vitality: foe.vitality, initialVitality: foe.vitality,
    damage: foe.damage ?? manualDamage,
  })));
  return { ...encounter, foes };
}
