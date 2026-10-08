const attributes = ['strength', 'speed', 'stamina', 'courage', 'skill', 'luck', 'charm', 'attraction', 'lifePoints'];
const printed = [
  ['Baldar', [48, 36, 90, 90, 44, 48, 40, 16, 412]],
  ['Bandit', [50, 48, 48, 40, 20, 30, 16, 20, 272]],
  ['Constrictor Lizard', [96, 20, 55, 80, 25, 16, 2, 0, 294]],
  ['Tigon', [90, 80, 75, 85, 22, 16, 9, 5, 382]],
  ['Baj', [60, 50, 48, 55, 16, 40, 20, 25, 314]],
  ['Pantherine', [88, 96, 50, 80, 25, 40, 10, 5, 394]],
  ['Great Hound', [58, 55, 45, 70, 15, 10, 15, 0, 268]],
  ['Arcana', [58, 60, 60, 80, 33, 60, 80, 95, 526]],
  ['Demon', [150, 100, 100, 120, 70, 100, 0, 0, 640]],
  ['Old Woman', [82, 44, 50, 60, 16, 48, 25, 16, 341]],
  ['Giant Spider', [90, 70, 45, 70, 30, 30, 0, 0, 335]],
  ['Yveen', [65, 60, 48, 66, 20, 65, 80, 95, 499]],
  ['Tojar', [75, 50, 48, 55, 10, 50, 16, 50, 354]],
  ['Archer', [55, 65, 35, 85, 6, 55, 55, 55, 411]],
  // These two printed LP totals differ from the attribute sums; preserve the source.
  ['Landlord', [55, 30, 65, 45, 45, 40, 50, 45, 335]],
  ['Northern Slaver', [60, 55, 50, 40, 40, 30, 8, 30, 283]],
  ['Demonspawn Regent', [150, 110, 100, 150, 100, 0, 0, 0, 610]],
];

export const FIRE_WOLF_ROSTER = Object.freeze(printed.map(([name, values]) =>
  Object.freeze({ name, ...Object.fromEntries(attributes.map((key, index) => [key, values[index]])) })));

export function fireWolfEnemy(name, overrides = {}) {
  const enemy = FIRE_WOLF_ROSTER.find(entry => entry.name === name);
  if (!enemy) throw new Error('Unknown Fire*Wolf enemy');
  return { ...enemy, maxLife: enemy.lifePoints, ...overrides };
}
