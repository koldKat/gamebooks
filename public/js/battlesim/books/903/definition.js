import { createRosterLoader } from '../../roster-data.js';

// Printed encounters and lookup data for Shadows of Doom.
export const definition = Object.freeze({
  id: 903, title: 'Сенки от Ада', family: 'code-cards',
  stateKey: 'sim903', i18nPrefix: 'battlesim903',
});

// + victory, - wounded, . unresolved; rows A-J, columns 1-5.
export const LOOKUP_ROWS = Object.freeze([".-...","-..+.","..-.+","..+--",".+-.-","+..-.","-.--.","..+..","++-.-",".-.-+"]);

export const SOURCE_IMAGES = Object.freeze({
  "lookup": "/api/books/903/reading-images/3b3518d3d2fb307517945d6a11f18b0a119c3e2f02e230ce4ce6a0af224adbb2.jpg",
  "legend": "/api/books/903/reading-images/59d8fe9632825c488ac0682c5b0e5a439f8220bba8a74289e69158fa9c3ebae5.png"
});

export let ENCOUNTERS = Object.freeze([]);
export const loadRoster = createRosterLoader(903, 'ENCOUNTERS', entries => {
  ENCOUNTERS = Object.freeze(entries.map(row => Object.freeze(row)));
});
