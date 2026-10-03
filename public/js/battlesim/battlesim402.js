// Battle Simulator for book 402 (Cretan Chronicles) - MIGHT/PROTECTION engine.
// See cretan.js for the full engine description. Honour defaults to 7 (book 400's
// starting value); books 401/402 carry Honour over from the previous book, so the
// player edits it to their current value.
import { createCretanSim } from './cretan.js';

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
