import { prepareCustomDemonEncounter } from './opponents.js';
import { FIRE_WOLF_ATTRIBUTES, rollFireWolfCharacter, fireWolfNaturalLife } from './fire-wolf.js';
import { cryptsEnemy, installCryptsRoster, CRYPTS_EQUIPMENT, CRYPTS_VARIANTS, CRYPTS_SPECIAL_ENEMIES, CRYPTS_RULES } from './crypts-of-terror-roster.js';

export function rollCryptsCharacter(random = Math.random) {
  const player = rollFireWolfCharacter(random);
  player.skill = 10;
  player.lifePoints = player.maxLife = fireWolfNaturalLife(player);
  player.power = player.maxPower = 0;
  return player;
}

import { createRosterLoader } from '../../roster-data.js';

export let CRYPTS_ENCOUNTERS = Object.freeze([]);
export const loadRoster = createRosterLoader(535, 'BOOK_DATA', rows => {
  const encounters = rows.flatMap(row => row.encounters).sort((a,b) => a.index-b.index);
  if (!rows.some(row => row.kind === 'fixed') || !encounters.length || new Set(encounters.map(row => row.index)).size !== encounters.length) throw new Error('Incomplete encounter catalog');
  const presets = Object.freeze(encounters.map(({spec}) => Object.freeze({...spec,
    ...(spec.enemies ? {enemies: Object.freeze(spec.enemies)} : {}),
    ...(Array.isArray(spec.win) ? {win: Object.freeze(spec.win)} : {}),
    ...(Array.isArray(spec.defeat) ? {defeat: Object.freeze(spec.defeat)} : {}),
  })));
  installCryptsRoster(rows);
  CRYPTS_ENCOUNTERS = presets;
});

function manualEnemy(name, values) {
  const keys = [...FIRE_WOLF_ATTRIBUTES, 'skill', 'lifePoints'];
  if (!values || keys.some(key => !Number.isFinite(values[key]) || values[key] < 0) || values.lifePoints <= 0) {
    throw new Error('This opponent needs manually supplied statistics');
  }
  if (name === CRYPTS_RULES.manualPowerEnemy && (!Number.isFinite(values.power) || values.power < 0)) {
    throw new Error('The Shaman Wizard needs manually supplied Power');
  }
  return { ...structuredClone(values), name, maxLife: values.lifePoints,
    maxPower: values.power ?? 0, weapon: values.weapon ?? 'unarmed' };
}

export function prepareCryptsEncounter(section, player, { manual = null, haroldWarning = false,
  cursedStone = false, orb = false, clementineUnarmed = false, ...options } = {}) {
  const custom = prepareCustomDemonEncounter(section, player, options.opponents);
  if (custom) return custom;
  const encounter = CRYPTS_ENCOUNTERS.find(e => String(e.section) === String(section));
  if (!encounter) throw new Error('Unknown Crypts of Terror encounter');
  const p = structuredClone(player);
  // The crypts explicitly suppress Doombringer's magic and use a normal sword.
  p.weapon = encounter.weapon ?? (encounter.crypt ? 'sword' : p.weapon ?? 'sword');
  const enemies = encounter.enemies.map(name => {
    const special = CRYPTS_SPECIAL_ENEMIES[name];
    if (special?.kind === 'fixed-life') return structuredClone(special.enemy);
    if (special?.kind === 'supplied') return manualEnemy(name, manual);
    return cryptsEnemy(name, { armour: 'none', weapon: 'unarmed', ...CRYPTS_EQUIPMENT[name] });
  });
  if (clementineUnarmed) for (const enemy of enemies) if (enemy.name === 'Clementine') enemy.weapon = CRYPTS_VARIANTS[enemy.name].unarmed.weapon;
  let first = encounter.first ?? null;
  if (Number(encounter.section) === CRYPTS_RULES.haroldWarningSection && haroldWarning) first = 'player';
  return { encounter: structuredClone(encounter), player: p, enemies,
    options: { ...options, first, cursedStone, orb, suppressDoombringer: !!encounter.crypt,
      manualGroup: enemies.length > 1, enemyOpening: encounter.enemyOpening ?? 0 } };
}

export function cryptsChase(player) {
  const score = player.speed + player.stamina;
  if (!Number.isFinite(score)) throw new Error('Invalid chase statistics');
  const encounter = CRYPTS_ENCOUNTERS.find(entry => entry.rule === 'chase');
  const guard = cryptsEnemy(encounter.enemies[0]);
  const threshold = guard.speed + guard.stamina, count = encounter.enemies.length;
  if (score > threshold) return { fasterGuards: 0, equalGuards: 0, damage: 0, destination: encounter.win };
  if (score === threshold) return { fasterGuards: 0, equalGuards: count, damage: count * encounter.chaseRules.equalDamagePerGuard, destination: encounter.win };
  return { fasterGuards: count, equalGuards: 0, damage: 0, destination: null };
}
