import { createRosterLoader } from '../../roster-data.js';

export let THIEVES_FIGHTS = [];
export const loadRoster = createRosterLoader(665, 'CATALOG', rows => { THIEVES_FIGHTS = rows.map(row => row.spec); });

export const THIEVES_EQUIPMENT = [
  'chainmail', 'magicShield', 'unicornShield', 'magicHelmet', 'elvenBoots',
  'cursedShield', 'cursedBrooch', 'healingBrooch', 'fireRing',
];
