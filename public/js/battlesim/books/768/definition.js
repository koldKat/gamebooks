import { createRosterLoader } from '../../roster-data.js';

export const definition = Object.freeze({
  id: 768, title: 'Пътят на дракона', family: 'dragon-road',
  stateKey: 'sim768', i18nPrefix: 'battlesim768',
});

// LIFE and combat mastery have no reliable starting formula in this source.
export const CHARACTER_FIELDS = Object.freeze([
  'attack', 'defence', 'shooting', 'life', 'mastery', 'speed',
  'magicStrength', 'magicEnergy', 'magicResistance',
]);

export let WARRIORS = Object.freeze([]);
export let NECROMOR = null;
export let IRON_DRAGON = null;
export const loadRoster = createRosterLoader(768, 'CATALOG', entries => {
  WARRIORS = Object.freeze(entries.filter(entry => entry.kind === 'warrior').map(entry => entry.profile));
  NECROMOR = Object.freeze(entries.find(entry => entry.kind === 'necromor').profile);
  const dragon = entries.find(entry => entry.kind === 'dragon').profile;
  dragon.attacks = Object.freeze(dragon.attacks.map(attack => Object.freeze(attack)));
  IRON_DRAGON = Object.freeze(dragon);
});

export const TABLE_IMAGES = Object.freeze({
  simple: '/api/books/768/reading-images/591e394ffd6ae08358f843178b3cd5c63d403f18298beaef6fa5946d67acf5b9.png',
  hits: '/api/books/768/reading-images/041240bf4cbf8bf7fe2f51cb082f25b6c852ad391b575ac140cc91ff5d69c366.png',
  damage: '/api/books/768/reading-images/b676a7e9a72973256e15d81f6a56ba10b0edbd930a36d4904bf020d4f88174d3.png',
});
