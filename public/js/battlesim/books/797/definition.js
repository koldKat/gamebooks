import { createRosterLoader } from '../../roster-data.js';

export const definition = Object.freeze({
  id: 797,
  title: 'Сгреши пътя, обърни!',
  family: 'fighting-fantasy',
  stateKey: 'sim797',
  i18nPrefix: 'battlesim797',
});

export const RULES_REVISION = 1;
export let ENCOUNTERS = [];
export const MISSION_RULES = {};
export const loadRoster = createRosterLoader(797, 'ENCOUNTERS', entries => {
  const rules = entries.find(entry => entry.support)?.support.rules;
  if (!rules) throw new Error('Incomplete Wrong Turn settings');
  Object.assign(MISSION_RULES, rules);
  ENCOUNTERS = entries.map(({support,...entry}) => entry);
});
export const encounterFor = section => ENCOUNTERS.find(entry => entry.section === Number(section));
