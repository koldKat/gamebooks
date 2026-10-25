import { prepareCustomDemonEncounter } from './opponents.js';
import { createRosterLoader } from '../../roster-data.js';

export let ANCIENT_EVIL_ROSTER = Object.freeze({});
export let ANCIENT_EVIL_ENCOUNTERS = Object.freeze([]);
export const ANCIENT_EVIL_RULES = {};
export const loadRoster = createRosterLoader(537, 'BOOK_DATA', rows => {
  const encounters = rows.flatMap(row => row.encounters).sort((a,b) => a.index-b.index);
  const rules = rows.find(row => row.support)?.support.rules;
  if (!rows.length || !encounters.length || !rules || new Set(rows.map(row => row.key)).size !== rows.length || new Set(encounters.map(row => row.index)).size !== encounters.length) throw new Error('Incomplete Ancient Evil catalog');
  const roster = Object.freeze(Object.fromEntries(rows.map(row => [row.key, Object.freeze(row.enemy)])));
  const presets = Object.freeze(encounters.map(({spec}) => Object.freeze({...spec, enemies: Object.freeze(spec.enemies)})));
  ANCIENT_EVIL_ROSTER = roster;
  Object.assign(ANCIENT_EVIL_RULES, rules);
  ANCIENT_EVIL_ENCOUNTERS = presets;
});

export function prepareAncientEvilEncounter(section, player, options = {}) {
  const custom = prepareCustomDemonEncounter(section, player, options.opponents);
  if (custom) return custom;
  const encounter = ANCIENT_EVIL_ENCOUNTERS.find(e => e.section === String(section));
  if (!encounter) throw new Error('Unknown Ancient Evil encounter');
  const preparedPlayer = structuredClone(player);
  if (Object.hasOwn(encounter, 'playerWeapon')) preparedPlayer.weapon = encounter.rule === 'plank' ? options.playerWeapon : encounter.playerWeapon;
  if (encounter.rule === 'plank' && !Number.isFinite(preparedPlayer.weapon)) throw new Error("Supply the staff's unprinted weapon modifier");
  if (encounter.rule !== 'freya') delete preparedPlayer.freyaPoison;
  if (preparedPlayer.magicSection !== String(section)) preparedPlayer.magicArmour = 0;
  preparedPlayer.magicSection = String(section);
  const enemies = encounter.enemies.map(key => structuredClone(ANCIENT_EVIL_ROSTER[key]));
  if (encounter.enemyArmour) enemies.forEach(e => { e.armour = encounter.enemyArmour; });
  if (encounter.rule === 'plank') enemies[0].weapon = options.staffWeapon;
  return { encounter: structuredClone(encounter), player: preparedPlayer, enemies };
}
