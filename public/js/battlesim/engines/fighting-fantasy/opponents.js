import { validateOpponents } from '../../opponents.js';

export function customFightingEncounter(section, opponents) {
  if (String(section) !== '0' || !opponents) return undefined;
  const enemies = validateOpponents(opponents, [{key: 'skill', max: 10000}, {key: 'stamina', min: 1, max: 10000}]).map((enemy, index) => ({
    key: 'custom' + index, name: enemy.displayName || 'Противник', displayName: enemy.displayName || 'Противник',
    skill: enemy.skill, stamina: enemy.stamina, staminaInitial: enemy.stamina,
  }));
  return {section: 0, custom: true, name: enemies.map(enemy => enemy.displayName).join(' / '), enemies,
    groups: enemies.map((_, index) => [index])};
}
