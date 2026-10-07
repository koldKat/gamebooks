// Book 491, Кралска кръв (комикс-игра, part 2) - thin wrapper over the shared
// kralska.js opposed-roll engine. Player starts 5 Сила/20 Издръжливост.
import { createKralskaSim } from './engines/kralska.js';

const _sim = createKralskaSim({
  bookId: 491,
  idPrefix: 'sim491',
  stateKey: 'sim491',
  i18nPrefix: 'battlesim491',
  startSila: 5,
  startIzd: 20,
  preserveDeadPlayer: true,
});

export const initSim491       = _sim.init;
export const renderSim491     = _sim.render;
export const setSim491Visible = _sim.setVisible;
