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

export const PRINTED_ENEMY_ARMOUR = [
  ['Леден брониран рицар', 8, 90, 6, 0, 5],
  ['Онака', 8, 40, 4, 0, 4],
  ['Демон Владетел', 12, 90, 3, 0, 3],
  ['Дявол', 9, 105, 5, 2, 1],
  ['Огнени змии', 7, 21, 3, 3, 3],
  ['Не-мъртва кралица', 8, 60, 4, 0, 3],
  ['Последователи на Маговете (6, бронирани)', 7, 15, 3, 0, 3],
  ['Кракен', 8, 50, 6, 0, 4],
  ['Базилиск', 6, 24, 2, 0, 1],
  ['Ледена мечка', 8, 38, 4, 0, 2],
  ['Аргус', 9, 54, 3, 3, 3],
  ['Орки', 6, 25, 3, 0, 2],
  ['Квартирмайстори на Червената смърт', 8, 35, 5, 0, 5],
  ['Великанът Снорид', 11, 950, 20, 0, 10],
  ['Биофаг', 8, 30, 3, 0, 4],
  ['Абаносов автомат', 9, 70, 3, 0, 7],
  ['Не-мъртви прокажени', 6, 30, 3, 0, 3],
  ['Бронтофон', 8, 40, 4, 0, 5],
  ['Дракон', 8, 150, 7, 0, 4],
];
