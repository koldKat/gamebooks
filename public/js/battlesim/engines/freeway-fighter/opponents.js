import { validateOpponents } from '../../opponents.js';

export const freewayOpponentFields = [{key: 'attack', max: 10000}, {key: 'health', min: 1, max: 10000}];
export function customFreewayEncounter(section, options) {
  if (section !== 0 || !options.opponents) return undefined;
  if (!['hand', 'shoot', 'vehicle'].includes(options.kind)) throw new RangeError('Choose a combat type');
  const enemies = validateOpponents(options.opponents, freewayOpponentFields).map(e => ({
    name: e.displayName || 'Противник', displayName: e.displayName || 'Противник', attack: e.attack, health: e.health,
  }));
  return {section: 0, custom: true, name: enemies.map(e => e.name).join(' / '), kind: options.kind, enemies,
    knuckleduster: options.kind === 'hand'};
}
