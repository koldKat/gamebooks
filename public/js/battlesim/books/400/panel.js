import { DIVINE_WEAPON_NAME_RULES } from './definition.js';
// Book 400 Bloodfeud of Altheus (Cretan Chronicles); Honour starts at 7.
import { createCretanSim } from "../.././engines/cretan.js";

const _sim = createCretanSim({
  bookId: 400,
  idPrefix: 'sim400',
  stateKey: 'sim400',
  i18nPrefix: 'battlesim400',
  defaultHonour: 7,
  requiresDivineNameRules: DIVINE_WEAPON_NAME_RULES,
});

export const initSim400      = _sim.init;
export const renderSim400    = _sim.render;
export const setSim400Visible = _sim.setVisible;

export { initSim400 as init, renderSim400 as render, setSim400Visible as setVisible };
