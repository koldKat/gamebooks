import familyLabels from './battlesim261.js';

const labels = Object.fromEntries(Object.entries(familyLabels)
  .map(([key, value]) => [key.replace('battlesim261.', 'battlesim265.'), value]));
Object.assign(labels, {
  'battlesim265.target': 'Attack target',
  'battlesim265.newCharacter': 'New character',
  'battlesim265.resetConfirm': 'Start a new character with the printed scores? Current simulator scores will be replaced. Your battle history stays.',
  'battlesim265.itemNote': 'Enter your current scores. New characters start at Skill 6, Stamina 12 and Luck 6. Apply story changes yourself; this tool leaves your shared inventory and story progress unchanged.',
  'battlesim265.entryResult': 'Before combat: lose {n} Stamina and {luck} Luck; Skill change {skillChange}.',
});
export default labels;
