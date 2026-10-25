import { prepareCustomDemonEncounter } from './opponents.js';
import { createFireWolfFight, FIRE_WOLF_ATTRIBUTES } from './fire-wolf.js';
import { fireWolfEnemy, installFireWolfRoster } from './fire-wolf-roster.js';

import { createRosterLoader } from '../../roster-data.js';

export let FIRE_WOLF_ENCOUNTERS = Object.freeze([]);
export const loadRoster = createRosterLoader(534, 'BOOK_DATA', rows => {
  const enemies = rows.filter(row => row.kind === 'fixed').map(row => row.enemy);
  const encounters = rows.flatMap(row => row.encounters).sort((a,b) => a.index-b.index);
  const rules = rows.find(row => row.support)?.support.rules;
  if (!enemies.length || !encounters.length || !rules?.regent || new Set(encounters.map(row => row.index)).size !== encounters.length) throw new Error('Incomplete Fire*Wolf catalog');
  const presets = Object.freeze(encounters.map(({spec}) => Object.freeze({...spec, enemies: Object.freeze(spec.enemies)})));
  installFireWolfRoster(enemies, rules);
  FIRE_WOLF_ENCOUNTERS = presets;
});

export function prepareFireWolfEncounter(section, player, { illusion = null, lightbringer = false, ...options } = {}) {
  const custom = prepareCustomDemonEncounter(section, player, options.opponents);
  if (custom) return custom;
  const encounter = FIRE_WOLF_ENCOUNTERS.find(entry => String(entry.section) === String(section));
  if (!encounter) throw new Error('Unknown Fire*Wolf encounter');
  const p = structuredClone(player);
  p.weapon = encounter.weapon;
  if (encounter.healEntry) p.lifePoints = p.maxLife;
  let enemies;
  if (encounter.dynamic === 'double') {
    enemies = [{ ...p, ...encounter.enemyTemplate }];
  } else if (encounter.dynamic === 'illusion') {
    if (!illusion || [...FIRE_WOLF_ATTRIBUTES, 'skill'].some(key => !Number.isFinite(illusion[key]) || illusion[key] < 0)) {
      throw new Error('Set the imagined Illusion Lizard statistics first');
    }
    enemies = [{ ...structuredClone(illusion), ...encounter.enemyTemplate }];
  } else enemies = encounter.enemies.map(name => fireWolfEnemy(name, { weapon: encounter.enemyWeapon ?? 'unarmed' }));
  if (encounter.bleeding) enemies[0].lifePoints -= encounter.enemyEntryDamage;
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
