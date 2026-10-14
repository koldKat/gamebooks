// Book identity and declarative defaults; no DOM or saved-state access.
export const definition = Object.freeze({
  "id": 399,
  "title": "Роди се сянка",
  "family": "chronicles-of-orm",
  "stateKey": "sim399",
  "i18nPrefix": "battlesim399"
});

export const MODES = ['unarmed', 'melee', 'gunfight', 'cyber', 'vehicle'];

export const ENEMY_MODE = {
  'Гигантски гущер': 'unarmed',
  'Служителка на "Бионаги"': 'cyber',
  'Виртуален фехтовач': 'melee',
  'Киберчудовище': 'unarmed',
  'Киберпаяк': 'gunfight',
  'Виртуална котка-сънувач "Баст"': 'cyber',
  'Неизвестен корпоративен служител': 'unarmed',
  'Уличен дилър': 'unarmed',
  'Защитна програма': 'cyber',
  'Виртуални младежи (момче)': 'unarmed',
  'Андроидка убиец': 'melee',
  'Спецгард на "Саурон"': 'melee',
  'Неизвестен противник': 'melee',
};

export const ENEMY_STATS = {
  'Гигантски гущер': { speed: 6, str: 10, reflex: 6 },
  'Служителка на "Бионаги"': { speed: 2, str: 2, acc: 2, reflex: 2, power: 3, eqspeed: 3 },
  'Виртуален фехтовач': { speed: 3, acc: 4, reflex: 3, power: 3, eqspeed: 4, manual: true },
  'Киберчудовище': { speed: 4, str: 8, reflex: 5 },
  'Киберпаяк': { speed: 4, acc: 8, reflex: 5, power: 4, eqspeed: 2 },
  'Виртуална котка-сънувач "Баст"': { speed: 4, acc: 4, reflex: 5, power: 4, eqspeed: 5 },
  'Неизвестен корпоративен служител': { speed: 2, str: 2, reflex: 2 },
  'Уличен дилър': { speed: 1, str: 2, reflex: 1 },
  'Защитна програма': { speed: 2, acc: 2, reflex: 2, power: 3, eqspeed: 3 },
  'Виртуални младежи (момче)': { speed: 1, str: 2, reflex: 2 },
  'Андроидка убиец': { speed: 2, str: 2, reflex: 2, power: 1, eqspeed: 5 },
  'Спецгард на "Саурон"': { speed: 2, acc: 4, reflex: 2, eqspeed: 5, manual: true },
  'Неизвестен противник': { speed: 3, acc: 3, reflex: 2, eqspeed: 5, manual: true },
};
