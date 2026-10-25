import { createRosterLoader } from '../../roster-data.js';

// Book identity and declarative defaults; no DOM or saved-state access.
export const definition = Object.freeze({
  "id": 213,
  "title": "Appointment with F.E.A.R.",
  "family": "fighting-fantasy",
  "stateKey": "sim213",
  "i18nPrefix": "battlesim213"
});

export const SUPER_POWERS = [
  ['strength',   'battlesim213.power.strength'],
  ['psi',        'battlesim213.power.psi'],
  ['ets',        'battlesim213.power.ets'],
  ['energyblast','battlesim213.power.energyblast'],
];

export const HERO_POINT_PENALTY = 1;

export const SUPER_POWER_STAMINA_COST = 2;

export const FEAR_RULES = {};
export const loadRoster = createRosterLoader(213, 'FEAR_RULES', entries => {
  if (entries.length !== 1 || !Number.isSafeInteger(entries[0].surrenderStaminaMax) || entries[0].surrenderStaminaMax < 0) throw new Error('Incomplete Appointment with F.E.A.R. settings');
  Object.assign(FEAR_RULES, entries[0]);
});
