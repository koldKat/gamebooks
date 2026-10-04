// Book 486, Кралска кръв (комикс-игра, part 3) - thin wrapper over the shared
// kralska.js opposed-roll engine. Rules carried from part 1 (book 481): player
// starts 5 Сила/20 Издръжливост.
import { createKralskaSim } from './engines/kralska.js';

const _sim = createKralskaSim({
  bookId: 486,
  idPrefix: 'sim486',
  stateKey: 'sim486',
  i18nPrefix: 'battlesim486',
  startSila: 5,
  startIzd: 20,
});

export const initSim486       = _sim.init;
export const renderSim486     = _sim.render;
export const setSim486Visible = _sim.setVisible;
