// Book identity and declarative defaults; no DOM or saved-state access.
export const definition = Object.freeze({
  "id": 869,
  "title": "Тигрово око",
  "family": "tiger-eye",
  "stateKey": "sim869",
  "i18nPrefix": "battlesim869"
});

export const RIVALS = [
  { id: 'dalgren', nameKey: 'battlesim869.name.dalgren', s: 11, e: 16, m: 0,  b: 13, sword: 4, shield: 'none' },
  { id: 'tindalin', nameKey: 'battlesim869.name.tindalin', s: 12, e: 18, m: 3,  b: 7,  sword: 5, shield: 'magic' },
  { id: 'matual',  nameKey: 'battlesim869.name.matual', s: 10, e: 10, m: 5,  b: 15, sword: 4, shield: 'holy' },
  { id: 'smajtal', nameKey: 'battlesim869.name.smajtal', s: 8,  e: 6,  m: 12, b: 14, sword: 5, shield: 'holy' },
  { id: 'uantor',  nameKey: 'battlesim869.name.uantor', s: 12, e: 12, m: 3,  b: 13, sword: 5, shield: 'holy' },
  { id: 'lestor',  nameKey: 'battlesim869.name.lestor', s: 8,  e: 12, m: 0,  b: 20, sword: 6, shield: 'none' },
  { id: 'tejbrun', nameKey: 'battlesim869.name.tejbrun', s: 14, e: 12, m: 2,  b: 12, sword: 4, shield: 'none' },
];

export const SPECIAL2 = ['tejbrun', 'matual'];
