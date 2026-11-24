import shared from './battlesim1650.js';

export default {
  ...Object.fromEntries(Object.entries(shared).map(([key, value]) => [key.replace('battlesim1650.', 'battlesim1651.'), value])),
  'battlesim1651.knife': 'Knife or similar weapon',
  'battlesim1651.unarmed': 'Unarmed',
  'battlesim1651.major_wound': 'Major wound',
  'battlesim1651.constitution_check': 'Constitution check {roll} ({level})',
  'battlesim1651.retreat_counter': 'Attack during failed escape',
  'battlesim1651.stance_attack': 'Rolled {roll}: attacks',
  'battlesim1651.stance_dodge': 'Rolled {roll}: dodges',
};
