// Identify The Fire Demon and load its database-owned combat rules and encounters.
import {createRosterLoader} from '../../roster-data.js';
import {validateSagardCatalog} from '../../engines/sagard/catalog.js';

export const definition = Object.freeze({id: 1544, title: 'The Fire Demon', family: 'sagard', stateKey: 'sim1544'});
let roster = [];
export const getRoster = () => roster;
export const loadRoster = createRosterLoader(definition.id, 'CATALOG', entries => {
  validateSagardCatalog(entries);
  if (entries.length !== 29) throw new RangeError('Incomplete Fire Demon combat catalog');
  roster = entries;
});
