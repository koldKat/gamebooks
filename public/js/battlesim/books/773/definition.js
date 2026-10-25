import { createRosterLoader } from '../../roster-data.js';

export const definition = Object.freeze({
  id: 773,
  title: 'Изпитание за шампиони',
  family: 'fighting-fantasy',
  stateKey: 'sim773',
  i18nPrefix: 'battlesim773',
});

export const RULES_REVISION = 1;
export let ENCOUNTERS = [];
export const CHAMPION_RULES = {};
export const loadRoster = createRosterLoader(773, 'ENCOUNTERS', entries => {
  const rules = entries.find(entry => entry.support)?.support.rules;
  if (!rules) throw new Error('Incomplete Champions settings');
  Object.assign(CHAMPION_RULES, rules);
  ENCOUNTERS = entries.map(({support,...entry}) => entry);
});

export function encounterFor(section) {
  return ENCOUNTERS.find(entry => entry.section === Number(section));
}
