// Book identity and declarative defaults; no DOM or saved-state access.
export const definition = Object.freeze({
  "id": 317,
  "title": "The Battlepits of Krarth",
  "family": "blood-sword",
  "stateKey": "sim317",
  "i18nPrefix": "battlesim317"
});

export const CLASS_PRESETS = {
  warrior:   { fp: 9, dmgDice: 3, dmgBonus: 1, endurance: 48, armor: 3 },
  trickster: { fp: 8, dmgDice: 3, dmgBonus: 0, endurance: 48, armor: 2 },
  mystic:    { fp: 8, dmgDice: 3, dmgBonus: 0, endurance: 40, armor: 2 },
  sorcerer:  { fp: 7, dmgDice: 2, dmgBonus: 2, endurance: 40, armor: 2 },
};
