import { policeInteger } from './core.js';

import { createRosterLoader } from '../../roster-data.js';

// Null means absent or unclear in the source, never an assumed zero.
export let POLICE_ENCOUNTERS = [];
export const POLICE_RULES = {};
export const loadRoster = createRosterLoader(570, 'ENCOUNTERS', rows => {
  const rules = rows.find(row => row.support)?.support.rules;
  if (!rules) throw new Error('Missing Virtual Police encounter settings');
  Object.assign(POLICE_RULES, rules);
  POLICE_ENCOUNTERS = rows.map(({support, ...spec}) => spec);
});

export function policeEncounterSetup(spec, player, weapon, steelArmor = false) {
  const rules = POLICE_RULES.arena, actor = structuredClone(player);
  let strikes = spec.playerStrikes ?? 1;
  if (spec.id === rules.trollId && !rules.heavyWeapons.includes(weapon)) throw new RangeError('Troll requires axe or mace');
  if (spec.id === rules.dwarfId && (rules.heavyWeapons.includes(weapon) || steelArmor)) actor.attack = actor.defence = rules.dwarfRating;
  if (spec.section === rules.dualSection && weapon === rules.dualWeapon) { actor.defence = rules.dualDefence; strikes = rules.dualStrikes; }
  if (spec.unarmed && weapon !== 'unarmed') throw new RangeError('Weapons forbidden');
  if (spec.unarmed) actor.damage = rules.unarmedDamage;
  return {player: actor, strikes};
}

export function preparePoliceEnemy(id, { level = 1, enemy: overrides = {}, count, cannotRun = false } = {}, roll = () => Math.floor(Math.random() * 6) + 1) {
  const spec = POLICE_ENCOUNTERS.find(row => row.id === id);
  if (!spec) throw new RangeError('Unknown encounter');
  policeInteger(level, 1, 6);
  const enemy = { ...spec.enemy }, dice = [];
  const die = () => { const n = policeInteger(roll(), 1, 6); dice.push(n); return n; };
  const formula = rule => rule.base + (rule.perLevel ?? 0) * level + (rule.die ? die() : 0);
  for (const [key, rule] of Object.entries(spec.enemyGeneration ?? {})) enemy[key] = formula(rule);
  if (cannotRun) for (const key of spec.cannotRunBonus ?? []) enemy[key] += die();
  let amount = spec.countFormula ? formula(spec.countFormula) : spec.count;
  Object.assign(enemy, overrides);
  for (const key of ['attack', 'defence', 'damage', 'life']) policeInteger(enemy[key], key === 'life' ? 1 : 0);
  amount = count ?? amount;
  policeInteger(amount, 1, 1000);
  return { spec, enemy, count: amount, dice };
}
