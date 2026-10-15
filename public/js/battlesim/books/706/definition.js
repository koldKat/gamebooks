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

export const ENCOUNTERS = Object.freeze({
  31: { level: 0, fatal: null, kind: 'combat' },
  42: { level: 5, fatal: 262, kind: 'negotiation' },
  67: { level: 0, fatal: null, kind: 'combat' },
  101: { level: 3, fatal: 421, kind: 'combat' },
  136: { level: 2, fatal: 236, kind: 'combat' },
  178: { level: 0, fatal: null, kind: 'negotiation' },
  187: { level: 0, fatal: null, kind: 'combat' },
  245: { level: 3, fatal: 385, kind: 'combat' },
  261: { level: 3, fatal: 421, kind: 'combat' },
  282: { level: 4, fatal: 292, kind: 'negotiation' },
  293: { level: 3, fatal: 473, kind: 'combat' },
  307: { level: 5, fatal: 487, kind: 'combat' },
  317: { level: 5, fatal: 487, kind: 'combat' },
  373: { level: 5, fatal: 483, kind: 'combat' },
  422: { level: 3, fatal: 432, kind: 'combat' },
  451: { level: 5, fatal: 461, kind: 'negotiation' },
  456: { level: 2, fatal: 41, kind: 'combat' },
  'map-6': { level: 16, fatal: 497, kind: 'combat' },
});
