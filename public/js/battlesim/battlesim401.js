// Battle Simulator for book 401 (Cretan Chronicles) - MIGHT/PROTECTION engine.
// See cretan.js for the full engine description. Honour defaults to 7 (book 400's
// starting value); books 401/402 carry Honour over from the previous book, so the
// player edits it to their current value.
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
