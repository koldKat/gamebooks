export const definition = Object.freeze({
  id: 706,
  title: 'Синът на пустинята',
  family: 'son-of-the-desert',
  stateKey: 'sim706',
  i18nPrefix: 'battlesim706',
});

export const POSITIONS = Object.freeze({
  'А': { enemies: 0, ratio: 1, penalty: 0 },
  'Б': { enemies: 6, ratio: 2, penalty: 1, clear: true },
  'В': { enemies: 5, ratio: 1, penalty: 2, clear: true },
  'Г': { enemies: 6, ratio: 2, penalty: 1, clear: true },
  'Д': { enemies: 2, ratio: 1, penalty: 4, clear: true, poison: true },
  'Е': { enemies: 1, ratio: 1, penalty: 2, clear: true },
  'Ж': { enemies: 32, ratio: 2, penalty: 6 },
  'З': { enemies: 0, ratio: 1, penalty: 0 },
  'И': { enemies: 8, ratio: 2, penalty: 3, clear: true },
  'Й': { enemies: 0, ratio: 1, penalty: 0, lookout: true },
  'К': { enemies: 8, ratio: 2, penalty: 3, clear: true },
  'Л': { enemies: 0, ratio: 1, penalty: 0, lookout: true },
});
