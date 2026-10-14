const encounter = (section, win, rows, extra = {}) => ({ section, win, loss: 560,
  enemies: rows.map(([name, combat, defence, stamina]) => ({ name, combat, defence, stamina })), ...extra });

export const CITIES_OF_GOLD_FIGHTS = Object.freeze([
  encounter(70, 323, [['Wereboar', 6, 11, 8]]),
  encounter(128, 174, [['1st Assassin', 6, 8, 7], ['2nd Assassin', 7, 8, 7]]),
  encounter(152, 361, [['Hydra', 6, 7, 9]], { woundEffect: 'hydra' }),
  encounter(207, 184, [['Faery Wolf', 5, 7, 10]], { flee: { destination: 22, dice: 1 } }),
  encounter(208, 277, [['Giant Spider', 4, 7, 5]], { woundEffect: 'spider' }),
  encounter(297, 320, [['Silent Knight', 7, 12, 7]], { flee: { destination: 23, dice: 1 } }),
  encounter(313, 361, [['Hydra', 6, 11, 9]], { woundEffect: 'hydra' }),
  encounter(392, 467, [['Sir Fontesque', 7, 13, 11]], { surrender: 319 }),
  encounter(413, 200, [['Evil Knight', 4, 5, 4]]),
  encounter(442, 517, [['Assassin', 5, 6, 5]], { flee: { destination: 118, dice: 0 }, woundEffect: 'paladin' }),
  encounter(462, 385, [['Vampire', 7, 9, 14]], { unarmoured: true, woundEffect: 'unarmed' }),
  encounter(464, 338, [['Warthog', 5, 6, 7]]),
  encounter(469, 172, [['Dragon', 9, 11, 20]]),
  encounter(476, 31, [['Angry Knight', 5, 9, 6]]),
  encounter(514, 338, [['Samurai', 6, 12, 7]]),
  encounter(581, 605, [['Elf Lady', 7, 10, 7]], { flee: { destination: 22, dice: 1 } }),
  encounter(582, 654, [['First Brigand', 4, 6, 4], ['Second Brigand', 4, 6, 3],
    ['Third Brigand', 4, 6, 4], ['Fourth Brigand', 4, 6, 3], ['Fifth Brigand', 4, 7, 5]], { surrender: 678 }),
  encounter(595, 496, [['Ogre', 5, 8, 10]], { flee: { destination: 124, dice: 1 } }),
  encounter(601, 189, [['Brigand', 4, 5, 2]]),
  encounter(604, 628, [['Jeweled Serpent', 7, 8, 9]]),
  encounter(626, 698, [['Barrow Wight', 5, 9, 18]]),
  encounter(647, 246, [['Troll', 8, 12, 12]]),
  encounter(649, 673, [['Enraged Bull', 10, 11, 40]], { flee: { destination: 697, dice: 0 } }),
  encounter(657, 705, [['Ekushka', 6, 7, 10]]),
  encounter(726, 353, [['First Brigand', 5, 6, 4], ['Second Brigand', 4, 5, 4],
    ['Third Brigand', 3, 4, 3]], { entryDice: 1, entryArmour: true, surrender: 384 }),
  encounter(770, 404, [['1st Highwayman', 5, 7, 7], ['2nd Highwayman', 5, 7, 7],
    ['3rd Highwayman', 4, 5, 4]], { flee: { destination: 55, dice: 2, armour: true } }),
]);
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
