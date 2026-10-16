export const definition = Object.freeze({
  id: 773,
  title: 'Изпитание за шампиони',
  family: 'fighting-fantasy',
  stateKey: 'sim773',
  i18nPrefix: 'battlesim773',
});

export const RULES_REVISION = 1;
const enemy = (name, skill, stamina) => ({ name, displayName: name, skill, stamina });
const encounter = (section, name, skill, stamina, win, rules = {}) => ({
  section, name, enemies: [enemy(name, skill, stamina)], win, ...rules,
});
const orcs = () => [enemy('Първи орк', 6, 5), enemy('Втори орк', 6, 6)];

export const ENCOUNTERS = [
  encounter(29, 'Кокалест демон', 10, 8, 326, { fear: true }),
  encounter(56, 'Кокалотрошач', 9, 10, 268, { fatalLostRound: 343 }),
  encounter(61, 'Южняк', 10, 10, 261, { entryHealing: { stamina: 4 } }),
  encounter(63, 'Кокалест демон: талисман', 10, 8, 326, { entryHealing: { luck: 1 } }),
  encounter(73, 'Роб', 9, 8, 196),
  encounter(76, 'Орк мутант', 7, 7, 341),
  encounter(79, 'Трол от Височината', 9, 10, 65),
  encounter(80, 'Кралицата с Разложено Лице', 9, 9, 277, { entryDamage: 4, skillModifier: -3 }),
  encounter(100, 'Бродещият', 9, 9, 19),
  encounter(113, 'Човек от Изтока', 10, 8, 237),
  encounter(118, 'Гигантски паяк', 7, 8, 348, { roundLimit: 5, pauseAt: 64, resumeAt: 108 }),
  encounter(120, 'Борещият се роб', 8, 8, 61),
  encounter(127, 'Огнен демон', 10, 10, 303, { fire: 'demon' }),
  { section: 139, name: 'Двамата орки', enemies: orcs(), win: 295 },
  { section: 146, name: 'Петте плъха', enemies: [3, 2, 3, 3, 4].map((skill, index) =>
    enemy('Плъх ' + (index + 1), skill, 2)), pauseOnLoss: 165, resumeAt: 389, win: 18 },
  encounter(154, 'Гигантска стоножка', 9, 7, 2),
  encounter(176, 'Огнен дявол', 9, 4, 127),
  { section: 186, name: 'Прилепите-вампири', enemies: [enemy('Първи прилеп-вампир', 5, 5),
    enemy('Втори прилеп-вампир', 5, 4)], drainingCompanion: true, win: 142 },
  encounter(188, 'Лорд Карнъс', 10, 10, 400, { entryHealing: { skill: 2, stamina: 6 } }),
  { section: 192, name: 'Двамата орки: рана от кама', enemies: orcs(), entryDamage: 2, win: 295 },
  encounter(211, 'Самурай', 10, 9, 354),
  encounter(219, 'Леден нокът', 10, 11, 252, { skillModifier: -1 }),
  encounter(234, 'Ранен кървав червей', 4, 4, 123, { bleedOnLoss: true }),
  encounter(247, 'Хаотичен шампион', 11, 12, 180),
  { section: 259, name: 'Четиримата Зороа', enemies: [enemy('Първи Зороа боец', 10, 10),
    enemy('Втори Зороа боец', 9, 11), enemy('Трети Зороа боец', 10, 11),
    enemy('Четвърти Зороа боец', 10, 10)], selectableGroupMode: true, win: 14 },
  encounter(270, 'Гигантска стоножка: меч', 9, 7, 2),
  encounter(279, 'Зъбльо', 6, 6, 339),
  encounter(294, 'Двуглаво куче', 6, 5, 217, { twoHeads: true }),
  encounter(306, 'Език', 5, 6, 85),
  encounter(311, 'Идол', 9, 6, 262, { requiresMagicSword: true }),
  encounter(325, 'Кървав червей', 4, 6, 123, { entryDamage: 2, bleeding: true }),
  encounter(329, 'Скелетен крал', 9, 7, 209, { requiresHammer: true }),
  encounter(340, 'Зороа-воин', 10, 11, 170, { skillModifier: -1 }),
  encounter(349, 'Роб: борба в пясъка', 9, 8, 196),
  encounter(356, 'Пипалус', 8, 12, 236, { drowning: true }),
  encounter(369, 'Дърпане на въже', 7, 1, 352, { tugOfWar: true, failure: 99 }),
  encounter(374, 'Адско куче', 7, 6, 52, { fire: 'hound' }),
  encounter(383, 'Ранен хаотичен шампион', 11, 10, 180),
];

export function encounterFor(section) {
  return ENCOUNTERS.find(entry => entry.section === Number(section));
}
