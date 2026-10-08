import { FIRE_WOLF_ATTRIBUTES, rollFireWolfCharacter, fireWolfNaturalLife } from './fire-wolf.js';
import { cryptsEnemy } from './crypts-of-terror-roster.js';

export function rollCryptsCharacter(random = Math.random) {
  const player = rollFireWolfCharacter(random);
  player.skill = 10;
  player.lifePoints = player.maxLife = fireWolfNaturalLife(player);
  player.power = player.maxPower = 0;
  return player;
}

export const CRYPTS_ENCOUNTERS = Object.freeze([
  { section: 14, enemies: Array(12).fill("King's Guard"), rule: 'chase', win: 45, defeat: 3 },
  { section: 16, enemies: ['Worm'], crypt: true, first: 'player', win: 35, powerReward: 10 },
  { section: 34, enemies: ['Statue', 'Statue'], crypt: true, win: 19 },
  { section: 47, enemies: ['Vampire'], crypt: true, rule: 'vampire', win: [8, 62], powerReward: 20 },
  { section: 61, enemies: ['Tanith'], weapon: 'sword', rule: 'first-blood', noMagic: true, win: 44, defeat: 4 },
  { section: 71, enemies: ['Alchiller'], crypt: true, first: 'enemy', win: 25 },
  { section: 76, enemies: ['Wight', 'Wight'], crypt: true, rule: 'wights', win: 37 },
  { section: 77, enemies: ['Alchiller', 'Alchiller'], crypt: true, enemyOpening: 2, win: [23, 32, 38] },
  { section: 83, enemies: Array(4).fill('Alchiller'), crypt: true, enemyOpening: 2, win: 88 },
  { section: 84, enemies: Array(3).fill("King's Guard"), win: 95 },
  { section: 85, enemies: ['Alchiller', 'Alchiller'], crypt: true, enemyOpening: 2, win: [23, 32, 38] },
  { section: 91, enemies: ['Giant Rat'], rule: 'rat', win: 42 },
  { section: 94, enemies: Array(4).fill('Alchiller'), crypt: true, win: 88 },
  { section: 100, enemies: ['Panther'], win: 10 },
  { section: 103, enemies: Array(4).fill('Alchiller'), crypt: true, win: 88 },
  { section: 108, enemies: ['Manticore'], rule: 'manticore', win: 120 },
  { section: 111, enemies: ['Shaman Wizard'], rule: 'wizard-duel', noPoisonNeedle: true, noArtifacts: true, win: 125, defeat: [6, 74] },
  { section: 113, enemies: ['Young Officer'], weapon: 'unarmed', rule: 'nonfatal-50', win: 121, defeat: 110 },
  { section: 119, enemies: ['Palace Guard', 'Palace Guard'], rule: 'flee-20', win: 104 },
  { section: 136, enemies: ['Fortress Guard', 'Fortress Guard'], rule: 'reinforcements', win: 157 },
  { section: 144, enemies: Array(3).fill('Pseudo-Spawn'), rule: 'magic-only', win: 129 },
  { section: 145, enemies: Array(3).fill('Clementine'), rule: 'knockout-10', win: 131 },
  { section: 149, enemies: Array(5).fill('Demonspawn'), win: 'map' },
  { section: 157, enemies: [...Array(4).fill('Demonspawn'), 'Harkaan Prince'], rule: 'prince-joins', win: 158 },
  { section: 'horn', enemies: ['Horn Monster'], rule: 'horn-reversal', win: null },
].map(encounter => Object.freeze({ ...encounter, enemies: Object.freeze(encounter.enemies),
  ...(Array.isArray(encounter.win) ? { win: Object.freeze(encounter.win) } : {}),
  ...(Array.isArray(encounter.defeat) ? { defeat: Object.freeze(encounter.defeat) } : {}) })));

const equipment = {
  Panther: { weapon: 15 }, "King's Guard": { weapon: 'sword', armour: 'leather' },
  Tanith: { weapon: 'sword' }, 'Giant Rat': { weapon: 5 }, Vampire: { weapon: 5 },
  Worm: { weapon: 12, armour: 8 }, Statue: { weapon: 'sword', armour: 10 },
  Alchiller: { weapon: 8, spells: ['poisonNeedle', 'fireball'] },
  'Horn Monster': { weapon: 10, armour: 13, spells: ['fireball'] },
  'Palace Guard': { weapon: null, manualWeapon: true }, Manticore: { weapon: 10, spells: ['paralysis'] },
  'Pseudo-Spawn': { weapon: 5, spells: ['xenophobia'], magicOnly: true },
  Elemental: { weapon: 10, magicOnly: true }, Clementine: { weapon: 6 },
  Demonspawn: { weapon: 15, spawn: true }, 'Fortress Guard': { weapon: 'sword', armour: 'plate' },
  'Harkaan Prince': { weapon: null, manualWeapon: true, spells: 'all' },
};

function manualEnemy(name, values) {
  const keys = [...FIRE_WOLF_ATTRIBUTES, 'skill', 'lifePoints'];
  if (!values || keys.some(key => !Number.isFinite(values[key]) || values[key] < 0) || values.lifePoints <= 0) {
    throw new Error('This opponent needs manually supplied statistics');
  }
  if (name === 'Shaman Wizard' && (!Number.isFinite(values.power) || values.power < 0)) {
    throw new Error('The Shaman Wizard needs manually supplied Power');
  }
  return { ...structuredClone(values), name, maxLife: values.lifePoints,
    maxPower: values.power ?? 0, weapon: values.weapon ?? 'unarmed' };
}

export function prepareCryptsEncounter(section, player, { manual = null, haroldWarning = false,
  cursedStone = false, orb = false, clementineUnarmed = false, ...options } = {}) {
  const encounter = CRYPTS_ENCOUNTERS.find(e => String(e.section) === String(section));
  if (!encounter) throw new Error('Unknown Crypts of Terror encounter');
  const p = structuredClone(player);
  // The crypts explicitly suppress Doombringer's magic and use a normal sword.
  p.weapon = encounter.weapon ?? (encounter.crypt ? 'sword' : p.weapon ?? 'sword');
  const enemies = encounter.enemies.map(name => {
    if (name === 'Wight') return { name, lifePoints: 400, maxLife: 400,
      manualStats: true, magicOnly: true, weapon: null };
    if (['Young Officer', 'Shaman Wizard'].includes(name)) return manualEnemy(name, manual);
    return cryptsEnemy(name, { armour: 'none', weapon: 'unarmed', ...equipment[name] });
  });
  if (clementineUnarmed) for (const enemy of enemies) if (enemy.name === 'Clementine') enemy.weapon = 5;
  let first = encounter.first ?? null;
  if (Number(encounter.section) === 47 && haroldWarning) first = 'player';
  return { encounter: structuredClone(encounter), player: p, enemies,
    options: { ...options, first, cursedStone, orb, suppressDoombringer: !!encounter.crypt,
      manualGroup: enemies.length > 1, enemyOpening: encounter.enemyOpening ?? 0 } };
}

export function cryptsChase(player) {
  const score = player.speed + player.stamina;
  if (!Number.isFinite(score)) throw new Error('Invalid chase statistics');
  if (score > 104) return { fasterGuards: 0, equalGuards: 0, damage: 0, destination: 45 };
  if (score === 104) return { fasterGuards: 0, equalGuards: 12, damage: 600, destination: 45 };
  return { fasterGuards: 12, equalGuards: 0, damage: 0, destination: null };
}
