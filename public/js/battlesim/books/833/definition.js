import { createRosterLoader } from '../../roster-data.js';

export const definition = Object.freeze({id: 833, title: 'Последно заплащане', family: 'unique-dice-square', stateKey: 'sim833', i18nPrefix: 'battlesim833'});
export const RULES_REVISION = 1;
export const SKILLS = ['athletics', 'precision', 'hacking', 'eloquence', 'stealth'];
export const PRICES = Object.freeze({adrenaline: 1000000, mindhack: 3000000, subcontractor: 4000000, codeine: 5000000, premonition: 6000000});
export let ENCOUNTERS = [];
export const loadRoster = createRosterLoader(833, 'CATALOG', entries => {
  ENCOUNTERS = entries.flatMap(entry => entry.variants).sort((a, b) => a.order - b.order).map(variant => variant.spec);
});
export function encounterPreset(section) {
  const row = ENCOUNTERS.find(value => value.section === Number(section));
  if (!row) throw new RangeError('Invalid encounter');
  return {...row};
}
