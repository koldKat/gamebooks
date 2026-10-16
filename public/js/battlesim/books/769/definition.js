export const definition = Object.freeze({
  id: 769,
  title: 'Смъртоносен лабиринт',
  family: 'fighting-fantasy',
  stateKey: 'sim769',
  i18nPrefix: 'battlesim769',
});

export const RULES_REVISION = 1;
export const STARTING_PROVISIONS = 10;
export const PROVISIONS_HEAL = 4;

const enemy = (key, skill, stamina) => ({ key, skill, stamina });
const manticore = () => [enemy('manticore', 11, 11)];
const orcs = () => [enemy('orc1', 5, 5), enemy('orc2', 6, 4)];
const ivy = () => [enemy('ivy', 9, 9)];
const guardians = () => [enemy('guardian1', 7, 8), enemy('guardian2', 8, 8)];
const bloodbeast = () => [enemy('bloodbeast', 12, 10)];
const pitFiend = () => [enemy('pitFiend', 12, 15)];

// Entry damage is optional when the player already applied the passage's loss.
export const ENCOUNTERS = [
  { section: 6, key: 'manticore', enemies: manticore(), entryDamage: 2, win: 364 },
  { section: 39, key: 'giantFly', enemies: [enemy('giantFly', 7, 8)], win: 111, escape: { destination: 267 } },
  { section: 40, key: 'minotaur', enemies: [enemy('minotaur', 9, 9)], win: 163 },
  { section: 51, key: 'hobgoblin', enemies: [enemy('hobgoblin', 6, 5)], win: 9 },
  { section: 91, key: 'orcs', enemies: orcs(), skillModifier: -4, win: 257 },
  { section: 124, key: 'goblins', enemies: [enemy('goblin1', 5, 4), enemy('goblin2', 5, 5)], mode: 'group', win: 81 },
  { section: 130, key: 'hobgoblins', enemies: [enemy('hobgoblin1', 7, 5), enemy('hobgoblin2', 6, 5)], win: 9 },
  { section: 139, key: 'ivy', enemies: ivy(), entryDamage: 2, win: 201 },
  { section: 143, key: 'scorpion', enemies: [enemy('scorpion', 10, 10)], mode: 'two-claws', fatalEnemyAttack: 22, fatalDestination: 2, win: 163 },
  { section: 145, key: 'dwarf', enemies: [enemy('dwarf', 8, 6)], attackModifier: -2, win: 28 },
  { section: 148, key: 'dogs', enemies: [enemy('dog1', 7, 7), enemy('dog2', 7, 8)], win: 175, escape: { destination: 315, defeated: 1 } },
  { section: 151, key: 'guardians', enemies: guardians(), skillModifier: -2, win: 240 },
  { section: 166, key: 'guardians', enemies: guardians(), skillModifier: -3, win: 11 },
  { section: 172, key: 'knownBloodbeast', enemies: bloodbeast(), winningRounds: 2, win: 278 },
  { section: 189, key: 'orcs', enemies: orcs(), entryDamage: 3, win: 257 },
  { section: 196, key: 'shieldManticore', enemies: manticore(), win: 364 },
  { section: 203, key: 'pitFiend', enemies: pitFiend(), win: 258 },
  { section: 211, key: 'ivy', enemies: ivy(), win: 201 },
  { section: 225, key: 'bloodbeast', enemies: bloodbeast(), weakPoint: true, win: 97, retry: 21, failure: 116 },
  { section: 236, key: 'mimic', enemies: [enemy('mimic', 9, 8)], winningRounds: 1, win: 314 },
  { section: 245, key: 'pitFiend', enemies: pitFiend(), win: 258 },
  { section: 247, key: 'manticoreVolley', enemies: manticore(), entryDieMultiplier: 2, win: 364 },
  { section: 254, key: 'rockWorm', enemies: [enemy('rockWorm', 7, 11)], win: 76, escape: { destination: 117, rounds: 2 } },
  { section: 294, key: 'daggerBloodbeast', enemies: bloodbeast(), skillModifier: -2, weakPoint: true, win: 97, retry: 21, failure: 116 },
  { section: 302, key: 'throm', enemies: [enemy('throm', 10, 12)], win: 379 },
  { section: 312, key: 'ninja', enemies: [enemy('ninja', 11, 9)], win: 232 },
  { section: 327, key: 'mirrorDemon', enemies: [enemy('mirrorDemon', 10, 10)], enemyWinDestination: 8, win: 92 },
  { section: 331, key: 'skeleton', enemies: [enemy('skeleton', 8, 6)], win: 71 },
  { section: 349, key: 'pitFiend', enemies: pitFiend(), win: 258 },
  { section: 369, key: 'caveTroll', enemies: [enemy('caveTroll', 10, 11)], win: 288 },
  { section: 380, key: 'orcs', enemies: orcs(), win: 257 },
  { section: 387, key: 'caveman', enemies: [enemy('caveman', 7, 7)], win: 114 },
];

export const ENEMY_NAMES = {
  manticore: 'Мантикор', giantFly: 'Гигантска муха', minotaur: 'Минотавър',
  hobgoblin: 'Караконджол', hobgoblin1: 'Първи караконджол', hobgoblin2: 'Втори караконджол',
  orc1: 'Първи орк', orc2: 'Втори орк', goblin1: 'Първи таласъм', goblin2: 'Втори таласъм',
  ivy: 'Айви', scorpion: 'Гигантски скорпион', dwarf: 'Джудже',
  dog1: 'Първо стражево куче', dog2: 'Второ стражево куче',
  guardian1: 'Първи летящ страж', guardian2: 'Втори летящ страж',
  bloodbeast: 'Кървав звяр', pitFiend: 'Звяр от ямата', mimic: 'Имитатор',
  rockWorm: 'Скален червей', throm: 'Тром', ninja: 'Нинджа',
  mirrorDemon: 'Огледален демон', skeleton: 'Скелетен боец', caveTroll: 'Пещерен трол', caveman: 'Първобитен човек',
};

export function encounterFor(section) {
  return ENCOUNTERS.find(entry => entry.section === Number(section));
}
