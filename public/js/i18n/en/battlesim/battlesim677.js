import common from './battlesim674.js';
const labels = Object.fromEntries(Object.entries(common).filter(([key]) => !key.startsWith('battlesim674.enemy.'))
  .map(([key, value]) => [key.replace('battlesim674.', ''), value]));
Object.assign(labels, {
  title: 'Battle Simulator - The Plains of Howling Darkness',
  created: 'Character created: Rank 4, STAMINA 20, chain mail and 65 Shards.',
  note: 'Wounds carry between fights. Enter effective abilities, including equipment. Apply story rewards, poison, disease and ship losses yourself. Arena spell choices are resolved in the reader.',
  'effect.immortal': 'Kaschuf is still immortal. Follow section 304 after winning; escaping there costs one die of STAMINA.',
  'effect.wolfpack': 'After winning, take a wolf pelt and choose your route in section 147.',
  'effect.daggers': 'The first wound ends this encounter. If still alive, continue at section 184.',
  'effect.snake': 'If wounded, reduce CHARISMA and COMBAT by 1 until the poison is cured.',
  'effect.blight': 'If wounded, the Blight of Nagil reduces CHARISMA and COMBAT by 1 until cured.',
  'seaKind.shipwreck': 'Survive the shipwreck',
});
const enemies = ['Faery Hound', 'Vampire', 'Manbeast', 'Kaschuf', 'Nomad', 'Wolfpack', 'Avar Hordeth',
  'Redcaps', 'Grey Worm', 'Luroc Bans', 'Three Cutthroats', 'Sea Spider', 'Three Thugs', 'She-devil',
  'Hooded Men', 'Young Rukh', 'Sir Leo', 'Snake Demon', 'Storm Demon', 'Kelpie', 'Wrecker',
  'Blue Cap', 'Mugger', 'Rabid Wolf', 'Undead Warriors'];
for (const name of enemies) labels['enemy.' + name] = name;
export default Object.fromEntries(Object.entries(labels).map(([key, value]) => ['battlesim677.' + key, value]));
