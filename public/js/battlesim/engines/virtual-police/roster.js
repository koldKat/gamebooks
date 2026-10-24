import { policeInteger } from './core.js';

import { createRosterLoader } from '../../roster-data.js';

// Null means absent or unclear in the source, never an assumed zero.
export let POLICE_ENCOUNTERS = [];
export const loadRoster = createRosterLoader(570, 'ENCOUNTERS', rows => { POLICE_ENCOUNTERS = rows; });

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
