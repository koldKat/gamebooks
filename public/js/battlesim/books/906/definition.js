export const definition = Object.freeze({
  id: 906, title: 'Звездолетът Скитник', family: 'starship-traveller',
  stateKey: 'sim906', i18nPrefix: 'battlesim906',
});

export const CREW = ['captain', 'science', 'medical', 'engineering', 'security', 'guard1', 'guard2'];
export const OFFICERS = ['science', 'medical', 'engineering'];
export const COMPANIONS = ['macom', 'eagle'];
const enemy = (displayName, skill, stamina = 1) => ({displayName, skill, stamina});
const guards = (...scores) => scores.map(([skill, stamina], i) => enemy(['Първи страж', 'Втори страж', 'Трети страж'][i], skill, stamina));
const encounter = (section, name, mode, enemies, options = {}) => ({section, name, mode, enemies, ...options});

export const ENCOUNTERS = [
  encounter(22, 'Скуини', 'hand', [enemy('Първи Скуин', 8, 16), enemy('Втори Скуин', 7, 18), enemy('Трети Скуин', 8, 18)], {passive: true, killOne: true, destination: 311}),
  encounter(43, 'Стражите и парализиращите пръчки', 'hand', guards([7, 8], [7, 7], [7, 8]), {nerve: true, destination: 301, surrender: 239}),
  encounter(49, 'Стражът с шлем', 'hand', guards([11, 14]), {doubleAttack: 'strongest', enemyFloor: 5, destination: 147, surrender: 309}),
  encounter(54, 'Лаф и Териалците', 'phaser', [enemy('Лаф', 6), enemy('Първи Териалец', 7), enemy('Втори Териалец', 5)], {enemyFirst: true, destination: 120}),
  encounter(65, 'Боят в бара', 'hand', CREW.map((_, i) => enemy('Противник от бара ' + (i + 1), 7, 6)), {party: CREW, pairedCrew: true, destination: 242}),
  encounter(95, 'Двамата пазачи', 'hand', guards([7, 6], [7, 7]), {dividedCaptain: true, destination: 76, surrender: 63}),
  encounter(102, 'Обезумелият член на екипажа', 'hand', [enemy('Обезумял член на екипажа', 10, 18)], {madCrew: true, restraint: true}),
  encounter(103, 'Стражите на Фиорал', 'hand', guards([8, 10], [7, 9], [7, 10]), {destination: 150}),
  encounter(122, 'Малинитците', 'phaser', [enemy('Първи Малинитец', 8), enemy('Втори Малинитец', 7), enemy('Трети Малинитец', 9)], {enemyFirst: true, closingRange: true, destination: 225, surrender: 37}),
  encounter(131, 'Стражите пред двореца', 'phaser', guards([7, 1], [6, 1], [7, 1]), {playerRange: 1, enemyRange: 2, randomTargets: true, destination: 91}),
  encounter(135, 'Вражеският кораб', 'ship', [enemy('Вражески кораб', 9, 12)], {destination: 16}),
  encounter(143, 'Корабът на Ганзиджитците', 'ship', [enemy('Кораб на Ганзиджитците', 8, 12)], {destination: 185}),
  encounter(178, 'Техниците на Ай-Абейл', 'hand', [enemy('Първи техник', 7, 7), enemy('Втори техник', 5, 6), enemy('Трети техник', 6, 6)], {party: ['captain'], sequential: true, lossLimit: 6, lossDestination: 271, destination: 205}),
  encounter(183, 'Бронята на Човекоубиеца', 'hand', [enemy('Робот Човекоубиец', 10, 4)], {armour: true, waivePenalty: true, destination: 72}),
  encounter(196, 'Скавенджърът', 'phaser', [enemy('Скавенджър', 8)], {destination: 152, surrender: 141}),
  encounter(208, 'Вътрешният конфликт', 'hand', guards([6, 7], [7, 6]), {conflict: true, destination: 48, stopStamina: 3, lossDestination: 234}),
  encounter(235, 'Нападащият кораб', 'ship', [enemy('Нападащ кораб', 8, 7)], {destination: 133}),
  encounter(239, 'Арената на Човекоубиеца', 'hand', [enemy('Робот Човекоубиец', 10, 4)], {revealArmour: true, robotEveryone: true, waivePenalty: true, destination: 72}),
  encounter(245, 'Орелът и Ганзиджитецът', 'hand', [enemy('Ганзиджитец', 10, 10)], {party: ['eagle'], enemyModifier: -2, firstWound: true, destination: 188}),
  encounter(297, 'Въоръженият пазач', 'hand', guards([11, 14]), {doubleAttack: 'separate', destination: 160, surrender: 215, surrenderBelow: 4}),
  encounter(298, 'Лаф и тримата техници', 'phaser', [enemy('Лаф', 8), enemy('Първи техник', 7), enemy('Втори техник', 6), enemy('Трети техник', 7)], {destination: 120}),
  encounter(307, 'Дребното животинче', 'phaser', [enemy('Дребно животинче', 0)], {party: ['captain'], playerRange: 2, noReturnFire: true, roundLimit: 3, destination: 241, lossDestination: 19}),
  encounter(335, 'Повторна среща с Ганзиджитците', 'ship', [enemy('Кораб на Ганзиджитците', 8, 12)], {destination: 185}),
];

export const encounterFor = section => ENCOUNTERS.find(row => row.section === Number(section)) ?? null;
