import { createRosterLoader } from '../../roster-data.js';

export const definition = Object.freeze({id: 895, title: 'Планината на смъртта', family: 'mountain-of-death', stateKey: 'sim895', i18nPrefix: 'battlesim895'});
export const RULES_REVISION = 1;
export const ABILITIES = ['survival', 'cunning', 'climbing', 'healing', 'magic', 'swimming', 'invisibility', 'hearing', 'vision'];
export const DEFAULT_CHARACTER = Object.freeze({skill: 6, stamina: 30, maxStamina: 30, courage: 3, luck: 4, coins: 20,
  abilities: [], healingUses: 5, magicUses: 6, invisibilityUses: 5, leafUses: 0, ointmentUses: 0, balmUses: 0, arrows: 0, scimitar: false});

export let ENCOUNTERS = [], OPPONENT_PRESETS = [];
export const MOUNTAIN_RULES = {};
export const loadRoster = createRosterLoader(895, 'ENCOUNTERS', entries => {
  const rules = entries.find(entry => entry.support)?.support.rules;
  if (!rules) throw new Error('Incomplete Mountain of Death settings');
  Object.assign(MOUNTAIN_RULES, rules);
  ENCOUNTERS = entries.map(({support,...entry}) => entry);
  OPPONENT_PRESETS = entries.flatMap(entry => entry.enemies.map(enemy => ({...enemy, displayName: `${enemy.displayName} (${entry.id})`})));
});
