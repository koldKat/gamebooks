import { createRosterLoader } from '../../roster-data.js';

// Printed encounters and lookup data for Shadows of Doom.
export const definition = Object.freeze({
  id: 903, title: 'Сенки от Ада', family: 'code-cards',
  stateKey: 'sim903', i18nPrefix: 'battlesim903',
});

// + victory, - wounded, . unresolved; rows A-J, columns 1-5.
export const LOOKUP_ROWS = Object.freeze([".-...","-..+.","..-.+","..+--",".+-.-","+..-.","-.--.","..+..","++-.-",".-.-+"]);

export const SOURCE_IMAGES = Object.freeze({
  "lookup": "/api/books/903/reading-images/943bdf6bbbc1c6a0b054cdab7c8e9b5e4a22946d3752689575e948eee1a5dd5b.png",
  "legend": "/api/books/903/reading-images/d4dbf1f83143fe2c4d6fb69e3069adbc07fd074f81d87fa2d67fd68e13d000e7.png"
});

export let ENCOUNTERS = Object.freeze([]);
export const loadRoster = createRosterLoader(903, 'ENCOUNTERS', entries => {
  ENCOUNTERS = Object.freeze(entries.map(row => Object.freeze(row)));
});
