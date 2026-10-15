export const definition = Object.freeze({
  id: 700,
  title: 'Пари и гангстери 3',
  family: 'money-and-gangsters',
  stateKey: 'sim700',
  i18nPrefix: 'battlesim700',
});

export const RULE_VERSION = 1;
export const PLAYER_DEFAULTS = Object.freeze({
  strength: 0, dexterity: 0, speed: 0, endurance: 25, enduranceMax: 25,
  combatSkill: 6, damageCode: 6, shooting: 6, prestige: 25,
});

export const UNARMED_RETURNS = Object.freeze({
  6: { win: 23, loss: 13 },
  102: { win: 121, loss: 141 },
  133: { win: 134, loss: 144 },
  177: { win: 157, loss: 167 },
  193: { win: 183, loss: null, fatal: true },
  266: { win: 289, loss: null, fatal: true },
  270: { win: 260, loss: 250 },
  277: { win: 287, loss: null, fatal: true },
});

export const SHOOTING_RETURNS = Object.freeze({
  143: 134, 192: 183, 215: 225, 229: 239, 236: 207,
  238: 209, 272: 262, 278: 288, 280: 246, 293: 273,
});

const enemy = (code, damageCode, endurance, strength, dexterity, speed, weaponCode = 0) =>
  ({ aggression: Math.floor(code / 10), skillCode: code % 10,
    damageCode, endurance, strength, dexterity, speed, weaponCode });

export function unarmedEncounter(origin, { count = 1, wounded = false } = {}) {
  const copies = (number, value) => Array.from({ length: number }, () => ({ ...value }));
  switch (Number(origin)) {
    case 6:
      return copies(1, enemy(32, 4, 10, 8, 4, 6));
    case 102:
      if (![1, 2].includes(count)) throw new RangeError('Invalid park pursuer count');
      return copies(count, enemy(33, 8, 25, 6, 8, 8));
    case 133:
      return copies(4, enemy(43, 50, 8, 4, 6, 8, 42));
    case 177:
      return copies(3, enemy(34, 4, 15, 12, 4, 2));
    case 193: {
      const physical = wounded ? 8 : 16;
      return copies(1, enemy(44, 18, 45, physical, physical, physical));
    }
    case 266:
      return [enemy(23, 48, 15, 8, 4, 6, 40),
        ...copies(2, enemy(23, 48, 15, 6, 10, 8, 40))];
    case 270:
      return copies(1, enemy(44, 18, 30, 18, 14, 16));
    case 277:
      return copies(1, enemy(33, 52, 30, 8, 12, 10, 40));
    default:
      throw new RangeError('Unknown unarmed encounter');
  }
}

const SHOOTING_ROSTERS = {
  143: { code: 32, fire: [8, 8, 8, 8], terrain: 1, distance: 1, cover: 0, playerCover: 0, physical: [6, 6, 6] },
  192: { code: 23, fire: [8, 8], terrain: 2, distance: 3, cover: null, coverOptions: [4, 8], playerCover: 2, physical: [6, 6, 6] },
  215: { code: 33, fire: [6, 6], terrain: 2, distance: 2, cover: null, coverOptions: [0, 4], playerCover: 0, physical: [6, 6, 6] },
  229: { code: 33, fire: [10], terrain: 2, distance: 4, cover: 10, playerCover: 0, physical: [6, 8, 8] },
  236: { code: 33, fire: [6, 6, 6], terrain: 3, cover: null, playerCover: null, physical: [4, 6, 8] },
  238: { code: 33, fire: [6, 6, 6, 6], terrain: 3, cover: null, playerCover: null, playerCoverOptions: [2, 4], physical: [6, 6, 6] },
  272: { code: 13, fire: [6, 8], terrain: 4, distance: 2, cover: null, playerCover: 0, physical: [4, 4, 8] },
  278: { code: 33, fire: [4, 4, 6, 6], terrain: 3, cover: null, playerCover: 0, physical: [6, 4, 6] },
  280: { code: 13, fire: [6, 8], terrain: 4, distance: 2, cover: null, playerCover: 0, physical: [4, 4, 8] },
  293: { code: 33, fire: [6, 6, 8, null], terrain: 3, cover: null, playerCover: 2, physical: [6, 8, 8] },
};

export function shootingEncounter(origin, { simplifiedMap = true } = {}) {
  const source = SHOOTING_ROSTERS[Number(origin)];
  if (!source) throw new RangeError('Unknown shooting encounter');
  const [strength, dexterity, speed] = source.physical;
  return {
    origin: Number(origin), terrain: source.terrain,
    playerCover: source.playerCover,
    playerCoverOptions: source.playerCoverOptions ? [...source.playerCoverOptions] : null,
    simplifiedMap: source.terrain === 3 && simplifiedMap,
    opponents: source.fire.map(effectiveFire => ({
      aggression: Math.floor(source.code / 10), skillCode: source.code % 10,
      effectiveFire, weaponPower: null, strength, dexterity, speed,
      distance: source.distance ?? (simplifiedMap ? 4 : null),
      cover: source.cover,
      coverOptions: source.coverOptions ? [...source.coverOptions] : null,
    })),
  };
}
export const CHECKS = Object.freeze({
  42: ['strength', 'speed', 'combatSkill'],
  101: ['strength', 'dexterity', 'combatSkill', 'strikingStyle'],
  111: ['strength', 'dexterity', 'combatSkill', 'strikingStyle'],
  175: ['strength', 'dexterity', 'combatSkill', 'douglas'],
  210: ['speed', 'shooting'],
  230: ['strength', 'speed', 'dexterity', 'combatSkill'],
  252: ['shooting', 'combatSkill', 'primaryPower'],
  256: ['speed', 'dexterity', 'combatSkill'],
  257: ['strength', 'dexterity'],
  '83-smg': ['shooting', 'speed'],
  '83-pistol': ['shooting', 'speed'],
  216: ['fighters', 'primaryPower'],
  226: ['fighters', 'primaryPower'],
  220: ['fighters'],
  228: ['shooting', 'primaryPower'],
  242: ['fighters', 'labDamage'],
  243: ['fighters', 'barracksDamage'],
  261: ['fighters', 'squads', 'attackHelis'],
  268: ['fighters', 'sequential', 'day'],
  273: ['fighters', 'barracksDamage'],
  282: ['fighters', 'labDamage'],
  283: ['fighters', 'groups', 'groupSize'],
  292: ['fighters', 'groups', 'groupSize'],
  284: ['fighters', 'guardPosted', 'day'],
});
