import shared from './battlesim1650.js';

export default {
  ...Object.fromEntries(Object.entries(shared).map(([key, value]) => [key.replace('battlesim1650.', 'battlesim1652.'), value])),
  'battlesim1652.investigator_preset': 'Add or reset investigator',
  'battlesim1652.unarmed': 'Unarmed',
  'battlesim1652.knife': 'Knife',
  'battlesim1652.club': 'Club',
  'battlesim1652.ammo': 'Rifle cartridges',
  'battlesim1652.sanity': 'Sanity',
  'battlesim1652.psychology': 'Psychology',
  'battlesim1652.major_wound': 'Major wound',
  'battlesim1652.remaining': 'Wolves left (0 to roll)',
  'battlesim1652.combat-weapon': 'Weapon',
  'battlesim1652.protect_party': 'Nadelmann takes this hit',
  'battlesim1652.no_assigned_enemies': 'No wolves target Nadelmann. Use the options in the book.',
  'battlesim1652.finish_opening': 'Finish opening shots',
  'battlesim1652.friendly_fire': 'Norman takes {damage} damage from the shot',
  'battlesim1652.maneuver_passed': 'Maneuver successful',
  'battlesim1652.maneuver_failed': 'Maneuver failed',
  'battlesim1652.surrender': 'Surrender',
  'battlesim1652.surrendered': 'Surrendered',
};
