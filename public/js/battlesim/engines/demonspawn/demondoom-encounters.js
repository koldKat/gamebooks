import { prepareCustomDemonEncounter } from './opponents.js';
import { demondoomEnemy, installDemondoomRoster } from './demondoom-roster.js';

import { createRosterLoader } from '../../roster-data.js';

export let DEMONDOOM_ENCOUNTERS = Object.freeze([]);
export const loadRoster = createRosterLoader(536, 'BOOK_DATA', rows => {
  const encounters = rows.flatMap(row => row.encounters).sort((a,b) => a.index-b.index);
  if (!rows.some(row => row.kind === 'fixed') || !encounters.length || new Set(encounters.map(row => row.index)).size !== encounters.length) throw new Error('Incomplete encounter catalog');
  const presets = Object.freeze(encounters.map(({spec}) => Object.freeze({...spec,
    ...(spec.enemies ? {enemies: Object.freeze(spec.enemies)} : {}),
    ...(Array.isArray(spec.win) ? {win: Object.freeze(spec.win)} : {}),
    ...(Array.isArray(spec.defeat) ? {defeat: Object.freeze(spec.defeat)} : {}),
  })));
  installDemondoomRoster(rows);
  DEMONDOOM_ENCOUNTERS = presets;
});

export function prepareDemondoomEncounter(section, player, options = {}) {
  const custom = prepareCustomDemonEncounter(section, player, options.opponents);
  if (custom) return custom;
  const original = DEMONDOOM_ENCOUNTERS.find(encounter => encounter.section === Number(section));
  if (!original) throw new Error('Unknown Demondoom encounter');
  const encounter = structuredClone(original);
  let count = encounter.count ?? 1;
  if (encounter.rolledCount) {
    count = options.spawnCount;
    if (!Number.isInteger(count) || count < 2 || count > 12) throw new Error('Roll two dice for the number of Spawn');
  }
  const names = encounter.enemies ?? Array.from({length:count}, () => encounter.enemy);
  const enemies = names.map(name => demondoomEnemy(name, {
    weapon: encounter.weapon, armour: encounter.armour ?? 0, shield: !!encounter.shield,
    manualWeapon: encounter.weapon === undefined && !['regent','regina','cupric'].includes(encounter.rule),
  }));
  const character = structuredClone(player);
  if (encounter.playerWeapon !== undefined) character.weapon = encounter.playerWeapon;
  if (encounter.mode === 'doom') character.weapon = 'doombringer';
  if (encounter.mode === 'other-weapon' && character.weapon === 'doombringer') throw new Error('Select the ordinary weapon used for this route');
  if (encounter.mode === 'magic-or-unarmed') character.weapon = 'unarmed';
  if (encounter.halvePlayerStrength) character.strength /= 2;
  return {encounter,player:character,enemies,options:structuredClone(options)};
}
