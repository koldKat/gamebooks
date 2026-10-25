import { createRosterLoader } from '../../roster-data.js';

export let REALM_ENCOUNTERS = Object.freeze([]);
export let REALM_DREAMS = Object.freeze([]);
export let REALM_COMPANION = Object.freeze({});
export const REALM_RULES = {};
export const loadRoster = createRosterLoader(531, 'CATALOG', rows => {
  const freeze = spec => Object.freeze({...spec, enemies: Object.freeze(spec.enemies.map(Object.freeze))});
  const catalogs = ['REALM_ENCOUNTERS', 'REALM_DREAMS']
    .map(name => rows.filter(row => row.catalog === name).map(row => freeze(row.spec)));
  const support = rows.find(row => row.support)?.support;
  if (catalogs.some(rows => !rows.length) || !support?.companion || !support.rules) throw new Error('Incomplete encounter catalogs');
  Object.assign(REALM_RULES, support.rules);
  REALM_ENCOUNTERS = Object.freeze(catalogs[0]);
  REALM_DREAMS = Object.freeze(catalogs[1]);
  REALM_COMPANION = Object.freeze(support.companion);
});

export const REALM_EQUIPMENT = Object.freeze([
  'axe', 'antFarm', 'boots', 'cobwebSpray', 'fishingRod', 'glitterPowder',
  'hammer', 'handkerchief', 'knife', 'mallet', 'rope', 'rations', 'razor',
  'salt', 'saw', 'slideTrombone', 'spikes', 'stake', 'talkingHead', 'toothbrush', 'twine',
]);

export const REALM_ASTRAL_KEY = Object.freeze({2:120,3:122,4:124,5:127,7:129,8:132,10:137,11:143});
