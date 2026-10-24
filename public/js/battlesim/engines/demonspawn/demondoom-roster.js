export let DEMONDOOM_ROSTER = Object.freeze([]);

export function installDemondoomRoster(rows) {
  DEMONDOOM_ROSTER = Object.freeze(rows.filter(row => row.kind === 'fixed').map(row => Object.freeze(row.enemy)));
}

export function demondoomEnemy(name, overrides = {}) {
  const enemy = DEMONDOOM_ROSTER.find(entry => entry.name === name);
  if (!enemy) throw new Error('Unknown Demondoom enemy');
  return { ...enemy, maxLife: enemy.lifePoints, maxPower: enemy.power, ...overrides };
}
