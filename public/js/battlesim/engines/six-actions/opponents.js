import { validateOpponents } from '../../opponents.js';

export const sixActionsOpponentFields = [
  {key: 'playerThreshold', min: 1, max: 100}, {key: 'enemyThreshold', min: 2, max: 13},
  {key: 'enemies', min: 1, max: 100}, {key: 'killsPerHit', min: 1, max: 100},
  {key: 'modifier', min: -100, max: 100},
];
export function customSixActionsEncounter(section, opponents) {
  if (section !== 0 || !opponents) return undefined;
  if (opponents.length !== 1) throw new RangeError('Configure one enemy group');
  const row = validateOpponents(opponents, sixActionsOpponentFields)[0];
  return {section: 0, custom: true, name: row.displayName || 'Противници',
    playerThreshold: row.playerThreshold, enemyThreshold: row.enemyThreshold,
    enemies: row.enemies, killsPerHit: row.killsPerHit, modifier: row.modifier,
    modifiers: ['weapon', 'marks']};
}
