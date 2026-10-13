const enemy = (name, attack, health) => ({ name, attack, health });
const fight = (section, kind, enemies, win, extra = {}) => ({ section, kind, enemies, win, ...extra });
const bandit = modifier => ({ modifier, woundPenalty: true });

export const FREEWAY_FIGHTS = [
  fight(6, 'shoot', [enemy('rider1', 6, 15), enemy('rider2', 7, 17)], 307, { simultaneous: true, woundPenalty: true }),
  fight(12, 'shoot', [enemy('outlaw', 8, 12)], 131, bandit(-1)),
  fight(17, 'vehicle', [enemy('motorcycle', 6, 9)], 103, { modifier: -2 }),
  fight(48, 'hand', [enemy('thug', 7, 10)], 138, { playerDamage: 2, enemyDamage: 2, loss: 100 }),
  fight(49, 'vehicle', [enemy('chariot', 9, 15)], 91),
  fight(63, 'vehicle', [enemy('yellowFord', 8, 16)], 334, { playerDamage: 2, enemyDamage: 2, rockets: false, manualRounds: true }),
  fight(83, 'vehicle', [enemy('helicopter', 8, 11)], 305, { modifier: -2 }),
  fight(95, 'vehicle', [enemy('motorcycle', 6, 9)], 249),
  fight(102, 'shoot', [enemy('dog1', 7, 13), enemy('dog2', 8, 14)], 154, { simultaneous: true, woundPenalty: true }),
  fight(115, 'vehicle', [enemy('cart1', 7, 10), enemy('cart2', 8, 11)], 194, { simultaneous: true }),
  fight(116, 'shoot', [enemy('outlaw', 8, 12)], 131, bandit(-2)),
  fight(120, 'hand', [enemy('wolf1', 8, 7), enemy('wolf2', 8, 8)], 286, { playerDamage: 2, enemyDamage: 2 }),
  fight(158, 'vehicle', [enemy('estateCar', 10, 19)], 67, { rounds: 3, rockets: false }),
  fight(167, 'vehicle', [enemy('chevrolet', 8, 15)], 188),
  fight(178, 'shoot', [enemy('criminal', 9, 12)], 375, { firstModifier: -2, woundPenalty: true }),
  fight(184, 'shoot', [enemy('dog1', 7, 13), enemy('dog2', 8, 14)], 69, { simultaneous: true, woundPenalty: true }),
  fight(193, 'shoot', [enemy('bandit', 7, 11)], 64, bandit(1)),
  fight(220, 'vehicle', [enemy('sidecar', 9, 8)], 143),
  fight(227, 'shoot', [enemy('outlaw', 8, 12)], 131, bandit(-1)),
  fight(269, 'hand', [enemy('animal', 11, 16)], 355, { deathFight: true, enemyDamage: 2, knuckleduster: true }),
  fight(282, 'vehicle', [enemy('sidecar', 9, 8)], 143),
  fight(284, 'vehicle', [enemy('toyota', 9, 15), enemy('jaguar', 10, 12), enemy('commodore', 8, 13)], 265),
  fight(290, 'vehicle', [enemy('armouredCar', 9, 20)], 106),
  fight(291, 'shoot', [enemy('duellist', 9, 9)], 208, { rounds: 1 }),
  fight(294, 'vehicle', [enemy('yellowFord', 8, 16)], 334, { playerDamage: 2, enemyDamage: 2, rockets: false, rounds: 4 }),
  fight(299, 'shoot', [enemy('rider1', 7, 13), enemy('rider2', 5, 14)], 97, { simultaneous: true, woundPenalty: true }),
  fight(328, 'vehicle', [enemy('toyota', 9, 15)], 265),
  fight(331, 'vehicle', [enemy('jeep', 9, 14)], 7),
  fight(350, 'hand', [enemy('wildDog', 7, 5)], 89, { playerDamage: 2, enemyDamage: 2, deathFight: true }),
  fight(352, 'vehicle', [enemy('armouredCar', 9, 20)], 33, { modifier: -2 }),
  fight(368, 'shoot', [enemy('bandit', 7, 11)], 64, bandit(1)),
  fight(374, 'hand', [enemy('wildDog', 7, 5)], 89, { playerDamage: 2, enemyDamage: 2, deathFight: true }),
];

export const FREEWAY_CONTESTS = [
  { section: 30, enemySkill: 7, modifier: -1, win: 74, loss: 226 },
  { section: 35, enemySkill: 8, modifier: 0, win: 379, loss: 51 },
  { section: 164, enemySkill: 7, modifier: 0, win: 132, loss: 205 },
  { section: 345, enemySkill: 7, modifier: 0, win: 74, loss: 226 },
];

export const FREEWAY_RACES = [
  { section: 210, boost: 1, win: 54, loss: 322 },
  { section: 358, boost: 0, win: 54, loss: 322 },
];
