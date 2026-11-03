// Identify The Crimson Sea and load its database-owned combat rules and encounters.
import {createRosterLoader} from '../../roster-data.js';
import {validateSagardCatalog} from '../../engines/sagard/catalog.js';

export const definition = Object.freeze({id: 1543, title: 'The Crimson Sea', family: 'sagard', stateKey: 'sim1543'});
let roster = [];
export const getRoster = () => roster;
export const loadRoster = createRosterLoader(definition.id, 'CATALOG', entries => {
  validateSagardCatalog(entries);
  if (entries.length !== 30) throw new RangeError('Incomplete Crimson Sea combat catalog');
  roster = entries;
});
