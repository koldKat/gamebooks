import { createRosterLoader } from '../../roster-data.js';

export const definition = Object.freeze({
  id: 723, title: 'Седемте дракона', family: 'fighting-fantasy',
  stateKey: 'sim723', i18nPrefix: 'battlesim723',
});

export const RULES_REVISION = 1;
export const INITIAL_GOLD = 20;
export const INITIAL_PROVISIONS = 2;
export const MEAL_HEALING = Object.freeze({ first: 2, later: 1 });

export let ENCOUNTERS = Object.freeze([]);
export let SUMMONED_GOBLIN = null;
export let SPELL_ENCOUNTERS = Object.freeze([]);
export const SERPENT_RULES = {};
export const loadRoster = createRosterLoader(723, 'CATALOG', entries => {
  const rules = entries.find(entry => entry.support)?.support.rules;
  if (!rules) throw new Error('Incomplete Seven Serpents settings');
  Object.assign(SERPENT_RULES, rules);
  SUMMONED_GOBLIN = Object.freeze(entries.flatMap(entry => entry.supportProfiles ?? [])
    .find(profile => profile.key === 'summonedGoblin'));
  ENCOUNTERS = Object.freeze(entries.map(entry => entry.encounter));
  SPELL_ENCOUNTERS = Object.freeze(entries.flatMap(entry => entry.variants)
    .sort((a, b) => a.order - b.order).map(variant => variant.spec));
});

export function encounterFor(section) {
  const variant = SPELL_ENCOUNTERS.find(value => value.section === section);
  const encounter = ENCOUNTERS.find(value => value.section === (variant?.base ?? section));
  if (!encounter) throw new RangeError('Unknown Seven Serpents encounter');
  return structuredClone(variant ? { ...encounter, ...variant, spell: true, sourceSection: variant.base } : encounter);
}
