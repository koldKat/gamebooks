import { createRosterLoader } from '../../roster-data.js';

export const definition = Object.freeze({
  id: 718, title: 'Демони от дълбините', family: 'fighting-fantasy', stateKey: 'sim718', i18nPrefix: 'battlesim718',
});

export const RULES_REVISION = 1;
export const SWIFTSTINGER_DAMAGE = 10;
export let ENCOUNTERS = Object.freeze([]);
export const DEEP_RULES = {};
export const loadRoster = createRosterLoader(718, 'ENCOUNTERS', entries => {
  const rules = entries.find(entry=>entry.support)?.support.rules;
  if (!rules) throw new Error('Incomplete Demons settings');
  ENCOUNTERS = Object.freeze(entries.map(({support,...entry})=>entry));
  Object.assign(DEEP_RULES,rules);
});
