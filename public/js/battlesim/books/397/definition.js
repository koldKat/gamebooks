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

export const PRINTED_ENEMY_ARMOUR = [
  ['Тангбранд', 9, 48, 4, 0, 2],
  ['Тъмничар', 7, 12, 1, 1, 1],
  ['Тобиас', 10, 65, 5, 0, 3],
  ['Грабители', 7, 15, 1, 0, 1],
  ['Великанът Гарм', 7, 68, 7, 0, 1],
  ['Твари', 7, 15, 1, 1, 2],
  ['Великанът Тифон', 8, 70, 6, 1, 3],
  ['Брадато куче', 8, 56, 4, 1, 1],
  ['Пазач на съкровището', 9, 45, 3, 0, 1],
  ['Бронзови Воини', 7, 10, 1, 0, 1],
  ['Какодемон', 8, 27, 3, 3, 6],
  ['Дворцови герои', 8, 24, 2, 1, 3],
];
