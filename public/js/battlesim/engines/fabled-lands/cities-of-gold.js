import { createRosterLoader } from '../../roster-data.js';

export let CITIES_OF_GOLD_FIGHTS = [];
export const loadRoster = createRosterLoader(675, 'FIGHTS', rows => { CITIES_OF_GOLD_FIGHTS = rows; });

import { fabledDie, fabledInteger, validateFabledCharacter } from './character.js';

export const CITIES_OF_GOLD_SEA_CHECKS = Object.freeze({
  434: { kind: 'storm', destinations: [459, 534, 221], blessingDestination: 335 },
  484: { kind: 'storm', destinations: [459, 534, 198], blessingDestination: 358 },
  509: { kind: 'storm', destinations: [459, 534, 14], blessingDestination: 14 },
  583: { kind: 'storm', destinations: [459, 534, 14], blessingDestination: 198 },
  607: { kind: 'storm', destinations: [459, 534, 358], blessingDestination: 221 },
  411: { kind: 'escape', destinations: [461, 14] },
  435: { kind: 'escape', destinations: [485, 335] },
  488: { kind: 'escape', destinations: [538, 221], crewBonus: true },
  611: { kind: 'escape', destinations: [659, 198] },
  632: { kind: 'escape', destinations: [680, 358] },
  461: { kind: 'naval', destinations: [560, 535, 510, 14, 536] },
  485: { kind: 'naval', destinations: [560, 535, 510, 335, 584] },
  538: { kind: 'naval', destinations: [560, 535, 510, 221, 563] },
  659: { kind: 'naval', destinations: [560, 535, 510, 198, 683] },
  680: { kind: 'naval', destinations: [560, 535, 510, 358, 752] },
});

export function citiesOfGoldSeaCheck(section, input, options = {}, roll) {
  validateFabledCharacter(input, true);
  if (!Object.hasOwn(CITIES_OF_GOLD_SEA_CHECKS, section)) throw new RangeError('Invalid sea check');
  const { ship = 'barque', crew = 'average', safetyFromStorms = false } = options;
  if (!['barque', 'brigantine', 'galleon'].includes(ship)
    || !['poor', 'average', 'good', 'excellent'].includes(crew)
    || typeof safetyFromStorms !== 'boolean') throw new RangeError('Invalid ship settings');
  const spec = CITIES_OF_GOLD_SEA_CHECKS[section], character = structuredClone(input);
  if (safetyFromStorms) {
    if (spec.kind !== 'storm' || !character.stormsBlessing) throw new RangeError('Storm blessing unavailable');
    character.stormsBlessing = false;
    return { character, total: null, damage: 0, destination: spec.blessingDestination,
      status: 'safe', usedBlessing: true };
  }
  const count = spec.kind === 'storm' ? ['barque', 'brigantine', 'galleon'].indexOf(ship) + 1
    : spec.kind === 'naval' && character.profession === 'warrior' ? 3 : 2;
  const modifiers = spec.kind === 'storm' ? { poor: 0, average: 0, good: 1, excellent: 2 }
    : spec.kind === 'naval' ? { poor: -2, average: 0, good: 2, excellent: 3 }
      : spec.crewBonus ? { poor: 0, average: 1, good: 2, excellent: 3 }
        : { poor: -1, average: 0, good: 1, excellent: 2 };
  let total = modifiers[crew] + (spec.kind === 'storm' ? 0 : character.rank);
  for (let index = 0; index < count; index++) total += fabledDie(roll);
  fabledInteger(total, -1000);
  const outcome = spec.kind === 'storm' ? total <= 3 ? 0 : total <= 5 ? 1 : 2
    : spec.kind === 'escape' ? total <= 6 ? 0 : 1
      : total <= 4 ? 0 : total <= 9 ? 1 : total <= 13 ? 2 : total <= 17 ? 3 : 4;
  let damage = 0;
  if (spec.kind === 'naval' && outcome < 3) {
    damage = outcome === 0 ? character.stamina : outcome === 1 ? fabledDie(roll) + fabledDie(roll) : fabledDie(roll);
    character.stamina = Math.max(0, character.stamina - damage);
  }
  return { character, total, damage, destination: character.stamina ? spec.destinations[outcome] : 560,
    status: spec.kind === 'naval' ? outcome < 3 ? 'loss' : outcome === 4 ? 'win' : 'draw' : 'story',
    usedBlessing: false };
}
