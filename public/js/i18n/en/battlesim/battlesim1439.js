import base from './battlesim1436.js';
const labels=Object.fromEntries(Object.entries(base).map(([key,value])=>[key.replace('battlesim1436.','battlesim1439.'),value]));
Object.assign(labels,{
  'battlesim1439.title':'A Spy in Isengard: Tolkien Quest',
  'battlesim1439.note':'Use the bonuses on your character record. Choose a book encounter or enter your own opponents. Where Carnil fights the leader, select just one of the other Orcs.',
  'battlesim1439.unmodifiedTwo':'Optional rule: picked 2 and 12 stay unmodified',
  'battlesim1439.openingNote':'Run Away and Sneak Away need 8 or more before combat; Steal & Take needs 9. Sneak actions require an unaware foe. In Advanced play, Run Past and Sneak Past subtract 2. During combat, Run Away needs 9.',
  'battlesim1439.openingAction.runPast':'Run Past',
  'battlesim1439.openingAction.sneakPast':'Sneak Past',
  'battlesim1439.deviceCharges':'Ring of Fire: casts left today (0–1)',
  'battlesim1439.luckCharges':'Luck amulet: casts remaining (0–3)',
  'battlesim1439.sourceRunAwayChoice':'The current passage offers Run Away (required for Calm)',
  'battlesim1439.otherSpells':'The Fire Ring supplies one free Fire Bolt per day; set its counter to zero if the ring is lost. The amulet supplies three free Luck casts in total. Other spells, travel and recovery follow the reader. Advanced Run Away and Sneak Away lead in a random direction; Run Past and Sneak Past preserve your chosen direction.',
  'battlesim1439.item-mithril':'Mithril mail (§372): DB +3, no penalties; replaces the armour selection',
  'battlesim1439.item-enchantedSword':'Enchanted sword (§164): sword OB +2',
  'battlesim1439.item-carnilSword':'Carnil’s sword (§115/461): sword OB +2',
  'battlesim1439.item-carnilBow':'Carnil’s bow (§115/461): bow OB +1',
  'battlesim1439.item-carnilCloak':'Carnil’s cloak (§115/461): Sneak Away +1',
});
export default labels;
