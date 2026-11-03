// Identify Rider of the Black Sun and load its database-owned combat catalog.
import {createRosterLoader} from '../../roster-data.js';
import {validateBlackSunCatalog} from '../../engines/black-sun/catalog.js';
import {validateBlackSunPages} from '../../engines/black-sun/random.js';

export const definition = Object.freeze({id: 1525, title: 'Rider of the Black Sun', family: 'black-sun', stateKey: 'sim1525', i18nPrefix: 'battlesim1525'});
let roster = [], support;
export const getRoster = () => roster;
export const getSupport = () => support;
export const loadRoster = createRosterLoader(definition.id, 'CATALOG', entries => {
  if (entries.length !== 47) throw new RangeError('Incomplete Black Sun encounter catalog');
  const shared = entries.find(entry => entry.support)?.support;
  if (!shared?.playerDefaults || !Array.isArray(shared.passives) || !Array.isArray(shared.effects)) throw new RangeError('Missing Black Sun combat rules');
  validateBlackSunPages(shared.randomizer?.pages);
  validateBlackSunCatalog(entries);
  roster = entries; support = shared;
});
