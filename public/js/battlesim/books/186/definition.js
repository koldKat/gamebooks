import { createRosterLoader } from '../../roster-data.js';

// Book identity and declarative defaults; no DOM or saved-state access.
export const definition = Object.freeze({
  "id": 186,
  "title": "Starship Traveller",
  "family": "fighting-fantasy",
  "stateKey": "sim186",
  "i18nPrefix": "battlesim186"
});

export const CREW = [
  ['captain',     'Captain',             false],
  ['science',     'Science Officer',     true],
  ['medical',     'Medical Officer',     true],
  ['engineering', 'Engineering Officer', true],
  ['security',    'Security Officer',    false],
  ['guard1',      'Security Guard 1',    false],
  ['guard2',      'Security Guard 2',    false],
];

export const OFFICER_PENALTY = 3;

export const HELMET_SKILL_BONUS = 1;

export const NORMAL_DMG = 2;

export const STARSHIP_DAMAGE_RULES = {};
export const loadRoster = createRosterLoader(186, 'DAMAGE_RULES', entries => {
  if (entries.length !== 1 || !entries[0].nerve || !entries[0].armor) throw new Error('Incomplete Starship damage settings');
  Object.assign(STARSHIP_DAMAGE_RULES, entries[0]);
});
