import { fabledDie, fabledInteger, validateFabledCharacter } from './character.js';
import { FABLED_SEA_CHECKS, WAR_TORN_RULES } from './roster.js';
export { FABLED_SEA_CHECKS } from './roster.js';

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
    return { character, total: null, destination: spec.destinations[WAR_TORN_RULES.stormBlessingOutcome], status: 'safe', usedBlessing: true };
  }
  const count = spec.kind === 'storm' ? WAR_TORN_RULES.shipDice[ship]
    : spec.kind === 'naval' && character.profession === 'warrior' ? WAR_TORN_RULES.warriorNavalDice : WAR_TORN_RULES.otherDice;
  const modifiers = WAR_TORN_RULES.crewModifiers[spec.kind];
  let total = modifiers[crew] + (spec.kind === 'storm' ? 0 : character.rank);
  for (let index = 0; index < count; index++) total += fabledDie(roll);
  fabledInteger(total, -1000);
  const thresholds = WAR_TORN_RULES.thresholds[spec.kind];
  const match = thresholds.findIndex(limit => total <= limit);
  const outcome = match < 0 ? thresholds.length : match;
  let damage = 0;
  if (spec.kind === 'naval' && outcome < 2) {
    damage = outcome === 0 ? character.stamina : fabledDie(roll);
    character.stamina = Math.max(0, character.stamina - damage);
  }
  return { character, total, damage, destination: !character.stamina ? WAR_TORN_RULES.deathDestination : spec.destinations[outcome],
    status: spec.kind === 'naval' ? outcome < 2 ? 'loss' : outcome === 3 ? 'win' : 'draw' : 'story', usedBlessing: false };
}
