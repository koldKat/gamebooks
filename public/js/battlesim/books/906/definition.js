import { createRosterLoader } from '../../roster-data.js';

export const definition = Object.freeze({
  id: 906, title: 'Звездолетът Скитник', family: 'starship-traveller',
  stateKey: 'sim906', i18nPrefix: 'battlesim906',
});

export const CREW = ['captain', 'science', 'medical', 'engineering', 'security', 'guard1', 'guard2'];
export const OFFICERS = ['science', 'medical', 'engineering'];
export const COMPANIONS = ['macom', 'eagle'];
export let ENCOUNTERS = [], COMPANION_PRESETS = {};
export const STARSHIP_RULES = {};
export const loadRoster = createRosterLoader(906, 'CATALOG', entries => {
  const rules = entries.find(entry => entry.support)?.support.rules;
  if (!rules) throw new Error('Incomplete Starship Traveller settings');
  Object.assign(STARSHIP_RULES, rules);
  ENCOUNTERS = entries.flatMap(entry => entry.variants ?? []).sort((a, b) => a.order - b.order).map(variant => variant.spec);
  COMPANION_PRESETS = Object.fromEntries(entries.filter(entry => entry.kind === 'companion').map(entry => [entry.key, entry.profile]));
});

export const encounterFor = section => ENCOUNTERS.find(row => row.section === Number(section)) ?? null;
