export let FIRE_WOLF_ROSTER = Object.freeze([]);

export function installFireWolfRoster(rows) {
  FIRE_WOLF_ROSTER = Object.freeze(rows.map(Object.freeze));
}

export function fireWolfEnemy(name, overrides = {}) {
  const enemy = FIRE_WOLF_ROSTER.find(entry => entry.name === name);
  if (!enemy) throw new Error('Unknown Fire*Wolf enemy');
  return { ...enemy, maxLife: enemy.lifePoints, ...overrides };
}
