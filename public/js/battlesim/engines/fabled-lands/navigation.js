import { fabledDie, fabledInteger, validateFabledCharacter } from './character.js';

export const FABLED_SEA_CHECKS = Object.freeze({
  38: { kind: 'storm', destinations: [325, 397, 209] },
  124: { kind: 'storm', destinations: [346, 583, 420] },
  324: { kind: 'storm', destinations: [607, 83, 559] },
  586: { kind: 'storm', destinations: [182, 530, 85] },
  613: { kind: 'storm', destinations: [485, 70, 439] },
  639: { kind: 'storm', destinations: [219, 67, 507] },
  51: { kind: 'naval', destinations: [680, 153, 242, 62] },
  311: { kind: 'naval', destinations: [680, 153, 242, 62] },
  444: { kind: 'escape', destinations: [51, 402] },
});

export function fabledSeaCheck(section, input, options = {}, roll) {
  validateFabledCharacter(input, true);
  if (!Object.hasOwn(FABLED_SEA_CHECKS, section)) throw new RangeError('Invalid sea check');
  const { ship = 'barque', crew = 'average', safetyFromStorms = false } = options;
  if (!['barque', 'brigantine', 'galleon'].includes(ship) || !['poor', 'average', 'good', 'excellent'].includes(crew)
    || typeof safetyFromStorms !== 'boolean') throw new RangeError('Invalid ship settings');
  const spec = FABLED_SEA_CHECKS[section], character = structuredClone(input);
  if (safetyFromStorms) {
    if (spec.kind !== 'storm' || !character.stormsBlessing) throw new RangeError('Storm blessing unavailable');
    character.stormsBlessing = false;
    return { character, total: null, destination: spec.destinations[2], status: 'safe', usedBlessing: true };
  }
  const count = spec.kind === 'storm' ? ['barque', 'brigantine', 'galleon'].indexOf(ship) + 1
    : spec.kind === 'naval' && character.profession === 'warrior' ? 3 : 2;
  const modifiers = spec.kind === 'storm' ? { poor: 0, average: 0, good: 1, excellent: 2 }
    : spec.kind === 'naval' ? { poor: -2, average: 0, good: 2, excellent: 3 }
      : { poor: -1, average: 0, good: 1, excellent: 2 };
  let total = modifiers[crew] + (spec.kind === 'storm' ? 0 : character.rank);
  for (let index = 0; index < count; index++) total += fabledDie(roll);
  fabledInteger(total, -1000);
  const outcome = spec.kind === 'storm' ? total <= 3 ? 0 : total <= 5 ? 1 : 2
    : spec.kind === 'naval' ? total <= 4 ? 0 : total <= 9 ? 1 : total <= 13 ? 2 : 3
      : total <= 7 ? 0 : 1;
  let damage = 0;
  if (spec.kind === 'naval' && outcome < 2) {
    damage = outcome === 0 ? character.stamina : fabledDie(roll);
    character.stamina = Math.max(0, character.stamina - damage);
  }
  return { character, total, damage, destination: !character.stamina ? 680 : spec.destinations[outcome],
    status: spec.kind === 'naval' ? outcome < 2 ? 'loss' : outcome === 3 ? 'win' : 'draw' : 'story', usedBlessing: false };
}
