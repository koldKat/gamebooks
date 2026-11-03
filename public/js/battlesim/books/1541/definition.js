// Identify The Ice Dragon and load its database-owned combat rules and encounters.
import {createRosterLoader} from '../../roster-data.js';
import {validateSagardCatalog} from '../../engines/sagard/catalog.js';

export const definition = Object.freeze({id: 1541, title: 'The Ice Dragon', family: 'sagard', stateKey: 'sim1541'});
let roster = [];
export const getRoster = () => roster;
export const loadRoster = createRosterLoader(definition.id, 'CATALOG', entries => {
  validateSagardCatalog(entries);
  if (entries.length !== 26) throw new RangeError('Incomplete Ice Dragon combat catalog');
  roster = entries;
});
