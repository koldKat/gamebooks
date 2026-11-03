// Identify Redcoats and Minutemen and load its database-owned combat presets.
import {createRosterLoader} from '../../roster-data.js';
import {validateRealLifeCatalog} from '../../engines/real-life/catalog.js';

export const definition = Object.freeze({id: 1537, title: 'Redcoats and Minutemen: The American War of Independence', family: 'real-life', stateKey: 'sim1537',
  combatFields: ['strength', 'agility', 'sword', 'firearm', 'horsemanship', 'wounds'], weapons: ['sword', 'firearm', 'strength']});
let roster = [];
export const getRoster = () => roster;
export const loadRoster = createRosterLoader(definition.id, 'CATALOG', entries => {
  validateRealLifeCatalog(entries);
  if (entries.length !== 18) throw new RangeError('Incomplete Redcoats and Minutemen combat catalog');
  roster = entries;
});
