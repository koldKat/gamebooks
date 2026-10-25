import { createRosterLoader } from '../../roster-data.js';

export const definition = Object.freeze({
  id: 904, title: 'Талисманът на смъртта', family: 'fighting-fantasy',
  stateKey: 'sim904', i18nPrefix: 'battlesim904',
});

export const RULES_REVISION = 1;
export let ENCOUNTERS = [];
export const TALISMAN_RULES = {};
export const loadRoster = createRosterLoader(904, 'CATALOG', entries => {
  const rules = entries.find(entry => entry.support)?.support.rules;
  if (!rules) throw new Error('Incomplete Talisman of Death settings');
  Object.assign(TALISMAN_RULES, rules);
  ENCOUNTERS = entries.flatMap(entry => entry.variants).sort((a, b) => a.order - b.order).map(variant => variant.spec);
});

export const encounterFor = section => ENCOUNTERS.find(row => row.section === Number(section));
