// Identify Through the Wire and load its database-owned firearm encounters.
import {createRosterLoader} from '../../roster-data.js';
import {validateFirearmCatalog} from '../../engines/real-life-firearms/catalog.js';

export const definition = Object.freeze({id: 1536, title: 'Through the Wire: The Great Escape', family: 'real-life-firearms', stateKey: 'sim1536'});
let roster = [];
export const getRoster = () => roster;
export const loadRoster = createRosterLoader(definition.id, 'CATALOG', entries => {
  validateFirearmCatalog(entries);
  if (entries.length !== 3) throw new RangeError('Incomplete Through the Wire combat catalog');
  roster = entries;
});
