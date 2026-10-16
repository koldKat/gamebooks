import { validateOpponents } from '../../opponents.js';

export const opponentFields = [{key: 'life', min: 6}, {key: 'hit', min: 2, max: 12}, {key: 'bonus'}, {key: 'armour'}];
let sequence = 0;

export function customGrailEncounter(selection, opponents) {
  if (String(selection) !== '0' || !opponents) return undefined;
  const enemies = validateOpponents(opponents, opponentFields).map(enemy => ({
    name: enemy.displayName || 'Opponent', life: enemy.life, hit: enemy.hit, bonus: enemy.bonus, armour: enemy.armour,
  }));
  return {id: 'custom:' + Date.now() + ':' + ++sequence, section: 0, custom: true,
    name: enemies.map(enemy => enemy.name).join(' / '), enemies, foes: enemies};
}
