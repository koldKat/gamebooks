import common from './battlesim674.js';

const labels = Object.fromEntries(Object.entries(common)
  .filter(([key]) => !key.startsWith('battlesim674.enemy.'))
  .map(([key, value]) => [key.replace('battlesim674.', ''), value]));
Object.assign(labels, {
  title: 'Battle Simulator - Over the Blood-Dark Sea',
  created: 'Character created: Rank 3, STAMINA 16, chain mail and 40 Shards.',
  note: 'Wounds carry between fights. Enter effective abilities, including equipment. Apply story rewards and ship losses yourself. Toggle the Three Fortunes curse while it limits ability checks to one die.',
  abilityCurse: 'Three Fortunes curse: one die for ability checks', hasCargo: 'Ship carries cargo',
  canFlee: 'Fleeing follows this encounter’s printed damage and destination.',
  'effect.calcium': 'Untick entry wounds if you have the codeword Calcium; otherwise lose 3 STAMINA before fighting.',
  'effect.unarmed': 'The sailor attacks first. Armour does not protect you; remove your weapon bonus with the extra attack modifier.',
  'seaKind.tavern': 'Tavern attack', 'seaKind.kraken': 'Kraken', 'seaKind.hydras': 'Hydra assault',
  'seaKind.ram': 'Ram the slavers', 'seaKind.overloaded': 'Overloaded evacuation',
  'seaKind.magicStorm': 'Supernatural tempest',
  copperOre: 'Carry a lump of copper ore',
  'seaKind.survival': 'Survival at sea', 'seaKind.lightning': 'Lightning storm', 'seaKind.raiders': 'Catamaran raiders',
});
const enemies = ['Assassin', 'First Mutineer', 'Second Mutineer', 'Third Mutineer', 'Vampire',
  'Serpent', 'Violet Man', 'Gorgon', 'Resentful Sailor', 'Head', 'Flying shark', 'Man',
  'First Fury', 'Second Fury', 'Third Fury', 'Ghost', 'First Scholar', 'Second Scholar', 'Third Scholar',
  'First Gorgon', 'Second Gorgon', 'Trau Miner'];
for (const name of enemies) labels['enemy.' + name] = name;
export default Object.fromEntries(Object.entries(labels).map(([key, value]) => ['battlesim676.' + key, value]));
