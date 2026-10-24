import { createRosterLoader } from '../../roster-data.js';

export let LEGION_ENCOUNTERS = Object.freeze([]);
export let LEGION_DREAMS = Object.freeze([]);
export let LEGION_COMPANIONS = Object.freeze({});
export const loadRoster = createRosterLoader(533, 'CATALOG', rows => {
  const freeze = spec => Object.freeze({...spec, enemies: Object.freeze(spec.enemies.map(Object.freeze))});
  const catalogs = ['LEGION_ENCOUNTERS', 'LEGION_DREAMS']
    .map(name => rows.filter(row => row.catalog === name).map(row => freeze(row.spec)));
  const support = rows.find(row => row.support)?.support;
  if (catalogs.some(rows => !rows.length) || !support?.companions) throw new Error('Incomplete encounter catalogs');
  LEGION_ENCOUNTERS = Object.freeze(catalogs[0]);
  LEGION_DREAMS = Object.freeze(catalogs[1]);
  LEGION_COMPANIONS = Object.freeze(Object.fromEntries(Object.entries(support.companions).map(([key, value]) => [key, Object.freeze(value)])));
});

export const LEGION_EQUIPMENT = Object.freeze([
  'Artificial Aardvark', 'Axe', 'Apple pie', 'Book', 'Bolas', 'Cup (tin, painted white)',
  'Crown (tin, painted gold)', 'Draughtboard', 'Erector set', 'Easel', 'Fingerstall',
  'Glass rod', 'Hacksaw', 'Iron bar', 'Jumping bean (Mexican)', 'Jellybaby (British)',
  'Koala bear (stuffed)', 'Leather gauntlets', 'Miniature mounted portrait of King Arthur',
  'Nails (1 lb bag)', 'Orange paint (1 tin)', 'Pear-shaped paperweight', 'Quantum caterpillar',
  'Rope (50 foot coil)', 'Saw', 'Tripwire (almost invisible)', 'Vorpal safety pin',
  'Waterskin (full)', 'Wineskin (full)', 'Whiskeyskin (full)', 'Xylophone', 'Zip fastener (primitive)',
]);
