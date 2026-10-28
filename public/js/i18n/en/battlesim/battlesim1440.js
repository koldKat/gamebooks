import base from './battlesim1436.js';
const labels=Object.fromEntries(Object.entries(base).map(([key,value])=>[key.replace('battlesim1436.','battlesim1440.'),value]));
export default {...labels,
  'battlesim1440.title':'Treason at Helm’s Deep: Tolkien Quest',
  'battlesim1440.strength':'Current Strength (St)',
  'battlesim1440.strengthState':'Strength: {strength}',
  'battlesim1440.strengthDrainLog':'The Skeleton drains Strength. Remaining: {strength}.',
  'battlesim1440.entryHealingLog':'Recover {raw} damage before the fight. Damage now: {damage}.',
  'battlesim1440.deviceCharges':'Fire Bolt staff charges (0–5)',
  'battlesim1440.unmodifiedTwo':'Optional rule: picked 2 and 12 stay unmodified',
  'battlesim1440.note':'Use the bonuses on your character record. Choose a passage preset or enter your own opponent. Source items and Strength here belong only to this simulator.',
  'battlesim1440.openingNote':'Before fighting, Run Away succeeds on 8 or more; failure leaves you surprised. During combat you need 9 or more.',
  'battlesim1440.otherSpells':'The staff supplies Fire Bolt while charges remain. Other spell costs still apply. Record the Skeleton’s Strength loss until the adventure ends; recovery and information spells follow the reader.',
  'battlesim1440.item-talisman':'Talisman (§206): DB +2 while worn',
  'battlesim1440.item-enchantedSpear':'Enchanted spear (§222): double numeric damage when using the spear',
};
