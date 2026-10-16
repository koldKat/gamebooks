import { validateOpponents } from '../opponents.js';

export const shadowsOpponentFields = [
  {key: 'dexterity', max: 12}, {key: 'mentality', min: 2, max: 12},
  {key: 'health', min: 1, max: 10000}, {key: 'mental', max: 1},
  {key: 'disbelief', max: 1}, {key: 'staminaDamage', max: 10000},
  {key: 'enduranceDamage', max: 10000},
];
export const innsmouthOpponentFields = [
  {key: 'speed', max: 10000}, {key: 'accuracy', max: 10000},
  {key: 'damage', max: 10000}, {key: 'health', min: 1, max: 10000},
];

export function customShadowsEncounter(id, opponents) {
  if (String(id) !== '0' || !opponents) return undefined;
  const rows = validateOpponents(opponents, shadowsOpponentFields);
  if (rows.some(row => row.disbelief && !row.mental)) throw new RangeError('Disbelief requires mental health');
  const enemies = rows.map(row => ({
    name: row.displayName || 'Opponent', displayName: row.displayName || 'Opponent',
    dexterity: row.dexterity, mentality: row.mentality,
    [row.mental ? 'endurance' : 'stamina']: row.health, disbelief: !!row.disbelief,
    damage: {stamina: row.staminaDamage, endurance: row.enduranceDamage},
  }));
  return {id: 0, custom: true, mode: 'ordinary', name: enemies.map(e => e.name).join(' / '), enemies};
}

export function customInnsmouthEncounter(section, opponents) {
  if (String(section) !== '0' || !opponents) return undefined;
  const enemies = validateOpponents(opponents, innsmouthOpponentFields).map(row => ({
    ...row, name: row.displayName || 'Opponent', displayName: row.displayName || 'Opponent',
  }));
  return {section: 0, custom: true, enemies};
}
