import { DIVINE_WEAPON_NAME_RULES } from './definition.js';
// Book 402 Return of the Wanderer (Cretan Chronicles); Honour carries over.
import { createCretanSim } from "../.././engines/cretan.js";

const _sim = createCretanSim({
  bookId: 402,
  idPrefix: 'sim402',
  stateKey: 'sim402',
  i18nPrefix: 'battlesim402',
  defaultHonour: 7,
  requiresDivineNameRules: DIVINE_WEAPON_NAME_RULES,
});

export const initSim402      = _sim.init;
export const renderSim402    = _sim.render;
export const setSim402Visible = _sim.setVisible;

export { initSim402 as init, renderSim402 as render, setSim402Visible as setVisible };
