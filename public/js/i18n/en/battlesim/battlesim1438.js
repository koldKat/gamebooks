import base from './battlesim1436.js';
const labels=Object.fromEntries(Object.entries(base).map(([key,value])=>[key.replace('battlesim1436.','battlesim1438.'),value]));
Object.assign(labels,{
  'battlesim1438.title':'Rescue in Mirkwood: Tolkien Quest',
  'battlesim1438.useSupport':'Use the supporting archers allowed by this passage',
  'battlesim1438.supportPick':'Supporting archer’s attack',
  'battlesim1438.sourceCount':'Orcs remaining (follow the passage)',
  'battlesim1438.includeGuard':'The surviving cave guard joins this fight',
  'battlesim1438.sourceAction':'Optional source item',
  'battlesim1438.sourceAction.none':'Fight without using an item',
  'battlesim1438.endurancePick':'Each Endurance pick (foes roll separately)',
  'battlesim1438.nightPenalty':'Human adventuring at night: halve bonuses (round down)',
  'battlesim1438.enduranceLog':'{name}: Endurance {value}',
  'battlesim1438.trialFailedLog':'The alarm sounds after {defeated} sleeping Orcs defeated.',
  'battlesim1438.otherSpells':'Travel, information and recovery spells follow the reader. Calm affects one normal foe at a time.',
  'battlesim1438.item-owl':'Owl companion (§230/373): OB +1',
  'battlesim1438.item-elvishSword':'Elvish short sword (§197): Melee OB +1',
  'battlesim1438.item-weightlessStaff':'Weightless quarterstaff (§202): Magical +1',
  'battlesim1438.item-banditSword':'Sword (§259): Melee OB +1',
  'battlesim1438.item-magicAxe':'Axe (§317): Melee OB +1, normal axe damage +2',
  'battlesim1438.item-magicHelmet':'Helmet (§384): DB +1',
  'battlesim1438.item-silkenShirt':'Silken shirt (§448): DB +2',
});
export default labels;
