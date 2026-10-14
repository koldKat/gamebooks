// Book identity and declarative defaults; no DOM or saved-state access.
export const definition = Object.freeze({
  "id": 318,
  "title": "The Kingdom of Wyrd",
  "family": "blood-sword",
  "stateKey": "sim318",
  "i18nPrefix": "battlesim318"
});

export const CLASS_PRESETS = {
  warrior:   { fp: 9, dmgDice: 4, dmgBonus: 2, endurance: 72, armor: 3 },
  trickster: { fp: 8, dmgDice: 4, dmgBonus: 1, endurance: 72, armor: 2 },
  mystic:    { fp: 8, dmgDice: 4, dmgBonus: 1, endurance: 60, armor: 2 },
  sorcerer:  { fp: 8, dmgDice: 3, dmgBonus: 2, endurance: 60, armor: 2 },
};
