export const definition = Object.freeze({id: 833, title: 'Последно заплащане', family: 'unique-dice-square', stateKey: 'sim833', i18nPrefix: 'battlesim833'});
export const RULES_REVISION = 1;
export const SKILLS = ['athletics', 'precision', 'hacking', 'eloquence', 'stealth'];
export const PRICES = Object.freeze({adrenaline: 1000000, mindhack: 3000000, subcontractor: 4000000, codeine: 5000000, premonition: 6000000});
export const ENCOUNTERS = [
  {section: 3, displayName: 'Служители на корпорация „Мардук“', label: 'Последната преграда — сам', multiplier: 4, bonus: 0, hp: 100, destination: '68'},
  {section: 6, displayName: 'Охранители на Алън', label: 'Бягство от движещия се влак', multiplier: 5, bonus: 0, hp: 100, surviveRounds: 3, destination: '17'},
  {section: 7, displayName: 'Роман Пилснер', label: 'Роман в солната равнина', multiplier: 3, bonus: 0, hp: 40, destination: '63'},
  {section: 13, displayName: 'Трикоптер', label: 'Два рунда до излитането', multiplier: 6, bonus: 0, hp: 100, threshold: 80, deadline: 2, failureDestination: '57', destination: '4'},
  {section: 18, displayName: 'Антуражът на Ръш', label: 'Отказаната оферта на Ръш', multiplier: 4, bonus: 0, hp: 60, destination: '46'},
  {section: 20, displayName: 'Бръснач-бот', label: 'Бръснач-ботът в коридора', multiplier: 1, bonus: 6, hp: 40, repeatEnemyOnOne: true, destination: '81'},
  {section: 29, displayName: 'Служители на корпорация „Мардук“', label: 'Последната преграда — със съюзник', multiplier: 3, bonus: 0, hp: 50, destination: '96'},
  {section: 30, displayName: 'Антуражът на Ръш', label: 'Фосфатната скала и Ръш', multiplier: 4, bonus: 0, hp: 40, destination: '46'},
  {section: 32, displayName: 'Алън Сейнт Фройд', label: 'Два рунда преди алармата', multiplier: 2, bonus: 0, hp: 30, deadline: 2, fatalDeadline: true, destination: '45'},
  {section: 36, displayName: 'Консултант', label: 'Честният отговор на консултантката', multiplier: 5, bonus: 0, hp: 60, destination: '12'},
  {section: 38, displayName: 'Служители на корпорация „Мардук“', label: 'Гръб в гръб на ескалатора', multiplier: 4, bonus: 0, hp: 50, destination: '44'},
  {section: 39, displayName: 'Охранители на „Парадайн“', label: 'Охраната в асансьора', multiplier: 4, bonus: 0, hp: 80, destination: '1'},
  {section: 41, displayName: 'Антуражът на Алън', label: 'Три рунда на перона', multiplier: 5, bonus: 0, hp: 30, deadline: 3, failureDestination: '23', destination: '69'},
  {section: 49, displayName: 'Охранители на корпорация „Мардук“', label: 'Огън по служебния вход', multiplier: 4, bonus: 0, hp: 50, destination: '44'},
  {section: 51, displayName: 'Багер-бот', label: 'Багерът зад страничната врата', multiplier: 4, bonus: 0, hp: 100, securityChipOption: true, destination: '82'},
  {section: 56, displayName: 'Консултант', label: 'Разобличеният майордом', multiplier: 5, bonus: 0, hp: 60, destination: '12'},
  {section: 58, displayName: 'Бодигард на Алън', label: 'Оцелелите след дерайлирането', multiplier: 2, bonus: 0, hp: 40, destination: '94'},
  {section: 59, displayName: 'Мистериозна Аберация', label: 'Създанието в лабораторията', multiplier: 1, bonus: 6, hp: 60, destination: '84'},
  {section: 71, displayName: 'Банда гиганти', label: 'Гигантите пред асансьора', multiplier: 3, bonus: 0, hp: 60, destination: '43'},
  {section: 76, displayName: 'Алън Сейнт Фройд и Приятел', label: 'Кафемашината и двата револвера', multiplier: 3, bonus: 0, hp: 50, destination: '45'},
  {section: 80, displayName: 'Охранители на корпорация „Мардук“', label: 'Нападение през главния вход', multiplier: 5, bonus: 0, hp: 100, destination: '44'},
  {section: 97, displayName: 'Багер-бот', label: 'Багерът срещу Омегата', multiplier: 3, bonus: 0, hp: 100, securityChipOption: true, destination: '82'},
  {section: 98, displayName: 'Паравоенни', label: 'Престрелка на паркинга', multiplier: 4, bonus: 0, hp: 50, destination: '1'},
];
export function encounterPreset(section) {
  const row = ENCOUNTERS.find(value => value.section === Number(section));
  if (!row) throw new RangeError('Invalid encounter');
  return {...row};
}
