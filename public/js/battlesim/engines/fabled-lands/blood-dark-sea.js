export const BLOOD_DARK_PROFESSIONS = Object.freeze({
  priest: [5, 3, 4, 7, 5, 2], mage: [3, 3, 7, 1, 6, 4], rogue: [6, 5, 5, 2, 3, 7],
  warrior: [4, 7, 2, 5, 4, 3], troubadour: [7, 4, 5, 4, 3, 5], wayfarer: [3, 6, 3, 4, 7, 5],
});

export const BLOOD_DARK_DEFAULTS = Object.freeze({ rank: 3, stamina: 16, shards: 40, armour: 3,
  professions: BLOOD_DARK_PROFESSIONS, abilityCurse: false });

const encounter = (section, win, rows, extra = {}) => ({ section, win, loss: 123,
  enemies: rows.map(([name, combat, defence, stamina]) => ({ name, combat, defence, stamina })), ...extra });

export const BLOOD_DARK_FIGHTS = Object.freeze([
  encounter(7, 78, [['Assassin', 8, 10, 8]]),
  encounter(73, 16, [['First Mutineer', 6, 9, 9], ['Second Mutineer', 5, 7, 5],
    ['Third Mutineer', 5, 7, 6]], { flee: { destination: 44, dice: 2 } }),
  encounter(85, 195, [['Vampire', 15, 18, 18]], { flee: { destination: 41, dice: 1 } }),
  encounter(211, 12, [['Serpent', 7, 8, 10]], { flee: { destination: 125, dice: 0 } }),
  encounter(326, 339, [['Violet Man', 9, 12, 9]], { entryDamage: 3, woundEffect: 'calcium',
    flee: { destination: 308, dice: 1 } }),
  encounter(356, 393, [['Gorgon', 4, 5, 8]]),
  encounter(441, 262, [['Resentful Sailor', 5, 6, 3]], { playerFirst: false, unarmoured: true,
    woundEffect: 'unarmed' }),
  encounter(500, 482, [['Head', 7, 14, 5]]),
  encounter(501, 320, [['Flying shark', 9, 10, 27]]),
  encounter(579, 615, [['Man', 4, 5, 5]], { flee: { destination: 25, dice: 0 } }),
  encounter(587, 321, [['First Fury', 12, 25, 19], ['Second Fury', 12, 25, 19], ['Third Fury', 12, 25, 19]]),
  encounter(662, 626, [['Ghost', 8, 17, 7]], { flee: { destination: 407, dice: 1 } }),
  encounter(675, 571, [['First Scholar', 3, 4, 3], ['Second Scholar', 4, 5, 4], ['Third Scholar', 3, 4, 4]],
    { surrender: 640 }),
  encounter(685, 393, [['First Gorgon', 4, 5, 8], ['Second Gorgon', 5, 6, 11]]),
  encounter(686, 376, [['Trau Miner', 8, 10, 10]]),
]);
import { fabledDie, fabledInteger, validateFabledCharacter } from './character.js';

const storm = (destinations, blessingDestination, bounds = [4, 6]) => ({ kind: 'storm', destinations, blessingDestination, bounds });
const escape = (caught, safe, bound = 6, cargoPenalty = false) => ({ kind: 'escape', destinations: [caught, safe], bounds: [bound], cargoPenalty });
const naval = (destinations, bounds = [4, 9, 13, 17]) => ({ kind: 'naval', destinations, bounds, damageDice: [null, 2, 1, 0, 0] });

export const BLOOD_DARK_SEA_CHECKS = Object.freeze({
  83: storm([103, 581, 60], 41), 139: storm([157, 581, 98], 154, [5, 7]),
  174: storm([212, 670, 227], 209), 193: storm([249, 670, 81], 61),
  213: storm([249, 231, 246], 155), 248: storm([212, 670, 263], 245),
  285: storm([6, 231, 337], 320), 355: storm([486, 718, 262], 648),
  491: storm([157, 670, 42], 24), 544: storm([634, 616, 13], 311),
  562: storm([634, 616, 311], 13), 580: storm([634, 616, 13], 32),
  598: storm([634, 670, 9], 50),
  194: escape(214, 61, 5), 268: escape(201, 322, 6, true),
  324: escape(286, 24), 418: escape(474, 13), 529: escape(565, 32),
  672: escape(361, 311), 684: escape(392, 648),
  201: naval([123, 435, 416, 101, 307], [3, 8, 12, 16]),
  214: naval([123, 140, 250, 245, 232], [3, 8, 12, 16]),
  286: naval([123, 435, 416, 101, 267]), 361: naval([123, 435, 416, 311, 379]),
  392: naval([123, 435, 416, 648, 412]), 474: naval([123, 435, 416, 13, 492]),
  565: naval([123, 435, 416, 32, 583]),
  523: { kind: 'naval', destinations: [123, 613, 300, 559], bounds: [4, 15, 17], damageDice: [null, 2, 0, 0] },
  397: { kind: 'tavern', destinations: [123, 454, 455], bounds: [7, 12], damageDice: [null, 0, 0] },
  465: { kind: 'kraken', destinations: [592, 610, 135], bounds: [9, 15] },
  647: { kind: 'hydras', destinations: [123, 700, 118, 448], bounds: [3, 6, 9], damageDice: [null, 0, 0, 0] },
  541: { kind: 'ram', destinations: [523, 577, 595], bounds: [6, 10] },
  384: { kind: 'overloaded', destinations: [486, 366], bounds: [2] },
  403: { kind: 'magicStorm', destinations: [486, 468], bounds: [6] },
  142: { kind: 'survival', destinations: [123, 152], bounds: [7], damageDice: [null, 0] },
  168: { kind: 'lightning', destinations: [212, 135, 123], bounds: [4, 10], blessingDestination: 352,
    damageDice: [0, 0, null] },
  186: { kind: 'raiders', destinations: [123, 206, 352], bounds: [3, 12], damageDice: [null, 0, 0] },
});

