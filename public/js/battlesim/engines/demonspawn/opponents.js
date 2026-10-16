import { validateOpponents } from '../../opponents.js';
import { FIRE_WOLF_ATTRIBUTES } from './fire-wolf.js';

export const demonOpponentFields = [...FIRE_WOLF_ATTRIBUTES, 'skill', 'lifePoints', 'power', 'weapon', 'armour', 'shield']
  .map(key => ({key, min: key === 'lifePoints' ? 1 : 0, max: key === 'shield' ? 1 : 1000000, step: key === 'shield' ? 1 : .5}));

export function prepareCustomDemonEncounter(section, player, opponents) {
  if (String(section) !== '0' || !opponents) return undefined;
  const enemies = validateOpponents(opponents, demonOpponentFields).map(enemy => ({...enemy,
    name: enemy.displayName || 'Opponent', maxLife: enemy.lifePoints, maxPower: enemy.power,
    shield: Boolean(enemy.shield), magicArmour: 0,
  }));
  return {encounter: {section: '0', custom: true, name: enemies.map(enemy => enemy.name).join(' / '),
    enemies: enemies.map(enemy => enemy.name), manualGroup: enemies.length > 1},
    player: structuredClone(player), enemies, options: {manualGroup: enemies.length > 1}};
}
