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
