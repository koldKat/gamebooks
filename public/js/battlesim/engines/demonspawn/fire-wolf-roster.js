export let FIRE_WOLF_ROSTER = Object.freeze([]);
export const FIRE_WOLF_RULES = {};
export let FIRE_WOLF_REGENT_SPELLS = Object.freeze({});

export function installFireWolfRoster(rows, rules) {
  Object.assign(FIRE_WOLF_RULES, rules);
  FIRE_WOLF_REGENT_SPELLS = Object.freeze({...rules.regent.spellThresholds});
  FIRE_WOLF_ROSTER = Object.freeze(rows.map(Object.freeze));
}

export function fireWolfEnemy(name, overrides = {}) {
  const enemy = FIRE_WOLF_ROSTER.find(entry => entry.name === name);
  if (!enemy) throw new Error('Unknown Fire*Wolf enemy');
  return { ...enemy, maxLife: enemy.lifePoints, ...overrides };
}
