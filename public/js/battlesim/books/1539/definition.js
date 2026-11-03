// Identify Blazing Beacons and load its database-owned combat presets.
import {createRosterLoader} from '../../roster-data.js';
import {validateRealLifeCatalog} from '../../engines/real-life/catalog.js';

export const definition = Object.freeze({id: 1539, title: 'Blazing Beacons: The Spanish Armada', family: 'real-life', stateKey: 'sim1539',
  combatFields: ['strength', 'sword', 'firearm', 'wounds'], weapons: ['sword', 'firearm', 'strength']});
let roster = [];
export const getRoster = () => roster;
export const loadRoster = createRosterLoader(definition.id, 'CATALOG', entries => {
  validateRealLifeCatalog(entries);
  if (entries.length !== 19) throw new RangeError('Incomplete Blazing Beacons combat catalog');
  roster = entries;
});
