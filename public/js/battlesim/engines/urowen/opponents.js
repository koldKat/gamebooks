import { validateOpponents } from '../../opponents.js';

export const urowenOpponentFields = [
  {key: 'attributeCode', max: 3}, {key: 'attributeValue', min: -100, max: 100}, {key: 'life', min: 1, max: 10000},
  {key: 'power', max: 10000}, {key: 'damageDice', max: 100},
  {key: 'damageBonus', min: -100, max: 100},
  ...Array.from({length: 6}, (_, index) => ({key: 'armor' + index, max: 100})),
];

export function customUrowenEncounter(opponents) {
  const enemies = validateOpponents(opponents, urowenOpponentFields).map(row => ({
    name: row.displayName || 'Opponent', attribute: ['STR', 'SK', 'MAG', 'PER'][row.attributeCode],
    attributeValue: row.attributeValue, life: row.life, maxLife: row.life, power: row.power,
    damageDice: row.damageDice, damageBonus: row.damageBonus,
    armorByLocation: Array.from({length: 6}, (_, i) => row['armor' + i]), rules: {},
  }));
  return {section: 0, custom: true, enemies, rules: {}};
}
