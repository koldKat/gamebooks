import { BLOOD_DARK_PROFESSIONS } from './blood-dark-sea.js';
import { fabledDie, validateFabledCharacter } from './character.js';

export const HOWLING_DEFAULTS = Object.freeze({ rank: 4, stamina: 20, shards: 65, armour: 3,
  professions: BLOOD_DARK_PROFESSIONS });

const encounter = (section, win, name, combat, defence, stamina, extra = {}) => ({ section, win, loss: 7,
  enemies: [{ name, combat, defence, stamina }], ...extra });

export const HOWLING_FIGHTS = Object.freeze([
  encounter(62, 108, 'Faery Hound', 7, 10, 12),
  encounter(76, 157, 'Vampire', 8, 12, 18),
  encounter(83, 124, 'Manbeast', 8, 5, 10),
  encounter(87, 304, 'Kaschuf', 8, 8, 20, { woundEffect: 'immortal' }),
  encounter(109, 197, 'Nomad', 7, 6, 11, { loss: 169, lossStamina: 1 }),
  encounter(147, 147, 'Wolfpack', 9, 8, 18, { woundEffect: 'wolfpack' }),
  encounter(149, 114, 'Avar Hordeth', 7, 8, 3),
  encounter(167, 603, 'Redcaps', 8, 10, 16),
  encounter(171, 429, 'Grey Worm', 8, 23, 8, { flee: { destination: 226, dice: 1 } }),
  encounter(209, 391, 'Luroc Bans', 7, 6, 11),
  encounter(238, 150, 'Three Cutthroats', 8, 7, 17, { woundDestination: 184, woundEffect: 'daggers' }),
  encounter(265, 330, 'Sea Spider', 7, 6, 13),
  encounter(311, 430, 'Three Thugs', 10, 7, 19, { loss: 169, lossStamina: 1 }),
  encounter(352, 170, 'She-devil', 8, 6, 10),
  encounter(367, 158, 'Kaschuf', 8, 8, 20),
  encounter(371, 99, 'Hooded Men', 7, 7, 15),
  encounter(406, 197, 'Luroc Bans', 7, 6, 11),
  encounter(410, 678, 'Young Rukh', 6, 5, 21),
  encounter(419, 392, 'Avar Hordeth', 8, 8, 12, { threshold: 3, loss: 338, lossStamina: 1 }),
  encounter(446, 571, 'Sir Leo', 8, 20, 35, { entryDice: 2, flee: { destination: 191, dice: 0 } }),
  encounter(469, 215, 'Snake Demon', 7, 7, 10, { woundEffect: 'snake' }),
  encounter(532, 158, 'Kaschuf', 8, 8, 20),
  encounter(536, 262, 'Storm Demon', 8, 10, 15),
  encounter(538, 571, 'Sir Leo', 8, 20, 6, { flee: { destination: 191, dice: 0 } }),
  encounter(555, 625, 'Kelpie', 6, 8, 12),
  encounter(561, 658, 'Wrecker', 6, 6, 15),
  encounter(562, 248, 'Blue Cap', 8, 6, 22),
  encounter(566, 215, 'Snake Demon', 9, 9, 18, { woundEffect: 'snake' }),
  encounter(591, 322, 'Mugger', 5, 6, 10, { loss: 169, lossStamina: 1 }),
  encounter(604, 666, 'Rabid Wolf', 7, 5, 6),
  encounter(659, 78, 'Undead Warriors', 8, 7, 16, { woundEffect: 'blight' }),
]);

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
