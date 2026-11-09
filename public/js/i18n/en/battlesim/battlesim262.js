import familyLabels from './battlesim261.js';
const labels = Object.fromEntries(Object.entries(familyLabels).map(([key,value])=>[key.replace('battlesim261.','battlesim262.'),value]));
Object.assign(labels,{
  'battlesim262.ordinarySword':'Unarmed',
  'battlesim262.poisonBattlesLeft':'Poisoned stiletto battles left',
  'battlesim262.deathstoneUses':'Deathstone uses left',
  'battlesim262.projectile':'Use Deathstone',
  'battlesim262.itemNote':'Enter current scores and item uses. Select the weapon you are actually carrying. Apply story spells and the Hero’s Medallion to your scores yourself; shared inventory and story progress stay unchanged.',
});
export default labels;
