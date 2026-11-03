// Identify The Last Invasion and load its database-owned combat presets.
import {createRosterLoader} from '../../roster-data.js';
import {validateRealLifeCatalog} from '../../engines/real-life/catalog.js';

export const definition = Object.freeze({id: 1534, title: 'The Last Invasion: 1066', family: 'real-life', stateKey: 'sim1534',
  combatFields: ['strength', 'agility', 'luck', 'sword', 'javelin', 'horsemanship', 'wounds'], weapons: ['sword', 'javelin', 'strength']});
let roster = [];
export const getRoster = () => roster;
export const loadRoster = createRosterLoader(definition.id, 'CATALOG', entries => {
  validateRealLifeCatalog(entries);
  if (entries.length !== 36) throw new RangeError('Incomplete Last Invasion combat catalog');
  roster = entries;
});
