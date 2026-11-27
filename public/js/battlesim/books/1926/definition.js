import { createRosterLoader } from '../../roster-data.js';
import { normalizeEncounter } from './combat.js';

export const definition = Object.freeze({
  id: 1926,
  title: 'Doctor Who and the Rebel’s Gamble',
  family: 'fasa-doctor-who-solo',
  stateKey: 'sim1926',
});

export const initialAttributes = Object.freeze({ strength: 8, dexterity: 8 });
export const encounters = [];
export const loadRoster = createRosterLoader(definition.id, definition.family, rows => {
  const presets = rows.map(normalizeEncounter);
  if (!presets.length || presets.some(preset => !preset.section)
      || new Set(presets.map(preset => preset.section)).size !== presets.length) throw new TypeError('Invalid Doctor Who encounter roster');
  encounters.splice(0, encounters.length, ...presets);
});
