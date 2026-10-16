import { validateOpponents } from '../../opponents.js';
import { startLegendaryFight } from './combat.js';

export const legendaryOpponentFields = [
  {key: 'attack', max: 100}, {key: 'threshold', min: 1, max: 6},
  {key: 'defence', min: 1, max: 6}, {key: 'health', min: 1, max: 10000},
];
export function startCustomLegendaryFight(party, {opponents, participants} = {}) {
  const enemies = validateOpponents(opponents, legendaryOpponentFields).map(e => ({
    name: e.displayName || 'Opponent', attack: e.attack, threshold: e.threshold,
    defence: e.defence, health: e.health, attackType: 'dice',
  }));
  const selected = participants ?? party.flatMap((hero, i) => hero.health > 0 ? [i] : []);
  return startLegendaryFight(party, enemies, {section: 0, custom: true}, selected);
}
