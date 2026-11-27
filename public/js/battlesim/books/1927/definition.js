import { createRosterLoader } from '../../roster-data.js';
import { normalizeEncounter } from './combat.js';

export const definition = Object.freeze({
  id: 1927,
  title: 'Doctor Who and the Vortex Crystal',
  family: 'fasa-doctor-who-vortex',
  stateKey: 'sim1927',
});

export const initialAttributes = Object.freeze({ strength: 8, endurance: 8, dexterity: 8, charisma: 9, mentality: 10, brawling: 8 });
export const encounters = [];
export const loadRoster = createRosterLoader(definition.id, definition.family, rows => {
  const keys = new Set(rows.map(row => row.key));
  if (!rows.length || keys.size !== rows.length || rows.some(row => !/^[1-5]\d\d(?:-[a-z]+)?$/.test(row.key) || !row.section || !row.label)) {
    throw new TypeError('Invalid Vortex Crystal roster');
  }
  encounters.splice(0, encounters.length, ...rows.map(row => ({ ...normalizeEncounter(row), label: row.label, note: row.note })));
});
