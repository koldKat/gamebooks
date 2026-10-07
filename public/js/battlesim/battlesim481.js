// Book 481, Кралска кръв (комикс-игра, part 1) - thin wrapper over the shared
// kralska.js opposed-roll engine. Player starts 5 Сила/20 Издръжливост.
import { createKralskaSim, resolveRound } from './engines/kralska.js';

export { resolveRound };

const _sim = createKralskaSim({
  bookId: 481,
  idPrefix: 'sim481',
  stateKey: 'sim481',
  i18nPrefix: 'battlesim481',
  startSila: 5,
  startIzd: 20,
  preserveDeadPlayer: true,
});

export const initSim481       = _sim.init;
export const renderSim481     = _sim.render;
export const setSim481Visible = _sim.setVisible;
