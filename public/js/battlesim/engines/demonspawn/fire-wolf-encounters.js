import { createFireWolfFight, FIRE_WOLF_ATTRIBUTES } from './fire-wolf.js';
import { fireWolfEnemy } from './fire-wolf-roster.js';

export const FIRE_WOLF_ENCOUNTERS = Object.freeze([
  { section: 'prologue', enemies: ['Baldar'], sparring: true, weapon: 'club', enemyWeapon: 'club', win: 140, defeat: 20 },
  { section: 2, enemies: ['Tigon'], weapon: 'sword', win: 5 },
  { section: 3, enemies: ['Constrictor Lizard'], weapon: 'sword', first: 'enemy', win: 5 },
  { section: 4, enemies: ['Bandit', 'Bandit'], weapon: 'sword', enemyWeapon: 'sword', manualGroup: true, bleeding: true, win: 5 },
  { section: 7, enemies: ['Baj'], weapon: 'unarmed', enemyWeapon: 'unarmed', healEntry: true, win: 11 },
  { section: 19, enemies: ['Illusion Lizard'], weapon: 'club', dynamic: 'illusion', win: 16 },
  { section: 36, enemies: ['Doppelganger'], weapon: 'doombringer', enemyWeapon: 'sword', dynamic: 'double', win: 37 },
  { section: 40, enemies: ['Pantherine'], weapon: 'doombringer', pitThreshold: 1, charmEscape: true, win: 62 },
  { section: 50, enemies: Array(12).fill('Pantherine'), weapon: 'doombringer', sequential: true, win: 48 },
  { section: 54, enemies: ['Pantherine'], weapon: 'doombringer', pitThreshold: 3, charmEscape: true, darkness: true, win: 50 },
  { section: 62, enemies: Array(12).fill('Pantherine'), weapon: 'doombringer', sequential: true, win: 48 },
  { section: 66, enemies: ['Great Hound', 'Great Hound'], weapon: 'doombringer', sequential: true, first: 'enemy', win: 74 },
  { section: 86, enemies: ['Demon'], weapon: 'doombringer', win: 102 },
  { section: 99, enemies: ['Giant Spider'], weapon: 'doombringer', win: 87 },
  { section: 105, enemies: ['Yveen'], weapon: 'doombringer', win: 97 },
  { section: 127, enemies: ['Tojar'], weapon: 'doombringer', enemyWeapon: 'sword', first: 'player', win: 134 },
  { section: 128, enemies: ['Tojar', 'Northern Slaver', 'Landlord'], weapon: 'doombringer', enemyWeapon: 'sword', manualGroup: true, win: 149 },
  { section: 133, enemies: ['Northern Slaver', 'Northern Slaver', 'Landlord'], weapon: 'doombringer', enemyWeapon: 'sword', manualGroup: true, win: 131 },
  { section: 147, enemies: [...Array(8).fill('Northern Slaver'), 'Landlord'], weapon: 'doombringer', enemyWeapon: 'sword', manualGroup: true, win: 136 },
  { section: 171, enemies: ['Archer'], weapon: 'doombringer', enemyWeapon: 'sword', win: null },
  { section: 173, enemies: ['Demonspawn Regent'], weapon: 'doombringer', regentSword: true, demonspawn: true, win: 183 },
].map(encounter => Object.freeze({ ...encounter, enemies: Object.freeze(encounter.enemies) })));

export function prepareFireWolfEncounter(section, player, { illusion = null, lightbringer = false, ...options } = {}) {
  const encounter = FIRE_WOLF_ENCOUNTERS.find(entry => String(entry.section) === String(section));
  if (!encounter) throw new Error('Unknown Fire*Wolf encounter');
  const p = structuredClone(player);
  p.weapon = encounter.weapon;
  if (encounter.healEntry) p.lifePoints = p.maxLife;
  let enemies;
  if (encounter.dynamic === 'double') {
    enemies = [{ ...p, name: 'Doppelganger', weapon: 'sword', armour: 'none', shield: false, magicArmour: 0 }];
  } else if (encounter.dynamic === 'illusion') {
    if (!illusion || [...FIRE_WOLF_ATTRIBUTES, 'skill'].some(key => !Number.isFinite(illusion[key]) || illusion[key] < 0)) {
      throw new Error('Set the imagined Illusion Lizard statistics first');
    }
    enemies = [{ ...structuredClone(illusion), name: 'Illusion Lizard', lifePoints: 384, maxLife: 384 }];
  } else enemies = encounter.enemies.map(name => fireWolfEnemy(name, { weapon: encounter.enemyWeapon ?? 'unarmed' }));
  if (encounter.bleeding) enemies[0].lifePoints -= 20;
  return { encounter: structuredClone(encounter), player: p, enemies, options: {
    ...options, lightbringer, sparring: !!encounter.sparring, pitThreshold: encounter.pitThreshold ?? 0,
    charmEscape: !!encounter.charmEscape, regentSword: !!encounter.regentSword,
    demonspawn: !!encounter.demonspawn,
  } };
}

export function createFireWolfEncounterDuel(prepared, index = 0) {
  if (prepared.encounter.manualGroup) throw new Error('This group requires explicit manual turn control');
  if (!Number.isInteger(index) || index < 0 || index >= prepared.enemies.length) throw new Error('Invalid opponent');
  let first = index === 0 ? prepared.encounter.first : null;
  if (prepared.encounter.darkness && !prepared.options.lightbringer) first = 'enemy';
  return createFireWolfFight(prepared.player, prepared.enemies[index], { ...prepared.options, first });
}
