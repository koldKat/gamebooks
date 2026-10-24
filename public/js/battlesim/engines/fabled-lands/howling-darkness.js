import { createRosterLoader } from '../../roster-data.js';
import { BLOOD_DARK_PROFESSIONS } from './blood-dark-sea.js';
import { fabledDie, validateFabledCharacter } from './character.js';

export const HOWLING_DEFAULTS = Object.freeze({ rank: 4, stamina: 20, shards: 65, armour: 3,
  professions: BLOOD_DARK_PROFESSIONS });

export let HOWLING_FIGHTS = [];
export const loadRoster = createRosterLoader(677, 'FIGHTS', rows => { HOWLING_FIGHTS = rows; });

const storm = (destinations, blessingDestination) => ({ kind: 'storm', destinations, blessingDestination });
const wreck = destination => ({ kind: 'shipwreck', destinations: [7, destination] });
export const HOWLING_SEA_CHECKS = Object.freeze({
  11: storm([135, 106, 236], 236), 161: storm([314, 386, 296], 296),
  512: storm([540, 453, 438], 438), 642: storm([608, 489, 580], 580),
  645: storm([288, 358, 533], 533),
  451: { kind: 'escape', destinations: [419, 236] },
  338: { kind: 'naval', bounds: [15, 18], destinations: [282, 240, 149] },
  392: { kind: 'naval', bounds: [10, 15], destinations: [282, 240, 149] },
  135: wreck(436), 288: wreck(67), 314: wreck(524), 540: wreck(585), 608: wreck(549),
});

export function howlingSeaCheck(section, input, options = {}, roll) {
  validateFabledCharacter(input, true);
  if (!Object.hasOwn(HOWLING_SEA_CHECKS, section)) throw new RangeError('Invalid sea check');
  const { ship = 'barque', crew = 'average', safetyFromStorms = false } = options;
  if (!['barque', 'brigantine', 'galleon'].includes(ship)
    || !['poor', 'average', 'good', 'excellent'].includes(crew)
    || typeof safetyFromStorms !== 'boolean') throw new RangeError('Invalid ship settings');
  const spec = HOWLING_SEA_CHECKS[section], character = structuredClone(input);
  if (safetyFromStorms) {
    if (spec.kind !== 'storm' || !character.stormsBlessing) throw new RangeError('Storm blessing unavailable');
    character.stormsBlessing = false;
    return { character, total: null, damage: 0, destination: spec.blessingDestination,
      status: 'safe', kind: spec.kind, usedBlessing: true };
  }
  const count = spec.kind === 'storm' ? ['barque', 'brigantine', 'galleon'].indexOf(ship) + 1
    : spec.kind === 'naval' && character.profession === 'warrior' ? 3 : 2;
  let total = 0;
  if (spec.kind === 'naval') total = character.rank + ({ poor: -2, average: 0, good: 2, excellent: 3 })[crew];
  else if (['storm', 'escape'].includes(spec.kind)) {
    total = ({ poor: 0, average: 0, good: 1, excellent: 2 })[crew];
    if (spec.kind === 'escape') total += character.rank;
  }
  for (let index = 0; index < count; index++) total += fabledDie(roll);
  let destination, damage = 0, status = 'story';
  if (spec.kind === 'shipwreck') {
    if (total > character.rank) damage = character.stamina;
    else damage = fabledDie(roll);
    destination = spec.destinations[1];
  } else {
    const bounds = spec.kind === 'storm' ? [3, 5] : spec.kind === 'escape' ? [10] : spec.bounds;
    const matched = bounds.findIndex(bound => total <= bound), outcome = matched < 0 ? bounds.length : matched;
    destination = spec.destinations[outcome];
    if (spec.kind === 'naval') status = outcome === 2 ? 'win' : outcome === 0 ? 'loss' : 'draw';
  }
  character.stamina = Math.max(0, character.stamina - damage);
  return { character, total, damage, destination: character.stamina ? destination : 7,
    status, kind: spec.kind, usedBlessing: false };
}
