import { createRosterLoader } from '../../roster-data.js';
import { definition as magazineEdition } from '../797/definition.js';

export const definition = Object.freeze({
  // Identical fight schema. The app keeps each edition's runs under its own book ID.
  ...magazineEdition,
  id: 1309,
});

export const roster = {
  encounters: [],
  rules: {},
  encounterFor(section) {
    return roster.encounters.find(entry => entry.section === Number(section));
  },
};

export const loadRoster = createRosterLoader(definition.id, 'ENCOUNTERS', entries => {
  const rules = entries.find(entry => entry.support)?.support.rules;
  if (!rules) throw new Error('Incomplete Wrong Turn settings');
  roster.rules = rules;
  roster.encounters = entries.map(({ support, ...entry }) => entry);
});
