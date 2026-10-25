import { createRosterLoader } from '../roster-data.js';

export let SHADOWS_ENCOUNTERS = Object.freeze([]);
export let SHADOWS_CHECKS = Object.freeze([]);
export const SHADOWS_RULES = {};

export const loadRoster = createRosterLoader(539, 'ENCOUNTERS', rows => {
  const support = rows.find(row => row.support)?.support;
  if (!support?.checks?.length || !support.rules) throw new Error('Missing Shadows encounter settings');
  SHADOWS_ENCOUNTERS = Object.freeze(rows.map(({support, ...spec}) => Object.freeze({
    ...spec, enemies: Object.freeze(spec.enemies.map(Object.freeze)),
  })));
  SHADOWS_CHECKS = Object.freeze(support.checks.map(Object.freeze));
  Object.assign(SHADOWS_RULES, support.rules);
});
