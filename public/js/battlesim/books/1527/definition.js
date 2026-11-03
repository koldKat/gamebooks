// Identify Star Bastards and load its database-owned Two-Fisted encounter and support tables.
import {createRosterLoader} from '../../roster-data.js';
import {validateTwoFistedCatalog, validateTwoFistedSupport} from '../../engines/two-fisted/catalog.js';

export const definition = Object.freeze({id: 1527, title: 'Star Bastards', family: 'two-fisted-fantasy', stateKey: 'sim1527'});
let roster = [], support;
export const getRoster = () => roster;
export const getSupport = () => support;
export const loadRoster = createRosterLoader(definition.id, 'CATALOG', entries => {
  if (entries.length !== 43) throw new RangeError('Incomplete Star Bastards combat catalog');
  const shared = entries.find(entry => entry.support)?.support;
  validateTwoFistedSupport(shared); validateTwoFistedCatalog(entries);
  roster = entries; support = shared;
});
