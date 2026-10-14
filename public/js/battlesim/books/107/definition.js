// Book identity and declarative defaults; no DOM or saved-state access.
export const definition = Object.freeze({
  "id": 107,
  "title": "Демонски нокът",
  "family": "blood-sword",
  "stateKey": "sim107",
  "i18nPrefix": "battlesim107"
});

export const CLASS_PRESETS = {
  warrior:   { fp: 10, dmgDice: 5, dmgBonus: 1, endurance: 96, armor: 3 },
  trickster: { fp: 9,  dmgDice: 5, dmgBonus: 2, endurance: 96, armor: 2 },
  mystic:    { fp: 9,  dmgDice: 5, dmgBonus: 2, endurance: 80, armor: 2 },
  sorcerer:  { fp: 9,  dmgDice: 4, dmgBonus: 2, endurance: 80, armor: 2 },
};
