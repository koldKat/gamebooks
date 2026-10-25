import { createRosterLoader } from '../../roster-data.js';

export const definition = Object.freeze({
  id: 710, title: 'Храмът на ужасите', family: 'fighting-fantasy', stateKey: 'sim710', i18nPrefix: 'battlesim710',
});

export let ENCOUNTERS = Object.freeze([]);
export const TEMPLE_RULES = {};
export const loadRoster = createRosterLoader(710, 'ENCOUNTERS', entries => {
  const rules = entries.find(entry=>entry.support)?.support.rules;
  if (!rules) throw new Error('Incomplete Temple settings');
  ENCOUNTERS = Object.freeze(entries.map(({support,...entry})=>entry));
  Object.assign(TEMPLE_RULES,rules);
});

export const SPELLS = Object.freeze({
  door: [2], sleep: [1], arrow: [2], language: [1], symbols: [1],
  light: [2], fire: [1, 2], jump: [3], trap: [2], water: [0],
});
