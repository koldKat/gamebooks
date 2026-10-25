import { createRosterLoader } from '../../roster-data.js';

export let THIEVES_FIGHTS = [];
export const THIEVES_RULES = {};
export const loadRoster = createRosterLoader(665, 'CATALOG', rows => {
  const rules = rows.find(row => row.support?.rules)?.support.rules;
  if (!rules) throw new Error('Missing City of Thieves settings');
  Object.assign(THIEVES_RULES, rules);
  THIEVES_FIGHTS = rows.map(row => row.spec);
});
export const thievesHasRule = section => THIEVES_RULES.ruleSections.includes(section);
export const thievesRandomEncounter = () => THIEVES_FIGHTS.find(entry => entry.randomEnemy);

export const THIEVES_EQUIPMENT = [
  'chainmail', 'magicShield', 'unicornShield', 'magicHelmet', 'elvenBoots',
  'cursedShield', 'cursedBrooch', 'healingBrooch', 'fireRing',
];
