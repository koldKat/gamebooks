import { createRosterLoader } from '../../roster-data.js';

export const definition = Object.freeze({
  id: 757, title: 'Истинска магия', family: 'true-magic', stateKey: 'sim757', i18nPrefix: 'battlesim757',
});

export const DEFAULT_CHARACTER = Object.freeze({attack: 1, defence: 0, mobility: 6, skill: 4, stamina: 120});
export let ATTACKERS = Object.freeze([]);
export let RITUAL_ENEMY = null;
export let RITUAL_CHOICES = Object.freeze({});
export let DUEL_CHOICES = Object.freeze({});
export let SPELL_COSTS = Object.freeze({});
export const loadRoster = createRosterLoader(757, 'CATALOG', entries => {
  const ritual = entries.find(entry => entry.kind === 'ritual');
  ATTACKERS = Object.freeze(entries.find(entry => entry.kind === 'attackers').profiles.map(profile => Object.freeze(profile)));
  RITUAL_ENEMY = Object.freeze(ritual.profile);
  RITUAL_CHOICES = Object.freeze(ritual.ritualChoices);
  DUEL_CHOICES = Object.freeze(ritual.duelChoices);
  SPELL_COSTS = Object.freeze(ritual.spellCosts);
});
