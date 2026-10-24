import { createRosterLoader } from '../../roster-data.js';

export let SIX_ACTIONS_FIGHTS = Object.freeze([]);
export let SIX_ACTIONS_CHECKS = Object.freeze([]);
export const loadRoster = createRosterLoader(658, 'FIGHTS', rows => {
  const checks = rows.find(row => row.checks)?.checks;
  if (!rows.length || !checks?.length) throw new Error('Incomplete Six Actions catalog');
  SIX_ACTIONS_FIGHTS = Object.freeze(rows.map(row => Object.freeze(row.fight)));
  SIX_ACTIONS_CHECKS = Object.freeze(checks.map(Object.freeze));
});

export const SIX_ACTIONS_WEAPONS = Object.freeze({ hk: 3, uzi: 2, bomb: 2, grenade: 2, pistol: 1, knife: 1 });