export function bloodDarkSeaCheck(section, input, options = {}, roll) {
  validateFabledCharacter(input, true);
  if (!Object.hasOwn(BLOOD_DARK_SEA_CHECKS, section)) throw new RangeError('Invalid sea check');
  const { ship = 'barque', crew = 'average', safetyFromStorms = false } = options;
  if (!['barque', 'brigantine', 'galleon'].includes(ship)
    || !['poor', 'average', 'good', 'excellent'].includes(crew)
    || typeof safetyFromStorms !== 'boolean') throw new RangeError('Invalid ship settings');
  const spec = BLOOD_DARK_SEA_CHECKS[section], character = structuredClone(input);
  if (safetyFromStorms) {
    if (!['storm', 'lightning'].includes(spec.kind) || !character.stormsBlessing) throw new RangeError('Storm blessing unavailable');
    character.stormsBlessing = false;
    return { character, total: null, damage: 0, destination: spec.blessingDestination,
      status: 'safe', usedBlessing: true };
  }
  const shipDice = ['barque', 'brigantine', 'galleon'].indexOf(ship) + 1;
  const count = ['storm', 'kraken'].includes(spec.kind) ? shipDice
    : ['naval', 'tavern', 'raiders'].includes(spec.kind) && character.profession === 'warrior' ? 3
      : spec.kind === 'survival' ? character.profession === 'wayfarer' ? 2 : 1
      : spec.kind === 'overloaded' ? 1 : 2;
  const modifiers = spec.kind === 'storm' ? { poor: -1, average: 0, good: 0, excellent: 1 }
    : spec.kind === 'naval' ? { poor: -2, average: 0, good: 2, excellent: 3 }
      : spec.kind === 'tavern' ? { poor: 0, average: 0, good: 0, excellent: 2 }
        : spec.kind === 'hydras' ? { poor: -2, average: 0, good: 1, excellent: 2 }
          : ['escape', 'ram'].includes(spec.kind) ? { poor: 0, average: 1, good: 2, excellent: 3 }
            : { poor: 0, average: 0, good: 0, excellent: 0 };
  let total = modifiers[crew];
  if (['naval', 'tavern', 'kraken', 'escape', 'ram', 'survival', 'raiders'].includes(spec.kind)) total += character.rank;
  if (spec.kind === 'lightning' && character.copperOre) total++;
  if (['overloaded', 'magicStorm'].includes(spec.kind)) total += shipDice - 2;
  if (spec.cargoPenalty && character.hasCargo) total--;
  for (let index = 0; index < count; index++) total += fabledDie(roll);
  fabledInteger(total, -1000);
  const index = spec.bounds.findIndex(bound => total <= bound);
  const outcome = index < 0 ? spec.bounds.length : index;
  let damage = 0;
  if (spec.damageDice?.[outcome] === null) damage = character.stamina;
  else for (let index = 0; index < (spec.damageDice?.[outcome] ?? 0); index++) damage += fabledDie(roll);
  character.stamina = Math.max(0, character.stamina - damage);
  const isBattle = ['naval', 'tavern', 'hydras'].includes(spec.kind);
  return { character, total, damage, kind: spec.kind, destination: character.stamina ? spec.destinations[outcome] : 123,
    status: isBattle ? outcome === spec.bounds.length ? 'win'
      : spec.kind === 'naval' && outcome === spec.bounds.length - 1 ? 'draw' : 'loss' : 'story',
    crew: (spec.kind === 'hydras' && outcome === 2) || (spec.kind === 'lightning' && outcome === 1) ? 'poor' : crew,
    usedBlessing: false };
}
