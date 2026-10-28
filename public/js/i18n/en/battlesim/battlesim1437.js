import base from './battlesim1436.js';
const labels=Object.fromEntries(Object.entries(base).map(([key,value])=>[key.replace('battlesim1436.','battlesim1437.'),value]));
Object.assign(labels,{
  'battlesim1437.title':'The Legend of Weathertop: Tolkien Quest',
  'battlesim1437.support':'Ham',
  'battlesim1437.useSupport':'Ham attacks with his sling after every other attack',
  'battlesim1437.supportPick':'Ham’s sling attack',
  'battlesim1437.otherSpells':'Travel, information and recovery spells follow the original descriptions in the reader. Calm affects one normal foe at a time.',
  'battlesim1437.item-mithrilBelt':'Mithril belt (§200): OB and DB +1',
  'battlesim1437.item-enchantedCloak':'Enchanted cloak (§532): DB and Trickery +1',
  'battlesim1437.item-purpleBerries':'Purple berries (§258): all bonuses -1 until tomorrow',
});
export default labels;
