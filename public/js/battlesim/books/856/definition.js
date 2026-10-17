export const definition = Object.freeze({id: 856, title: 'Развилняване', family: 'galansia', stateKey: 'sim856', i18nPrefix: 'battlesim856'});
export const RULES_REVISION = 1;
export const RACES = ['troll', 'ogre', 'giant', 'minotaur', 'cyclops', 'ape', 'custom'];
export const PRESETS = [
  {id: 'hilga', name: 'Сополивата Хилга', race: 'troll', strength: 5, agility: 2, life: 6, maxLife: 6, damage: 2, boulder: false, bags: 2},
  {id: 'thor', name: 'Ужасния Тор', race: 'ogre', strength: 4, agility: 3, life: 5, maxLife: 5, damage: 3, boulder: true, bags: 1},
  {id: 'brindle', name: 'Бледата брада', race: 'giant', strength: 6, agility: 4, life: 4, maxLife: 4, damage: 1, boulder: true, bags: 1},
];
export const ENCOUNTERS = [
  {id: '3', section: 3, displayName: 'Тавернджията Вайд Тол', strength: 1, damage: 1, hp: 1, win: '22', flee: '22', gnome: true},
  {id: '4', section: 4, displayName: 'Орда от Йобо', strength: 2, damage: 1, hp: 8, win: '18 / 12', flee: '12'},
  {id: '5', section: 5, displayName: 'Джуджето-ковач Стъбс', strength: 3, damage: 2, hp: 4, win: '19', flee: '2'},
  {id: '9', section: 9, displayName: 'Лечителя', strength: 2, damage: 2, hp: 2, win: '17', flee: '17', gnome: true},
  {id: '14', section: 14, displayName: 'Пътешественичката Вайтара', strength: 3, damage: 2, hp: 4, win: '7', flee: '7'},
  {id: '15', section: 15, displayName: 'Статуя на Гоф', strength: 5, damage: 3, hp: 4, win: '44', flee: '17'},
  {id: '20', section: 20, displayName: 'Черноглавия Яда', strength: 4, damage: 2, hp: 4, win: '11', flee: '22', drain: true},
  {id: '26', section: 26, displayName: 'Гномски стражи', strength: 2, damage: 1, hp: 6, win: '7', flee: '7', gnome: true},
  {id: '28', section: 28, displayName: 'Гномска банда', strength: 2, damage: 1, hp: 8, win: '47', flee: '47', gnome: true},
  {id: '35', section: 35, displayName: 'Полутролът Ръфтъг', strength: 4, damage: 2, hp: 5, win: '47', flee: '47'},
  {id: '38', section: 38, displayName: 'Гномска милиция', strength: 2, damage: 1, hp: 5, win: '27', flee: '27', gnome: true},
  {id: '39', section: 39, displayName: 'Елфът-рейнджър Бука', strength: 3, damage: 1, hp: 3, win: '32', flee: '32'},
  {id: '40', section: 40, displayName: 'Алхимикът Хикобемус', strength: 2, damage: 4, hp: 3, win: '29', flee: '37', firstHit: true, fire: true, gnome: true},
  {id: '41', section: 41, displayName: 'Крал Брилиган', strength: 4, damage: 4, hp: 4, win: '36', flee: '27', gnome: true},
  {id: '43', section: 43, displayName: 'Глутница кучета', strength: 2, damage: 1, hp: 4, win: '32', flee: '32'},
  {id: '45a', section: 45, displayName: 'Стражът Сънроуз', strength: 3, damage: 1, hp: 2, win: '42', flee: '42', gnome: true},
  {id: '45b', section: 45, displayName: 'Стражът Фатбели', strength: 2, damage: 1, hp: 3, win: '42', flee: '42', gnome: true},
  {id: '45c', section: 45, displayName: 'Танцуваща мечка', strength: 3, damage: 2, hp: 5, win: '42', flee: '42'},
  {id: '49', section: 49, displayName: 'Земен демон', strength: 4, damage: 2, hp: 4, win: '12', flee: '12', demon: true},
];
export const ENEMIES = ENCOUNTERS.map(({displayName, strength, damage, hp}) => ({displayName, strength, damage, hp}));
export function encounterPreset(id) {
  const preset = ENCOUNTERS.find(row => row.id === String(id));
  if (!preset) throw new RangeError('Unknown encounter');
  return structuredClone(preset);
}
