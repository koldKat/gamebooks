export const definition = Object.freeze({
  id: 904, title: 'Талисманът на смъртта', family: 'fighting-fantasy',
  stateKey: 'sim904', i18nPrefix: 'battlesim904',
});

export const RULES_REVISION = 1;
const enemy = (displayName, skill, stamina, extra = {}) => ({displayName, skill, stamina, ...extra});
const hawkana = (skill = 12, stamina = 14) => enemy('Ястребина', skill, stamina);
const thieves = (secondSkill = 5) => [enemy('Първи крадец', 6, 7), enemy('Втори крадец', secondSkill, 6)];
const pair = () => [enemy('Тютчев', 10, 12, {floor: 4}), enemy('Касандра', 9, 10, {floor: 4, damage: 3})];
const encounter = (section, enemies, win, extra = {}) => ({
  section, name: enemies.map(row => row.displayName).join(' / '), enemies, win,
  groups: [enemies.map((_, index) => index)], ...extra,
});

export const ENCOUNTERS = [
  encounter(4, [enemy('Трицератопс', 8, 30)], null, {roundLimit: 3, endLuck: [40, 25]}),
  encounter(9, [enemy('Птица Рух', 10, 16)], 84, {hitDie: {face: 1, destination: 55}}),
  encounter(10, [enemy('Червен дракон', 12, 20, {floor: 5})], 29),
  encounter(11, [enemy('Барман', 7, 8, {floor: 4}), enemy('Първи главорез', 8, 9, {floor: 5})], null, {endLuck: [200, 181]}),
  encounter(25, [enemy('Тиранозавър', 11, 18)], 14),
  encounter(31, [hawkana(9, 6)], 54),
  encounter(36, [enemy('Чудна върба', 8, 20)], 26, {winHits: 4}),
  encounter(50, [hawkana()], 44),
  encounter(51, [enemy('Червен дракон', 12, 20, {floor: 5})], 29, {playerDamage: 5}),
  encounter(59, [hawkana(12, 6)], 44),
  encounter(66, thieves(), 320, {stopEnemy: 0}),
  encounter(76, [hawkana()], 44, {openingStamina: 2}),
  encounter(81, [enemy('Любимец на Смъртта', 7, 7, {skillDrain: true})], 175, {openingStamina: 2, openingSkill: 1}),
  encounter(86, [enemy('Птеранодон', 7, 15)], 4),
  encounter(87, [hawkana()], 44, {skillBonus: 2}),
  encounter(91, [enemy('Рицар на Смъртта', 10, 15)], 62, {playerFloor: 6, interruption: 193}),
  encounter(96, [enemy('Любимец на Смъртта', 7, 5, {skillDrain: true})], 175),
  encounter(107, [enemy('Човекоядец', 8, 10)], 74, {openingStamina: 2}),
  encounter(116, [enemy('Духът на Ястребина', 10, 12)], 108, {loss: 23}),
  encounter(126, [enemy('Див елф', 8, 8)], 249),
  encounter(140, [enemy('Храмова стража', 7, 8)], 113, {roundLimit: 5, interruption: 124}),
  encounter(144, [enemy('Крилат череп', 7, 6)], 396),
  encounter(167, [enemy('Коварен удар', 6, 6), enemy('Белязаният', 7, 9, {floor: 5}), enemy('Втори главорез', 7, 8)], 259,
    {openingStamina: 6, stopConditions: [[0, 0], [1, 5]]}),
  encounter(189, [enemy('Вивисект', 8, 12)], 176, {consultation: 158}),
  encounter(195, [enemy('Леден демон', 8, 10)], 61, {openingStamina: 3}),
  encounter(201, [enemy('Вивисект', 8, 12)], 176, {consultation: 158}),
  encounter(208, [enemy('Невидим сталкер', 9, 8)], 250, {openingStamina: 2}),
  encounter(210, pair(), 355, {targetOrder: [1, 0]}),
  encounter(219, [enemy('Дух-двойник', 9, 10, {skillDrain: true})], 174, {openingStamina: 2}),
  encounter(220, [enemy('Пратеник на Смъртта', 8, 6, {skillDrain: true})], 254, {openingStamina: 2, openingSkill: 1}),
  encounter(223, [enemy('Касандра', 9, 10, {floor: 4, damage: 3})], 342),
  encounter(230, [enemy('Грендел', 8, 9)], 65),
  encounter(232, [enemy('Бяла вълчица', 8, 9)], 199),
  encounter(234, [enemy('Храмова стража', 6, 8)], 255),
  encounter(245, thieves(7), 329, {groups: [[0], [1]]}),
  encounter(265, [enemy('Тютчев', 10, 12)], 301, {winHits: 1}),
  encounter(271, [enemy('Пратеник на Смъртта', 8, 4, {skillDrain: true})], 254),
  encounter(274, [enemy('Върколак', 7, 8)], 343, {roundLimit: 5, interruption: 298}),
  encounter(282, [enemy('Първи орк', 5, 6), enemy('Втори орк', 5, 4), enemy('Орк-водач', 7, 7)], 111, {groups: [[0], [1], [2]]}),
  encounter(286, thieves(), 299, {stopAny: true}),
  encounter(288, [enemy('Монах от Алената Богомолка', 9, 8)], 325, {enemyDie: {min: 5, destination: 366}}),
  encounter(297, [enemy('Невидим сталкер', 9, 8)], 250, {openingStamina: 2}),
  encounter(311, [enemy('Монах от Алената Богомолка', 9, 8)], 325, {enemyDie: {min: 5, destination: 366}}),
  encounter(313, [enemy('Грифон', 8, 14, {floor: 6})], 94, {openingStamina: 2}),
  encounter(319, [enemy('Чудна върба', 8, 12)], 26, {winHits: 4, openingStamina: 4}),
  encounter(342, [enemy('Тютчев', 10, 12, {floor: 4})], 355),
  encounter(348, [enemy('Невидим сталкер', 7, 8)], 250),
  encounter(362, [enemy('Водачката', 8, 10), enemy('Елвира', 6, 8)], 376, {capture: {enemy: 0, attack: 10, destination: 393}}),
  encounter(364, thieves(), 391, {stopAny: true}),
  encounter(368, pair(), 353, {targetOrder: [1, 0]}),
  encounter(387, [enemy('Мумия', 9, 10)], 371),
  encounter(395, [enemy('Мумия', 8, 10)], 350),
];

export const encounterFor = section => ENCOUNTERS.find(row => row.section === Number(section));
