import common from './battlesim674.js';

const labels = Object.fromEntries(Object.entries(common)
  .filter(([key]) => !key.startsWith('battlesim674.enemy.'))
  .map(([key, value]) => [key.replace('battlesim674.', ''), value]));
Object.assign(labels, {
  title: 'Battle Simulator - Cities of Gold and Glory',
  created: 'Character created: Rank 2, STAMINA 13, leather armour and 16 Shards.',
  note: 'Wounds carry between fights. Enter effective abilities, including equipment. Apply story rewards and inventory changes yourself. Nagil tests (270/362): use one Rank die with modifier +1 for the strict under-Rank rule.',
  canFlee: 'Fleeing follows this encounter’s printed damage and destination.',
  'effect.hydra': 'After victory, section 361 sends wounded characters to 377; otherwise to 17. Poison requires an immunity blessing.',
  'effect.spider': 'If wounded, lose another 1d6 STAMINA in section 277, unless protected by Maka’s blessing.',
  'effect.paladin': 'If you flee, remove the Paladin of Ravayne title. Victory does not remove it.',
  'effect.unarmed': 'Armour does not protect you. Remove your weapon bonus using the extra attack modifier.',
});
const enemies = ['Wereboar', '1st Assassin', '2nd Assassin', 'Hydra', 'Faery Wolf', 'Giant Spider',
  'Silent Knight', 'Sir Fontesque', 'Evil Knight', 'Assassin', 'Vampire', 'Warthog', 'Dragon',
  'Angry Knight', 'Samurai', 'Elf Lady', 'First Brigand', 'Second Brigand', 'Third Brigand',
  'Fourth Brigand', 'Fifth Brigand', 'Ogre', 'Brigand', 'Jeweled Serpent', 'Barrow Wight', 'Troll',
  'Enraged Bull', 'Ekushka', '1st Highwayman', '2nd Highwayman', '3rd Highwayman'];
for (const name of enemies) labels['enemy.' + name] = name;
export default Object.fromEntries(Object.entries(labels).map(([key, value]) => ['battlesim675.' + key, value]));
