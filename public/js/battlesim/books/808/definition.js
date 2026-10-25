import { createRosterLoader } from '../../roster-data.js';
export const definition = Object.freeze({
  id: 808,
  title: 'Заветът на Зендари',
  family: 'mech-combat',
  stateKey: 'sim808',
  i18nPrefix: 'battlesim808',
});

export const RULES_REVISION = 1;
export const MECHS = Object.freeze({
  argos: { weapons: 3, armour: 4 },
  olympia: { weapons: 4, armour: 3 },
  sparta: { weapons: 5, armour: 5 },
  mycenae: { weapons: 4, armour: 4 },
});
export let ENCOUNTERS = [];
export const ZENDARI_RULES = {};
export const loadRoster = createRosterLoader(808, 'ENCOUNTERS', rows => {
  const rules = rows.find(row => row.support)?.support.rules;
  if (!rules) throw new Error('Incomplete Zendari settings');
  Object.assign(ZENDARI_RULES, rules);
  ENCOUNTERS = rows.map(({support,...entry}) => entry);
});
