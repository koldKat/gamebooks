// Book 402 Return of the Wanderer (Cretan Chronicles); Honour carries over.
import { createCretanSim } from './engines/cretan.js';

const _sim = createCretanSim({
  bookId: 402,
  idPrefix: 'sim402',
  stateKey: 'sim402',
  i18nPrefix: 'battlesim402',
  defaultHonour: 7,
});

export const initSim402      = _sim.init;
export const renderSim402    = _sim.render;
export const setSim402Visible = _sim.setVisible;
