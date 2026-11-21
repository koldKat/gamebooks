import familyLabels from './battlesim261.js';

const labels = Object.fromEntries(Object.entries(familyLabels)
  .map(([key, value]) => [key.replace('battlesim261.', 'battlesim266.'), value]));
Object.assign(labels, {
  'battlesim266.potion.strength': 'Potion of Stamina',
  'battlesim266.potion.fortune': 'Potion of Luck',
  'battlesim266.itemNote': 'Enter your current scores and select only equipment you possess. Apply permanent story changes yourself. For the Zombies, select how many remain after the printed dice roll; if none remain, there is no battle to start. This tool leaves your shared inventory and story progress unchanged.',
  'battlesim266.entryResult': 'Before combat: lose {n} Stamina and {luck} Luck; Skill change {skillChange}.',
  'battlesim266.skillLoss': 'You lose {n} Skill.',
});
export default labels;
