// Battle Simulator for book 400 (Cretan Chronicles) - MIGHT/PROTECTION engine.
// See cretan.js for the full engine description. Honour defaults to 7 (book 400's
// starting value); books 401/402 carry Honour over from the previous book, so the
// player edits it to their current value.
import { createCretanSim } from './cretan.js';

const _sim = createCretanSim({
  bookId: 400,
  idPrefix: 'sim400',
  stateKey: 'sim400',
  i18nPrefix: 'battlesim400',
  defaultHonour: 7,
});

export const initSim400      = _sim.init;
export const renderSim400    = _sim.render;
export const setSim400Visible = _sim.setVisible;
