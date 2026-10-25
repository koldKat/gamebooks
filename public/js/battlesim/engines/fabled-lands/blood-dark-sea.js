import { createRosterLoader } from '../../roster-data.js';

export const BLOOD_DARK_PROFESSIONS = Object.freeze({
  priest: [5, 3, 4, 7, 5, 2], mage: [3, 3, 7, 1, 6, 4], rogue: [6, 5, 5, 2, 3, 7],
  warrior: [4, 7, 2, 5, 4, 3], troubadour: [7, 4, 5, 4, 3, 5], wayfarer: [3, 6, 3, 4, 7, 5],
});

export const BLOOD_DARK_DEFAULTS = Object.freeze({ rank: 3, stamina: 16, shards: 40, armour: 3,
  professions: BLOOD_DARK_PROFESSIONS, abilityCurse: false });

export let BLOOD_DARK_FIGHTS = [];
export let BLOOD_DARK_SEA_CHECKS = Object.freeze({});
export const BLOOD_DARK_RULES = {};
export const loadRoster = createRosterLoader(676, 'FIGHTS', rows => {
  const support = rows.find(row => row.support)?.support;
  if (!support?.seaChecks || !support.rules) throw new Error('Incomplete Blood-Dark Sea settings');
  BLOOD_DARK_FIGHTS = rows.map(({support, ...row}) => row);
  BLOOD_DARK_SEA_CHECKS = Object.freeze(support.seaChecks);
  Object.assign(BLOOD_DARK_RULES, support.rules);
});
import { fabledDie, fabledInteger, validateFabledCharacter } from './character.js';

export function bloodDarkSeaCheck(section, input, options = {}, roll) {
  validateFabledCharacter(input, true);
  if (!Object.hasOwn(BLOOD_DARK_SEA_CHECKS, section)) throw new RangeError('Invalid sea check');
  const { ship = 'barque', crew = 'average', safetyFromStorms = false } = options;
  if (!['barque', 'brigantine', 'galleon'].includes(ship)
    || !['poor', 'average', 'good', 'excellent'].includes(crew)
    || typeof safetyFromStorms !== 'boolean') throw new RangeError('Invalid ship settings');
  const spec = BLOOD_DARK_SEA_CHECKS[section], character = structuredClone(input);
  if (safetyFromStorms) {
    if (!BLOOD_DARK_RULES.blessingKinds.includes(spec.kind) || !character.stormsBlessing) throw new RangeError('Storm blessing unavailable');
    character.stormsBlessing = false;
    return { character, total: null, damage: 0, destination: spec.blessingDestination,
      status: 'safe', usedBlessing: true };
  }
  const shipDice = BLOOD_DARK_RULES.shipDice[ship];
  const count = BLOOD_DARK_RULES.shipDiceKinds.includes(spec.kind) ? shipDice
    : BLOOD_DARK_RULES.warriorDiceKinds.includes(spec.kind) && character.profession === 'warrior' ? BLOOD_DARK_RULES.warriorDice
      : spec.kind === 'survival' ? character.profession === 'wayfarer' ? BLOOD_DARK_RULES.survivalDice.wayfarer : BLOOD_DARK_RULES.survivalDice.other
      : BLOOD_DARK_RULES.singleDieKinds.includes(spec.kind) ? BLOOD_DARK_RULES.singleDie : BLOOD_DARK_RULES.otherDice;
  const modifiers = Object.hasOwn(BLOOD_DARK_RULES.crewModifiers, spec.kind)
    ? BLOOD_DARK_RULES.crewModifiers[spec.kind] : BLOOD_DARK_RULES.defaultCrewModifiers;
  let total = modifiers[crew];
  if (BLOOD_DARK_RULES.rankKinds.includes(spec.kind)) total += character.rank;
  if (spec.kind === 'lightning' && character.copperOre) total += BLOOD_DARK_RULES.copperOreBonus;
  if (BLOOD_DARK_RULES.shipAdjustmentKinds.includes(spec.kind)) total += shipDice - BLOOD_DARK_RULES.shipAdjustmentBase;
  if (spec.cargoPenalty && character.hasCargo) total -= BLOOD_DARK_RULES.cargoPenalty;
  for (let index = 0; index < count; index++) total += fabledDie(roll);
  fabledInteger(total, -1000);
  const index = spec.bounds.findIndex(bound => total <= bound);
  const outcome = index < 0 ? spec.bounds.length : index;
  let damage = 0;
  if (spec.damageDice?.[outcome] === null) damage = character.stamina;
  else for (let index = 0; index < (spec.damageDice?.[outcome] ?? 0); index++) damage += fabledDie(roll);
  character.stamina = Math.max(0, character.stamina - damage);
  const isBattle = BLOOD_DARK_RULES.battleKinds.includes(spec.kind);
  const degraded = Object.hasOwn(BLOOD_DARK_RULES.crewDegradation, spec.kind)
    && BLOOD_DARK_RULES.crewDegradation[spec.kind].includes(outcome);
  return { character, total, damage, kind: spec.kind, destination: character.stamina ? spec.destinations[outcome] : BLOOD_DARK_RULES.deathDestination,
    status: isBattle ? outcome === spec.bounds.length ? 'win'
      : spec.kind === 'naval' && outcome === spec.bounds.length - 1 ? 'draw' : 'loss' : 'story',
    crew: degraded ? BLOOD_DARK_RULES.degradedCrew : crew,
    usedBlessing: false };
}
