// Book identity and declarative defaults; no DOM or saved-state access.
export const definition = Object.freeze({
  "id": 871,
  "title": "Сага за Ринглас",
  "family": "ringlas-saga",
  "stateKey": "sim871",
  "i18nPrefix": "battlesim871"
});

export const ROSTER = [
  { id: 'bandit',   nameKey: 'battlesim871.name.bandit',   target: 8,  stamina: 10, multi: false },
  { id: 'stone',    nameKey: 'battlesim871.name.stone',    target: 9,  stamina: 12, multi: true },
  { id: 'knight',   nameKey: 'battlesim871.name.knight',   target: 9,  stamina: 6,  multi: false },
  { id: 'waterspirit', nameKey: 'battlesim871.name.waterspirit', target: 4, stamina: 10, multi: true },
  { id: 'snowwarrior', nameKey: 'battlesim871.name.snowwarrior', target: 7, stamina: 10, multi: true },
  { id: 'simaut',   nameKey: 'battlesim871.name.simaut',   target: 10, stamina: 5,  multi: false, playerBonus: 5 },
  { id: 'mudmonster', nameKey: 'battlesim871.name.mudmonster', target: 5, stamina: 10, multi: true },
  { id: 'armoredknight', nameKey: 'battlesim871.name.armoredknight', target: 6, stamina: 12, multi: true },
  { id: 'dragon',   nameKey: 'battlesim871.name.dragon',   target: 10, stamina: 6,  multi: false },
  { id: 'icedemon', nameKey: 'battlesim871.name.icedemon', target: 8,  stamina: 6,  multi: false },
  { id: 'wolf',     nameKey: 'battlesim871.name.wolf',     target: 6,  stamina: 12, multi: true },
  { id: 'icelion',  nameKey: 'battlesim871.name.icelion',  target: 9,  stamina: 12, multi: true },
  { id: 'spider',   nameKey: 'battlesim871.name.spider',   target: 7,  stamina: 10, multi: false },
];
