// Identify the book and load its reviewed encounter catalog from the database.
import { createRosterLoader } from '../../roster-data.js';

export const definition = Object.freeze({ id: 1649, title: 'Alone Against Nyarlathotep',
  family: 'cthulhu-solo', stateKey: 'sim1649', i18nPrefix: 'battlesim1649' });
export let ENCOUNTERS = [];
export const loadRoster = createRosterLoader(1649, 'CTHULHU_ENCOUNTERS', entries => {
  if (!entries.length || entries.some(e => !e.id || !Array.isArray(e.enemies))) throw new Error('Incomplete encounter catalog');
  ENCOUNTERS = entries;
});
