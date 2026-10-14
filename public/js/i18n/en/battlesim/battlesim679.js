import common from './battlesim674.js';
const labels = Object.fromEntries(Object.entries(common).filter(([key])=>!key.startsWith('battlesim674.enemy.'))
  .map(([key,value])=>[key.replace('battlesim674.',''),value]));
Object.assign(labels,{
  title:'Battle Simulator - Lords of the Rising Sun',
  created:'Character created: Rank 6, STAMINA 27, a platinum earring, no weapon or armour.',
  note:'Enter effective abilities, including equipment. Wounds carry between fights. Apply story rewards and inventory changes yourself; use the encounter options for special combat rules.',
  simultaneous:'Strike one chosen opponent; all surviving opponents then attack.',
  target:'Attack target', light:'I have a light source', subdue:'Subdue without a weapon',
  weaponBonus:'Weapon bonus included in COMBAT', exchangedWeaponBonus:'Bonus of the weapon given to the maid',
  crimsonArrow:'Use the crimson arrow (three dice of enemy damage)',
  divineWrath:'Divine Wrath blessing', divineWrathUse:'Use Divine Wrath (one die of enemy damage)',
  diseaseBlessing:'Immunity to Disease/Poison blessing', permanentStorms:'Permanent Safety from Storms (section 159)',
  enemyDamage:'Morituri wounds already inflicted (automatic after retreat)',
  permanentWound:'Permanent wound: lose {damage} unwounded STAMINA.',
  enemyEntry:'Opponent loses {damage} STAMINA before combat.',
  diseaseBlessingUsed:'Immunity to Disease/Poison consumed to survive the spider bite.',
  winChoices:'After winning, choose section {sections} in the reader.',
  'effect.thunder':'Each enemy hit deals 1 less damage per 1000 carried Shards. Priests can bypass this fight at section 208.',
  'effect.meditation':'No armour. The imagined fight restores full STAMINA after victory or defeat.',
  'effect.morituriOutside':'Morituri retains wounds from the tomb fight; COMBAT 10 and Defence 20 outdoors.',
  'effect.morituriInside':'Retreat permits one enemy attack. Morituri’s wounds carry into the outdoor fight.',
  'effect.sanctityDefence':'Use SANCTITY as Defence, without Rank or armour.',
  'effect.magicDefence':'Use MAGIC plus Rank as Defence, without armour.',
  'effect.poisonSpider':'A bite is fatal unless you have Immunity to Disease/Poison. Protection is consumed only if wounded. Fleeing is fatal.',
  'effect.subdue':'Subduing removes your weapon bonus and adds a -1 attack penalty. Do not subtract the weapon bonus again if it is already removed from COMBAT.',
  'effect.oneDie':'Roll only one die for your attacks; the enemy rolls two dice.',
  'effect.permanentWounds':'Enemy hits permanently reduce unwounded STAMINA. Door and thrown-chair wounds remain recoverable.',
  'effect.darkness':'Attacks have a -2 penalty unless you have a light source.',
  'effect.exchangedWeapon':'Add the bonus of the exchanged weapon to the maid’s COMBAT and Defence. A paper sword avoids the fight at section 723.',
  'seaKind.passage':'Voyage to Chambara', 'seaKind.shipwreck':'Survive at sea',
});
for (const name of ['Imperial Guard','First Vampire','Second Vampire','Third Vampire','Fourth Vampire','Fifth Vampire',
  'Wacko','Thunder Beast','First Knight','Second Knight','First Spider','Second Spider','Third Spider',
  'First Flying Head','Second Flying Head','Third Flying Head','First Shrine Warden','Second Shrine Warden',
  'Third Shrine Warden','Hairy arms','Skeleton Spectre','King Tiger','Mujina','The Enemy','Dawatsu Morituri',
  'Chimerical Beast','Spider Creature','Ridiculous Rogue','Ghoul','Haniwa Warrior','Jiro','Nunobiki','Yoshio',
  'Giant','Bear','Warrior Maid','Tadachika','Big Boy','Dragon','Talanexor']) labels['enemy.'+name]=name;
export default Object.fromEntries(Object.entries(labels).map(([key,value])=>['battlesim679.'+key,value]));
