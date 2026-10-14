// Book identity and declarative defaults; no DOM or saved-state access.
export const definition = Object.freeze({
  "id": 321,
  "title": "The Walls of Spyte",
  "family": "blood-sword",
  "stateKey": "sim321",
  "i18nPrefix": "battlesim321"
});

export const CLASS_PRESETS = {
  warrior:   { fp: 11, dmgDice: 7, dmgBonus: 1, endurance: 120, armor: 4 },
  trickster: { fp: 10, dmgDice: 7, dmgBonus: 0, endurance: 120, armor: 2 },
  mystic:    { fp: 10, dmgDice: 7, dmgBonus: 0, endurance: 100, armor: 2 },
  sorcerer:  { fp: 9,  dmgDice: 5, dmgBonus: 2, endurance: 100, armor: 2 },
};
