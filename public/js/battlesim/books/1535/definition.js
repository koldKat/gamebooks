// Identify Sword and Flame and load its database-owned combat presets.
import {createRosterLoader} from '../../roster-data.js';
import {validateRealLifeCatalog} from '../../engines/real-life/catalog.js';

export const definition = Object.freeze({id: 1535, title: 'Sword and Flame: The English Civil War', family: 'real-life', stateKey: 'sim1535',
  combatFields: ['strength', 'agility', 'sword', 'firearm', 'horsemanship', 'wounds'], weapons: ['sword', 'firearm', 'strength']});
let roster = [];
export const getRoster = () => roster;
export const loadRoster = createRosterLoader(definition.id, 'CATALOG', entries => {
  validateRealLifeCatalog(entries);
  if (entries.length !== 20) throw new RangeError('Incomplete Sword and Flame combat catalog');
  roster = entries;
});
