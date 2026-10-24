import { createRosterLoader } from '../../roster-data.js';

export let TOMB_ENCOUNTERS = Object.freeze([]);
export let TOMB_DREAMS = Object.freeze([]);
export let TOMB_COMPANION = Object.freeze({});
export const loadRoster = createRosterLoader(532, 'CATALOG', rows => {
  const freeze = spec => Object.freeze({...spec, enemies: Object.freeze(spec.enemies.map(Object.freeze))});
  const catalogs = ['TOMB_ENCOUNTERS', 'TOMB_DREAMS']
    .map(name => rows.filter(row => row.catalog === name).map(row => freeze(row.spec)));
  const support = rows.find(row => row.support)?.support;
  if (catalogs.some(rows => !rows.length) || !support?.companion) throw new Error('Incomplete encounter catalogs');
  TOMB_ENCOUNTERS = Object.freeze(catalogs[0]);
  TOMB_DREAMS = Object.freeze(catalogs[1]);
  TOMB_COMPANION = Object.freeze(support.companion);
});

export const TOMB_EQUIPMENT = Object.freeze([
  'axe', 'knife', 'blanket', 'lantern', 'bandages', 'rope', 'cookingUtensils',
  'sacks', 'oil', 'saw', 'spikes', 'tent', 'clothes', 'tinderbox', 'boots', 'waterbag', 'rations',
]);

export const TOMB_SECRET_DOORS = Object.freeze({
  54: Object.freeze([{ wall: 'north', destination: 59 }]),
  73: Object.freeze([{ wall: 'west', destination: 122, oneWay: true }]),
  84: Object.freeze([{ wall: 'north', destination: 96 },
    { wall: 'south', destination: 127 }, { wall: 'east', destination: 143 }]),
  88: Object.freeze([{ wall: 'west', destination: 93 }]),
  89: Object.freeze([{ wall: 'east', destination: 94 }]),
  96: Object.freeze([{ wall: 'north', destination: 87 }]),
  195: Object.freeze([{ wall: 'west', destination: 211 }]),
});
