import base from './battlesim1436.js';
const labels=Object.fromEntries(Object.entries(base).map(([key,value])=>[key.replace('battlesim1436.','battlesim1441.'),value]));
Object.assign(labels,{
  'battlesim1441.title':'Mines of Moria: Tolkien Quest',
  'battlesim1441.note':'Use your character record’s bonuses. Choose a passage, including its surprised-entry variant where relevant, or enter your own opponents. These controls never change shared inventory or equipment.',
  'battlesim1441.unmodifiedTwo':'Optional rule: picked 2 and 12 stay unmodified',
  'battlesim1441.openingNote':'Use actions only when the passage allows them. Run Away needs 8 before combat and 9 during combat. Surprise variants and the Troll encounters begin in melee.',
  'battlesim1441.otherSpells':'Travel and recovery spells follow the reader. There are no free spell charges in this adventure. The unfinished mithril coat is too small to wear. Burn Powder works only against a heat attack; record that recovery from the reader.',
  'battlesim1441.item-greyCloak':'Grey cloak (§156): DB +1 while worn',
  'battlesim1441.item-magicRing':'Starting ring (Prologue): Magical bonus +1 while worn',
  'battlesim1441.item-recurvedBow':'Whitewood bow (§298): use special arrows for +2 Missile OB',
  'battlesim1441.specialArrows':'Special arrows remaining (0–3)',
  'battlesim1441.mirenna':'Mirenna doses remaining (0–3)',
  'battlesim1441.healingNuts':'Healing nut remaining (0–1)',
  'battlesim1441.recover-mirenna':'Use Mirenna (heal 10)',
  'battlesim1441.recover-nut':'Eat nut (heal 10)',
  'battlesim1441.woundedExit':'Wounded spider: turn to §388',
  'battlesim1441.roundLimitLog':'After {limit} rounds, follow the passage’s timed outcome.',
});
export default labels;
