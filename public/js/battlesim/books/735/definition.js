import { createRosterLoader } from '../../roster-data.js';
import { installTankRules } from './tank.js';

export const definition = Object.freeze({
  id: 735, title: 'Космически убиец', family: 'space-assassin', stateKey: 'sim735', i18nPrefix: 'battlesim735',
});

export let ENCOUNTERS = Object.freeze([]);
export const SPACE_RULES = {};
export const loadRoster = createRosterLoader(735, 'CATALOG', entries => {
  const rules = entries.find(entry => entry.support)?.support.rules;
  if (!rules) throw new Error('Incomplete Space Assassin settings');
  Object.assign(SPACE_RULES, rules);
  ENCOUNTERS = Object.freeze(entries.filter(entry => entry.kind === 'fight').map(entry => entry.spec));
  installTankRules(entries.find(entry => entry.kind === 'tank').rules);
});
