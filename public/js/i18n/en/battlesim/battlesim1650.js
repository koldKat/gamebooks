import shared from './battlesim1649.js';

export default {
  ...Object.fromEntries(Object.entries(shared).map(([key, value]) => [key.replace('battlesim1649.', 'battlesim1650.'), value])),
  'battlesim1650.investigator_preset': 'Investigator preset',
  'battlesim1650.ready': 'Ready to act before the opponent',
  'battlesim1650.use_luck': 'Review skill rolls for Luck spending',
  'battlesim1650.luck_prompt': 'Rolled {roll} against skill {skill}. Enter the Luck to spend or resolve with zero.',
  'battlesim1650.luck_spent': '{amount} Luck spent',
  'battlesim1650.note': 'Use the book to decide what follows the encounter.',
};
