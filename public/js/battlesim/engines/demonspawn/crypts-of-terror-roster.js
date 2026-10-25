export let CRYPTS_ROSTER = Object.freeze([]);
export let CRYPTS_VARIANTS = Object.freeze({});
export let CRYPTS_EQUIPMENT = Object.freeze({});
export let CRYPTS_SPECIAL_ENEMIES = Object.freeze({});
export const CRYPTS_RULES = {};

export function installCryptsRoster(rows) {
  const rules = rows.find(row => row.support)?.support.rules;
  if (!rules) throw new Error('Missing Crypts encounter settings');
  Object.assign(CRYPTS_RULES, rules);
  CRYPTS_ROSTER = Object.freeze(rows.filter(row => row.kind === 'fixed').map(row => Object.freeze(row.enemy)));
  CRYPTS_VARIANTS = Object.freeze(Object.fromEntries(rows.filter(row => row.variantEquipment).map(row => [row.key, row.variantEquipment])));
  CRYPTS_EQUIPMENT = Object.freeze(Object.fromEntries(rows.filter(row => row.equipment).map(row => [row.key, row.equipment])));
  CRYPTS_SPECIAL_ENEMIES = Object.freeze(Object.fromEntries(rows.filter(row => row.kind !== 'fixed').map(row => [row.key, row])));
}

export function cryptsEnemy(name, overrides = {}) {
  const enemy = CRYPTS_ROSTER.find(entry => entry.name === name);
  if (!enemy) throw new Error('Unknown Crypts of Terror enemy');
  return { ...enemy, maxLife: enemy.lifePoints, maxPower: enemy.power, ...overrides };
}

