import { createRosterLoader } from '../../roster-data.js';

export let CITIES_OF_GOLD_FIGHTS = [];
export let CITIES_OF_GOLD_SEA_CHECKS = Object.freeze({});
export const CITIES_OF_GOLD_RULES = {};
export const loadRoster = createRosterLoader(675, 'FIGHTS', rows => {
  const support = rows.find(row => row.support)?.support;
  if (!support?.seaChecks || !support.rules) throw new Error('Incomplete Cities of Gold settings');
  CITIES_OF_GOLD_FIGHTS = rows.map(({support, ...row}) => row);
  CITIES_OF_GOLD_SEA_CHECKS = Object.freeze(support.seaChecks);
  Object.assign(CITIES_OF_GOLD_RULES, support.rules);
});

import { fabledDie, fabledInteger, validateFabledCharacter } from './character.js';

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
  const count = spec.kind === 'storm' ? CITIES_OF_GOLD_RULES.shipDice[ship]
    : spec.kind === 'naval' && character.profession === 'warrior' ? CITIES_OF_GOLD_RULES.warriorNavalDice : CITIES_OF_GOLD_RULES.otherDice;
  const modifiers = CITIES_OF_GOLD_RULES.crewModifiers[spec.kind === 'escape' && spec.crewBonus ? 'escapeBonus' : spec.kind];
  let total = modifiers[crew] + (spec.kind === 'storm' ? 0 : character.rank);
  for (let index = 0; index < count; index++) total += fabledDie(roll);
  fabledInteger(total, -1000);
  const thresholds = CITIES_OF_GOLD_RULES.thresholds[spec.kind];
  const match = thresholds.findIndex(limit => total <= limit);
  const outcome = match < 0 ? thresholds.length : match;
  let damage = 0;
  if (spec.kind === 'naval' && outcome < CITIES_OF_GOLD_RULES.navalLossOutcomes) {
    if (outcome === 0) damage = character.stamina;
    else for (let index = 0; index < CITIES_OF_GOLD_RULES.navalDamageDice[outcome]; index++) damage += fabledDie(roll);
    character.stamina = Math.max(0, character.stamina - damage);
  }
  return { character, total, damage, destination: character.stamina ? spec.destinations[outcome] : CITIES_OF_GOLD_RULES.deathDestination,
    status: spec.kind === 'naval' ? outcome < CITIES_OF_GOLD_RULES.navalLossOutcomes ? 'loss' : outcome === CITIES_OF_GOLD_RULES.navalWinOutcome ? 'win' : 'draw' : 'story',
    usedBlessing: false };
}
