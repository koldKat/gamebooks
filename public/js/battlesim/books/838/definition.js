export const definition = Object.freeze({id: 838, title: 'Островът на илюзиите', family: 'island-of-illusions', stateKey: 'sim838', i18nPrefix: 'battlesim838'});
export const RULES_REVISION = 1;
export const MODES = ['duel', 'pirates', 'octopus', 'dogs'];
export const ENEMIES = [
  {displayName: 'Стар пират', hp: 9},
  {displayName: 'Пиратски капитан', hp: 12},
  {displayName: 'Господин Смий', hp: 9},
  {displayName: 'Гигантски октопод', hp: 15},
  {displayName: 'Хелкарион Магьосникът', hp: 12},
  {displayName: 'Тапата', hp: 12},
  {displayName: 'Морско чудовище', hp: 15},
  {displayName: 'Куче', hp: 5},
];
const enemy = index => ({...ENEMIES[index]});
export const ENCOUNTERS = [
  {section: 10, displayName: 'Стар пират', mode: 'duel', hitAt: 6, enemies: [enemy(0)], destination: '18'},
  {section: 20, displayName: 'Пиратски капитан и господин Смий', mode: 'pirates', hitAt: 8, enemies: [enemy(1), enemy(2)], destination: '57'},
  {section: 22, displayName: 'Гигантски октопод', mode: 'octopus', hitAt: 5, enemies: [enemy(3)], destination: '42'},
  {section: 32, displayName: 'Хелкарион Магьосникът', mode: 'duel', hitAt: 8, enemies: [enemy(4)], destination: '17'},
  {section: 38, displayName: 'Останалият пират', mode: 'duel', hitAt: 6, enemies: [{displayName: 'Останалият пират', hp: null}], destination: '57', remainingHp: true},
  {section: 44, displayName: 'Тапата', mode: 'duel', hitAt: 7, enemies: [enemy(5)], destination: '48'},
  {section: 49, displayName: 'Морско чудовище', mode: 'duel', hitAt: 7, enemies: [enemy(6)], destination: '5'},
  {section: 54, displayName: 'Хелкарион — вълшебен меч', mode: 'duel', hitAt: 7, enemies: [enemy(4)], destination: '25'},
  {section: 59, displayName: 'Глутница кучета', mode: 'dogs', hitAt: 7, enemies: [enemy(7), enemy(7), enemy(7)], destination: '35'},
];
export function encounterPreset(section) {
  const preset = ENCOUNTERS.find(entry => entry.section === Number(section));
  if (!preset) throw new RangeError('Unknown encounter');
  return structuredClone(preset);
}
