// Identify The Green Hydra and load its database-owned combat rules and encounters.
import {createRosterLoader} from '../../roster-data.js';
import {validateSagardCatalog} from '../../engines/sagard/catalog.js';

export const definition = Object.freeze({id: 1542, title: 'The Green Hydra', family: 'sagard', stateKey: 'sim1542'});
let roster = [];
export const getRoster = () => roster;
export const loadRoster = createRosterLoader(definition.id, 'CATALOG', entries => {
  validateSagardCatalog(entries);
  if (entries.length !== 29) throw new RangeError('Incomplete Green Hydra combat catalog');
  roster = entries;
});
