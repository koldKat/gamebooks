import { createRosterLoader } from '../../roster-data.js';

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

export let UNARMED_RETURNS = Object.freeze({});
export let SHOOTING_RETURNS = Object.freeze({});
let UNARMED_ROSTERS = {};
let SHOOTING_ROSTERS = {};
export const loadRoster = createRosterLoader(700, 'CATALOG', entries => {
  const unarmed = entries.filter(entry => entry.kind === 'unarmed');
  const shooting = entries.filter(entry => entry.kind === 'shooting');
  UNARMED_ROSTERS = Object.fromEntries(unarmed.map(entry => [entry.origin, entry]));
  SHOOTING_ROSTERS = Object.fromEntries(shooting.map(entry => [entry.origin, entry.source]));
  UNARMED_RETURNS = Object.freeze(Object.fromEntries(unarmed.map(entry => [entry.origin, entry.returns])));
  SHOOTING_RETURNS = Object.freeze(Object.fromEntries(shooting.map(entry => [entry.origin, entry.returns])));
});

export function unarmedEncounter(origin, { count = 1, wounded = false } = {}) {
  const source = UNARMED_ROSTERS[Number(origin)];
  if (!source) throw new RangeError('Unknown unarmed encounter');
  if (source.countOptions && !source.countOptions.includes(count)) throw new RangeError('Invalid park pursuer count');
  const opponents = wounded && source.woundedOpponents ? source.woundedOpponents : source.opponents;
  return opponents.slice(0, source.countOptions ? count : opponents.length).map(opponent => ({ ...opponent }));
}

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
