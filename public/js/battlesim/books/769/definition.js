import { createRosterLoader } from '../../roster-data.js';

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

export let ENCOUNTERS = [];
export const DUNGEON_RULES = {};
export const loadRoster = createRosterLoader(769, 'ENCOUNTERS', entries => {
  const rules = entries.find(entry => entry.support)?.support.rules;
  if (!rules) throw new Error('Incomplete Deathtrap settings');
  Object.assign(DUNGEON_RULES, rules);
  ENCOUNTERS = entries.map(({support,...entry}) => entry);
});

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
