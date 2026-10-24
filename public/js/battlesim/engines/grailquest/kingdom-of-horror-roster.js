import { createRosterLoader } from '../../roster-data.js';

export let KINGDOM_ENCOUNTERS = Object.freeze([]);
export let KINGDOM_DREAMS = Object.freeze([]);
export let KINGDOM_SUPPORT = Object.freeze({});
export const loadRoster = createRosterLoader(530, 'CATALOG', rows => {
  const freeze = spec => Object.freeze({...spec, enemies: Object.freeze(spec.enemies.map(Object.freeze))});
  const catalogs = ['KINGDOM_ENCOUNTERS', 'KINGDOM_DREAMS']
    .map(name => rows.filter(row => row.catalog === name).map(row => freeze(row.spec)));
  const support = rows.find(row => row.support)?.support;
  if (catalogs.some(rows => !rows.length) || !support?.gnurlbash) throw new Error('Incomplete encounter catalogs');
  KINGDOM_ENCOUNTERS = Object.freeze(catalogs[0]);
  KINGDOM_DREAMS = Object.freeze(catalogs[1]);
  KINGDOM_SUPPORT = Object.freeze(support);
});

export const KINGDOM_MAGIC_STOCK = Object.freeze([
  ['pointingBone', 1], ['neckInstructions', 1], ['speedBoots', 2], ['brokenBall', 1],
  ['deathbell', 1], ['deathMask', 1], ['eyeOfHorus', 1], ['ropeInstructions', 1],
  ['laughingGlobe', 2], ['levitationTablet', 1], ['lightningRod', 1], ['lightningWand', 1],
  ['luckyCoin', 1], ['fireball', 2], ['friendshipMask', 1], ['destructionOrb', 1],
  ['decoder', 1], ['psionicHelm', 1], ['bubblePipe', 1], ['resurrectionWand', 1],
  ['sanctuaryScroll', 1], ['seekerNeedle', 1], ['sleepGlobe', 3], ['smarmOil', 2],
  ['vorpalSword', 1], ['xerox', 1],
].map(([id, stock], index) => Object.freeze({ id, stock, number: index + 1 })));

export const KINGDOM_EQUIPMENT = Object.freeze([
  'axe', 'bandages', 'boots', 'breastplate', 'falseBeard', 'hammer', 'harp',
  'healingPotion', 'healingSalve', 'knife', 'lantern', 'lute', 'lyre', 'mallet',
  'fairyMap', 'nails', 'parchment', 'panPipes', 'powderedInk', 'pumpkin', 'quartz',
  'quill', 'rations', 'rope', 'grain', 'sandals', 'saw', 'sheepskin', 'spikes',
  'string', 'tinderbox', 'waterbag', 'plank',
]);

export const KINGDOM_STORY_MAGIC = Object.freeze(['thunderbolt', 'kangling', 'dragonfirePills']);
