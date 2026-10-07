const foe = (name, expertise, vitality, damage, count = 1) => ({ name, expertise, vitality, damage, count });
const crocodiles = () => [foe('Large Crocodile', 13, 12, 3), foe('Crocodile', 13, 10, 3, 7)];

// Section-specific values and exceptions differ even for the same species.
export const MARSH_ENCOUNTERS = Object.freeze([
  { section: 14, foes: [foe('Hydra Head', 12, 4, 2, 7)], mode: 'one-target' },
  { section: 15, foes: [foe('Centaur', 9, 14, 1, 4)], mode: 'all', surprise: 'player', surpriseRounds: 1, stopAfterKills: 2 },
  { section: 16, foes: [foe('Crocodile', 13, 12, 3)] },
  { section: 17, foes: [foe('Giant Beaver', 10, 7, 4)] },
  { section: 21, foes: [foe('Buffalo', 9, 8, 2)] },
  { section: 27, foes: [foe('Lizardman', 10, 7, 3)], surprise: 'player', surpriseRounds: 2, roundLimit: 4 },
  { section: 28, foes: [foe('Assassin', 10, 6, 2)], surprise: 'enemy', surpriseRounds: 1, firstRoundWeaponDamage: 0, laterWeaponDamage: 1, stopOnPlayerDamage: true },
  { section: 29, foes: [foe('Lizardman', 10, 7, 3)], surprise: 'player', surpriseRounds: 1, roundLimit: 4 },
  { section: 31, foes: [foe('Crocodile', 13, 12, 3)], expertiseModifier: -1 },
  { section: 32, foes: [foe('Eagle', 10, 4, 2)], fortuneOnMiss: 1 },
  { section: 33, foes: [foe('Ram', 12, 5, 2)] },
  { section: 37, foes: [foe('Centaur', 9, 14, 1, 4)], mode: 'all' },
  { section: 40, foes: [foe('Giant Beaver', 10, 7, 4)], expertiseModifier: -4 },
  { section: 41, foes: [foe('Skeleton', 10, 5, 2, 2)], mode: 'sequential' },
  { section: 60, foes: [foe('Eagle', 10, 4, 3)], expertiseModifier: -1 },
  { section: 75, foes: [foe('Spider', 10, 5, 2)], poisonFortune: 1 },
  { section: 86, foes: [foe('Hippogriff', 13, 11, 4)] },
  { section: 88, foes: [foe('Frogman', 10, 5, 2, 4)], mode: 'sequential', expertiseModifier: -3, weaponDamage: 1, breathInterval: 4, breathDamagePerEnemy: 2 },
  { section: 94, foes: [foe('Sphinx', 15, 16, 2)], mode: 'sphinx', surprise: 'player', surpriseRounds: 2 },
  { section: 97, foes: [foe('Giant Beaver', 10, 7, 4)], expertiseModifier: -2, roundLimit: 6, roundLimitDeath: true },
  { section: 111, foes: [foe('Panther', 11, 7, 3)] },
  { section: 112, foes: [foe('Skeleton', 10, 5, 2, 2)], mode: 'sequential' },
  { section: 132, foes: [foe('Harpy', 12, 10, 2)] },
  { section: 133, foes: [foe('Stag', 8, 6, 2)] },
  { section: 139, foes: [foe('Druid', 12, 16, 2)], surprise: 'player', surpriseRounds: 1, repeatSurpriseOnPlayerHit: true, transformOnMiss: true, transformedExpertise: 10 },
  { section: 149, foes: [foe('Zombie', 6, 8, 1)], cuttingOnly: true, enemyHitsOnZeroHeads: true },
  { section: 170, foes: [foe('Lizardman', 10, 7, 3)], mode: 'ambush', surprise: 'player', companionExpertise: 11, roundLimit: 1 },
  { section: 171, foes: [foe('Harpy', 12, 10, 2)] },
  { section: 186, foes: [foe('Zombie', 6, 8, 1)], cuttingOnly: true, enemyHitsOnZeroHeads: true },
  { section: 191, foes: [foe('Harpy', 12, 10, 2)] },
  { section: 195, foes: [foe('Ewe', 6, 3, 0)], enemyHitEscapes: true },
  { section: 201, foes: [foe('Hippogriff', 13, 11, 4, 2)], mode: 'sequential', configurableCount: [1, 2], fortunePerKill: 3 },
  { section: 203, foes: [foe('Giant', 14, 20, 6)] },
  { section: 216, foes: [foe('Crocodile', 13, 12, 3)] },
  { section: 217, foes: [foe('Centaur Archer', 14, 14, 2, 2)], mode: 'arrows', configurableCount: [1, 2], roundLimit: 15 },
  { section: 250, foes: [foe('Panther', 11, 7, 3)], surprise: 'enemy', surpriseRounds: 2 },
  { section: 274, foes: [foe('Lizardman', 10, 7, 3)], roundLimit: 2 },
  { section: '274c', sourceSection: 274, foes: [foe('Lizardman', 10, 7, 3, 5)], mode: 'all', weaponDamage: 3 },
  { section: 289, foes: [foe('Snake', 11, 3, null)], expertiseModifier: -3, manualDamageRequired: true },
  { section: 297, foes: [foe('Zombie', 6, 8, 1)], cuttingOnly: true, enemyHitsOnZeroHeads: true, surprise: 'player', surpriseRounds: 3 },
  { section: 308, foes: [foe('Hippogriff', 13, 11, 4)], expertiseModifier: -2 },
  { section: 310, foes: [foe('Harpy', 12, 10, 2)] },
  { section: 322, foes: [foe('Skeleton', 10, 5, 2, 2)], mode: 'sequential' },
  { section: 340, foes: [foe('Harpy', 12, 10, 2)] },
  { section: 342, foes: [foe('Lizardman', 10, 7, 3)], surprise: 'player', surpriseRounds: 2, expertiseModifier: -1, roundLimit: 2 },
  { section: 357, foes: [foe('Ram', 12, 6, 2)], surprise: 'enemy', surpriseRounds: 1, repeatSurpriseOnEnemyHit: true },
  { section: 359, foes: [foe('Lizardman', 10, 7, 3)], roundLimit: 4, carryEnemyVitality: true },
  { section: 363, foes: [foe('Lizardman', 10, 7, 3)], surprise: 'player', surpriseRounds: 2, roundLimit: 2 },
  { section: 369, foes: crocodiles(), mode: 'all', escapeAfterKills: 7, treeEscapeFortune: 3, treeEscapeDamagePerEnemy: 3 },
  { section: 376, foes: [foe('Lizardman', 10, 7, 3, 6)], mode: 'halberds', configurableCount: [5, 6], flankFortune: 2 },
  { section: 398, foes: crocodiles(), mode: 'all', expertiseModifier: -2 },
]);

export function expandMarshEncounter(section, { count, manualDamage } = {}) {
  const encounter = MARSH_ENCOUNTERS.find(entry => String(entry.section) === String(section));
  if (!encounter) throw new RangeError('Unknown encounter');
  if (count !== undefined && !encounter.configurableCount?.includes(count)) throw new RangeError('Invalid enemy count');
  if (encounter.manualDamageRequired && (!Number.isInteger(manualDamage) || manualDamage < 0)) {
    throw new RangeError('This source omits damage; set it explicitly rather than inventing a value');
  }
  const foes = encounter.foes.flatMap(foe => Array.from({ length: count ?? foe.count }, (_, index) => ({
    name: foe.name + (foe.count > 1 ? ` ${index + 1}` : ''),
    expertise: foe.expertise, vitality: foe.vitality, initialVitality: foe.vitality,
    damage: foe.damage ?? manualDamage,
  })));
  return { ...encounter, foes };
}
