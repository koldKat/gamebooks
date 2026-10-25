import { createRosterLoader } from '../../roster-data.js';

// Book identity and declarative defaults; no DOM or saved-state access.
export const definition = Object.freeze({
  "id": 829,
  "title": "Пътят на Пъдпъдъка",
  "family": "quail",
  "stateKey": "sim829",
  "i18nPrefix": "battlesim829"
});

export const BASE_HP_MAX = 12;

export const ENDURANCE_HP_BONUS = 3;

export const THROWING_ACCURACY_BONUS = 1;

export const RE_STAT_A = /А\s*:\s*(-?\d+)/;

export const RE_STAT_D = /З\s*:\s*(-?\d+)/;

export const RE_STAT_T = /Т\s*:\s*(-?\d+)/;

export let NPC_NAME_RULES = [];
export const loadRoster = createRosterLoader(829, 'NPC_NAME_RULES', entries => {
  NPC_NAME_RULES = entries.map(entry => ({ ...entry, pattern: new RegExp(entry.namePattern, entry.flags) }));
});

export function quailEnemyRules(name) {
  const matches = NPC_NAME_RULES.filter(entry => entry.pattern.test(name));
  return {
    rule: matches.find(entry => entry.kind === 'modeOverride')?.value
      ?? matches.find(entry => entry.kind === 'mode')?.value ?? 'standard',
    aura: matches.find(entry => entry.kind === 'aura')?.value ?? 0,
    lowRoll: matches.find(entry => entry.kind === 'lowRoll')?.value ?? false,
  };
}
