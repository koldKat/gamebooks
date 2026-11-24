import shared from './battlesim1652.js';

export default {
  ...Object.fromEntries(Object.entries(shared).map(([key, value]) => [key.replace('battlesim1652.', 'battlesim1655.'), value])),
  'battlesim1655.title': 'Alone Against the Wendigo',
  'battlesim1655.unarmed': 'Punch',
  'battlesim1655.fight': 'Parry',
  'battlesim1655.level_4': 'Impale',
  'battlesim1655.remaining': 'Unwounded wolves (0 to roll)',
  'battlesim1655.knifeSkill': 'Knife skill',
  'battlesim1655.hatchetSkill': 'Hatchet skill',
  'battlesim1655.clubSkill': 'Club skill',
  'battlesim1655.kick': 'Kick',
  'battlesim1655.headButt': 'Head butt',
  'battlesim1655.kickSkill': 'Kick skill',
  'battlesim1655.headButtSkill': 'Head butt skill',
  'battlesim1655.grapple': 'Grapple skill',
  'battlesim1655.starting_damage': 'Starting damage: {damage}',
  'battlesim1655.damage-goal': '{amount} damage still needed',
  'battlesim1655.hit-count': '{amount} hits still needed',
  'battlesim1655.volley_result': '{hits} hit · {remaining} unwounded · Retreat roll {roll}',
  'battlesim1655.note': 'Resolve the fight here and follow the outcome in the book.',
};
