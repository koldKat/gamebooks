import { createRosterLoader } from '../../roster-data.js';
import { tetivaEncounter as resolveTetivaEncounter } from '../../engines/tetiva.js';

// Book identity and declarative defaults; no DOM or saved-state access.
export const definition = Object.freeze({
  "id": 753,
  "title": "Вълшебната тетива",
  "family": "tetiva",
  "stateKey": "sim753",
  "i18nPrefix": "battlesim753"
});

export const DAMAGE_CAP = 24;

export let ENCOUNTER_RULES = {};
export const loadRoster = createRosterLoader(753, 'ENCOUNTER_RULES', entries => {
  ENCOUNTER_RULES = Object.fromEntries(entries.map(entry => [entry.section, entry.effects]));
});
export function tetivaEncounter(section) {
  return resolveTetivaEncounter(section, ENCOUNTER_RULES);
}
