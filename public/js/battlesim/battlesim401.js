// Book 401 At the Court of King Minos (Cretan Chronicles); Honour carries over.
import { createCretanSim } from './engines/cretan.js';

const _sim = createCretanSim({
  bookId: 401,
  idPrefix: 'sim401',
  stateKey: 'sim401',
  i18nPrefix: 'battlesim401',
  defaultHonour: 7,
});

export const initSim401      = _sim.init;
export const renderSim401    = _sim.render;
export const setSim401Visible = _sim.setVisible;
