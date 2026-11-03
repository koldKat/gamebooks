// Identify The Fear Factor and load its database-owned combat encounters.
import {createRosterLoader} from '../../roster-data.js';
import {validateFirearmCatalog} from '../../engines/real-life-firearms/catalog.js';

export const definition = Object.freeze({id: 1540, title: 'The Fear Factor: Terrorism in the City',
  family: 'real-life-firearms', stateKey: 'sim1540', combatSkill: true});
let roster = [];
export const getRoster = () => roster;
export const loadRoster = createRosterLoader(definition.id, 'CATALOG', entries => {
  validateFirearmCatalog(entries);
  if (entries.length !== 16) throw new RangeError('Incomplete Fear Factor combat catalog');
  roster = entries;
});
