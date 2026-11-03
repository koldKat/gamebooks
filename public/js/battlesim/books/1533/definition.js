// Identify Madame Guillotine and load its database-owned Real Life combat presets.
import {createRosterLoader} from '../../roster-data.js';
import {validateRealLifeCatalog} from '../../engines/real-life/catalog.js';

export const definition = Object.freeze({id: 1533, title: 'Madame Guillotine', family: 'real-life', stateKey: 'sim1533'});
let roster = [];
export const getRoster = () => roster;
export const loadRoster = createRosterLoader(definition.id, 'CATALOG', entries => {
  validateRealLifeCatalog(entries);
  if (entries.length !== 20) throw new RangeError('Incomplete Madame Guillotine combat catalog');
  roster = entries;
});
