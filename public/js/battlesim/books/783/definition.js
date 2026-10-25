import { createRosterLoader } from '../../roster-data.js';

export const definition = Object.freeze({
  id: 783,
  title: 'Самсон',
  family: 'samson',
  stateKey: 'sim783',
  i18nPrefix: 'battlesim783',
});

export const RULES_REVISION = 1;
export const CHARACTER_FIELDS = ['strength', 'life', 'faith', 'wisdom', 'charm', 'justice', 'debate'];
export let ENCOUNTERS = [];
export let DEATH_DESTINATION = null;
export const loadRoster = createRosterLoader(783, 'ENCOUNTERS', entries => {
  const routes = new Set(entries.filter(entry => !entry.lossLimit).map(entry => entry.lose));
  if (routes.size !== 1 || !Number.isSafeInteger([...routes][0])) throw new Error('Ambiguous Samson death destination');
  DEATH_DESTINATION = [...routes][0];
  ENCOUNTERS = entries;
});

export const encounterFor = section => ENCOUNTERS.find(entry => entry.section === Number(section));
