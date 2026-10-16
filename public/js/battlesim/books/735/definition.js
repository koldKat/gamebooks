export const definition = Object.freeze({
  id: 735, title: 'Космически убиец', family: 'space-assassin', stateKey: 'sim735', i18nPrefix: 'battlesim735',
});

const enemy = (name, skill, stamina, extra = {}) => ({ name, skill, stamina, ...extra });
const encounter = (section, name, mode, enemies, win, extra = {}) => ({ section, name, mode, enemies, win, ...extra });

export const ENCOUNTERS = Object.freeze([
  encounter(20, 'Робот пазач', 'gunfire', [enemy('Робот пазач', 5, 5)], 300),
  encounter(48, 'Микрохеликоптер', 'gunfire', [enemy('Микрохеликоптер', 8, 2)], 124),
  encounter(61, 'Тримата чистачи', 'melee', [enemy('Първи чистач', 8, 6), enemy('Втори чистач', 9, 4), enemy('Трети чистач', 7, 4)], 290),
  encounter(65, 'Растения-удушвачи', 'gunfire', [enemy('Растения-удушвачи', 0, 12, { shots: 0 })], 173, { roundDamage: 2 }),
  encounter(71, 'Шестте механични животни', 'gunfire', [
    enemy('Първо животно', 8, 3), enemy('Второ животно', 8, 3), enemy('Трето животно', 7, 3),
    enemy('Четвърто животно', 6, 2), enemy('Пето животно', 6, 2), enemy('Шесто животно', 5, 2),
  ], 329),
  encounter(74, 'Роботи часови', 'gunfire', [enemy('Първи часови', 8, 9), enemy('Втори часови', 8, 9)], 351,
    { grenadeAllowed: true, knowledgeBonus: 1 }),
  encounter(85, 'Рапанът', 'melee', [enemy('Рапанът', 9, 8)], 182, { knowledgeBonus: 1 }),
  encounter(95, 'Сайръс', 'gunfire', [enemy('Сайръс', 9, 12)], 400, { ballBearingPenalty: 1 }),
  encounter(101, 'Раковината с шипове', 'melee', [enemy('Раковината с шипове', 9, 10)], 196,
    { escapeCost: 2, escapeDestination: 139 }),
  encounter(108, 'Часови по охраната', 'gunfire', [enemy('Първи часови', 6, 4), enemy('Втори часови', 6, 4)], 203,
    { grenadeAllowed: true, grenadeCover: 1 }),
  encounter(138, 'Режещият диск', 'gunfire', [enemy('Режещият диск', 9, 1)], 195),
  encounter(159, 'Крилатият скорпион', 'melee', [enemy('Крилатият скорпион', 8, 6)], 397),
  encounter(165, 'Тороид', 'gunfire', [enemy('Тороид', 0, 12, { shots: 0 })], 332,
    { roundLimit: 3, limitDestination: 384, limitFatal: true }),
  encounter(211, 'Стражеви робот', 'gunfire', [enemy('Стражеви робот', 7, 6, { shots: 2, damage: 2 })], 247, { optionalOpeningArmourLoss: 1 }),
  encounter(220, 'Двойникът на Тарн', 'melee', [enemy('Двойникът на Тарн', 8, 6)], 13, { optionalOpeningArmourLoss: 1 }),
  encounter(228, 'Стражеви робот при килиите', 'gunfire', [enemy('Стражеви робот', 7, 6)], 264, { grenadeAllowed: true }),
  encounter(239, 'Часовите след предаването', 'gunfire', [enemy('Първи часови', 6, 4), enemy('Втори часови', 6, 4)], 203,
    { openingLuckTest: true, openingShotsIfLucky: 1, openingShotsIfUnlucky: 2 }),
  encounter(267, 'Осем портативни робота', 'gunfire', [
    'Първи', 'Втори', 'Трети', 'Четвърти', 'Пети', 'Шести', 'Седми', 'Осми',
  ].map(name => enemy(name + ' робот', 7, 2)), 303, { grenadeAllowed: true, grenadeLimit: 2, gravityBombAllowed: true }),
  encounter(279, 'Часовите под решетката', 'gunfire', [enemy('Първи часови', 4, 9), enemy('Втори часови', 4, 9)], 351,
    { knowledgeBonus: 1 }),
  encounter(308, 'Шесторъко божество', 'gunfire', [enemy('Божеството', 0, 12, { weapons: [
    { name: 'whip', skill: 10, damage: 3 }, { name: 'machete', skill: 9, damage: 2 },
    { name: 'spear', skill: 7, damage: 1 }, { name: 'lash', skill: 8, damage: 2 },
    { name: 'blaster', skill: 6, weapon: 'blaster' }, { name: 'disintegrator', skill: 5, instant: true },
  ] })], 344, { grenadeAllowed: true }),
  encounter(312, 'Мутанти от басейна', 'melee', [enemy('Първи мутант', 8, 8), enemy('Втори мутант', 8, 6)], 366,
    { grenadeAllowed: true, grenadeArmourOnEven: true, knowledgeBonus: 1 }),
  encounter(319, 'Лазерен глобус', 'gunfire', [enemy('Лазерен глобус', 9, 1)], 4, { initialArmourLoss: 1 }),
  encounter(338, 'Техникът', null, [enemy('Техникът', 8, 5)], 248,
    { requiresModeChoice: true, requiresEnemyWeaponChoice: true }),
  encounter(359, 'Месоядно растение', null, [enemy('Месоядно растение', 0, 6, { shots: 0, damage: 0 })], 8,
    { requiresModeChoice: true, openingLuckTest: true, luckAvoidsFight: true, luckDestination: 8, roundLimit: 3, limitFatal: true }),
  encounter(364, 'Разяреният двойник на Тарн', 'melee', [enemy('Двойникът на Тарн', 9, 6)], 13),
  encounter(383, 'Зарк', 'gunfire', [enemy('Зарк', 5, 7, { weapon: 'disintegrator', instant: true })], 392),
]);
