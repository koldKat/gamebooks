import { createRosterLoader } from '../../roster-data.js';

// Book identity and declarative defaults; no DOM or saved-state access.
export const definition = Object.freeze({
  "id": 397,
  "title": "Пътят на съдбата",
  "family": "blood-sword",
  "stateKey": "sim397",
  "i18nPrefix": "battlesim397"
});

export const CLASS_PRESETS = {
  warrior:   { fp: 10, dmgDice: 6, dmgBonus: 0, endurance: 96, armor: 3 },
  trickster: { fp: 9,  dmgDice: 5, dmgBonus: 2, endurance: 96, armor: 2 },
  mystic:    { fp: 9,  dmgDice: 5, dmgBonus: 2, endurance: 80, armor: 2 },
  sorcerer:  { fp: 9,  dmgDice: 4, dmgBonus: 2, endurance: 80, armor: 2 },
};

export let PRINTED_ENEMY_ARMOUR = [];
export const loadRoster = createRosterLoader(397, 'ARMOUR_PROFILES', entries => { PRINTED_ENEMY_ARMOUR = entries; });
