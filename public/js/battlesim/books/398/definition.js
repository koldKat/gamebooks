import { createRosterLoader } from '../../roster-data.js';

// Book identity and declarative defaults; no DOM or saved-state access.
export const definition = Object.freeze({
  "id": 398,
  "title": "Стените на Спайт",
  "family": "blood-sword",
  "stateKey": "sim398",
  "i18nPrefix": "battlesim398"
});

export const CLASS_PRESETS = {
  warrior:   { fp: 11, dmgDice: 7, dmgBonus: 1, endurance: 120, armor: 3 },
  trickster: { fp: 10, dmgDice: 7, dmgBonus: 0, endurance: 120, armor: 2 },
  mystic:    { fp: 10, dmgDice: 7, dmgBonus: 0, endurance: 100, armor: 2 },
  sorcerer:  { fp: 9,  dmgDice: 5, dmgBonus: 2, endurance: 100, armor: 2 },
};

export let PRINTED_ENEMY_ARMOUR = [];
export const loadRoster = createRosterLoader(398, 'ARMOUR_PROFILES', entries => { PRINTED_ENEMY_ARMOUR = entries; });
