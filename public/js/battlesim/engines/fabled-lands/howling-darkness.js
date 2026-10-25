import { createRosterLoader } from '../../roster-data.js';
import { BLOOD_DARK_PROFESSIONS } from './blood-dark-sea.js';
import { fabledDie, validateFabledCharacter } from './character.js';

export const HOWLING_DEFAULTS = Object.freeze({ rank: 4, stamina: 20, shards: 65, armour: 3,
  professions: BLOOD_DARK_PROFESSIONS });

export let HOWLING_FIGHTS = [];
export let HOWLING_SEA_CHECKS = Object.freeze({});
export const HOWLING_RULES = {};
export const loadRoster = createRosterLoader(677, 'FIGHTS', rows => {
  const support = rows.find(row => row.support)?.support;
  if (!support?.seaChecks || !support.rules) throw new Error('Incomplete Howling Darkness settings');
  HOWLING_FIGHTS = rows.map(({support, ...row}) => row);
  HOWLING_SEA_CHECKS = Object.freeze(support.seaChecks);
  Object.assign(HOWLING_RULES, support.rules);
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
  const count = spec.kind === 'storm' ? HOWLING_RULES.shipDice[ship]
    : spec.kind === 'naval' && character.profession === 'warrior' ? HOWLING_RULES.warriorNavalDice : HOWLING_RULES.otherDice;
  let total = Object.hasOwn(HOWLING_RULES.crewModifiers, spec.kind) ? HOWLING_RULES.crewModifiers[spec.kind][crew] : 0;
  if (HOWLING_RULES.rankKinds.includes(spec.kind)) total += character.rank;
  for (let index = 0; index < count; index++) total += fabledDie(roll);
  let destination, damage = 0, status = 'story';
  if (spec.kind === 'shipwreck') {
    if (total > character.rank) damage = character.stamina;
    else for (let index = 0; index < HOWLING_RULES.wreckDamageDice; index++) damage += fabledDie(roll);
    destination = spec.destinations[HOWLING_RULES.wreckSurvivorOutcome];
  } else {
    const bounds = spec.bounds ?? HOWLING_RULES.thresholds[spec.kind];
    const matched = bounds.findIndex(bound => total <= bound), outcome = matched < 0 ? bounds.length : matched;
    destination = spec.destinations[outcome];
    if (spec.kind === 'naval') status = outcome === HOWLING_RULES.navalWinOutcome ? 'win' : outcome === HOWLING_RULES.navalLossOutcome ? 'loss' : 'draw';
  }
  character.stamina = Math.max(0, character.stamina - damage);
  return { character, total, damage, destination: character.stamina ? destination : HOWLING_RULES.deathDestination,
    status, kind: spec.kind, usedBlessing: false };
}
