export const definition = Object.freeze({id: 891, title: 'Кибернетични войни', family: 'cybernetic-wars', stateKey: 'sim891', i18nPrefix: 'battlesim891'});
export const RULES_REVISION = 1;

export const CHANCE_TABLE = Object.freeze([
  1, 2, 3, 4, 5, 6,
  4, 8, 12, 1, 11, 5,
  7, 9, 1, 10, 3, 2,
  1, 4, 2, 6, 7, 9,
  12, 8, 1, 10, 1, 12,
  4, 3, 9, 1, 11, 7,
  2, 8, 5, 12, 5, 1,
  7, 2, 4, 9, 1, 10,
  5, 8, 9, 10, 11, 12,
]);

export const EASY_PRESETS = [
  ['transport', 'Транспорт', 10, 24, 6, 40],
  ['cruiser', 'Крайцер', 12, 20, 8, 30],
  ['monitor', 'Монитор', 14, 30, 10, 20],
  ['shuttle', 'Совалка', 4, 16, 2, 20],
  ['fighter', 'Изтребител', 8, 4, 10, 1],
  ['bomber', 'Бомбардировач', 6, 8, 4, 4],
  ['cargo-robot', 'Товарен робот', 0, 24, 0, 40],
  ['light', 'Всички ЛЕКИ', 10, 10, 4, 20],
  ['heavy', 'Всички ТЕЖКИ', 20, 30, 8, 30],
  ['tanks', 'Танкове', 16, 20, 6, 20],
  ['special', 'Специални', 24, 4, 12, 10],
  ['nonstandard', 'Нестандартни', 4, 8, 4, 8],
].map(([id, displayName, attack, defence, damage, hp]) => ({id, displayName, attack, defence, damage, hp}));

// Hard-mode damage is not supplied by these unit stat blocks.
export const HARD_PRESETS = [
  ['scout', 'Скаут LBA-001', 8, 4, 24, 50, 5, 6, 8],
  ['flying-patrol', 'Летящ патрул UBA-021', 12, 12, 24, 60, 10, 8, 6],
  ['stormfire', 'Щурмфаер HBD-111', 20, 24, 36, 100, 10, 8, 6],
  ['super-armour', 'Суперброн HBt/BA-S01', 30, 36, 36, 120, 12, 12, 8],
  ['universal-one', 'УНИВЕРСАЛ-1 WA-001', 4, 10, 20, 200, 20, 4, 2],
  ['universal-two', 'УНИВЕРСАЛ-2Т UWD-2T', 10, 20, 40, 240, 20, 4, 2],
  ['prototype', 'Прототип BA/WA-Ext', 40, 40, 60, 200, 10, 20, 8],
  ['vulcan', 'Вулкан', 12, 0, 10, 100, 10, 10, 12],
  ['lok-three', 'ЛОК-3', 16, 10, 20, 100, 10, 4, 6],
  ['lok-seven', 'ЛОК-7', 24, 20, 20, 100, 20, 8, 6],
  ['cyberdrone', 'Кибердрон', 48, 24, 24, 20, 5, 2, 4],
  ['david', 'Давид', 24, 10, 30, 100, 5, 6, 6],
  ['goliath', 'Голиат', 36, 16, 40, 200, 10, 8, 6],
  ['superdrone', 'Супердрон', 48, 30, 50, 210, 30, 12, 8],
  ['crab-two', 'Краб-2', 10, 0, 100, 400, 10, 2, 2],
  ['mobile-missiles', 'Мобилна ракетна установка', 60, 10, 10, 100, 40, 12, 12],
  ['large-transport', 'Голям транспортен кораб', null, null, null],
  ['armed-transport', 'Въоръжен транспорт', 12, 12, 24],
  ['robogun-one', 'Робогън-1', 24, 10, 10],
  ['robogun-two', 'Робогън-2', 12, 40, 10],
  ['blaster-tower', 'Бластерна кула', null, null, null],
  ['command-centre', 'Команден център', null, null, null],
  ['mastodon', 'Мастодонт', null, 24, 100],
  ['griffin', 'Грифон', 60, 12, 40],
  ['monitor', 'Монитор', 30, 30, 10],
  ['ghost-shuttle', 'Совалка Призрак', 8, 10, 10],
  ['assault-fighter', 'Космически щурмови изтребител', 20, 4, 4],
  ['orbital-interceptor', 'Орбитален прехващач', 10, 8, 4],
  ['orbital-bomber', 'Орбитален бомбардировач', 8, 24, 4],
].map(([id, displayName, attack, defence, hp, energy = null, energyCost = null, feedback = null, range = null]) =>
  ({id, displayName, attack, defence, hp, damage: null, energy, energyCost, feedback, range}));

export const MANOEUVRES = Object.freeze({
  none: {attack: 0, defence: 0, tactics: 0},
  frontal: {attack: 4, defence: -4, tactics: 1},
  flanking: {attack: 2, defence: -2, tactics: 2},
  deflection: {attack: 0, defence: 2, tactics: -1},
  loop: {attack: -4, defence: 4, tactics: -1},
  oblique: {attack: -2, defence: -2, tactics: 2},
  escape: {attack: 0, defence: -4, tactics: 0, zeroAttack: true, speed: 2},
  approach: {attack: 4, defence: -2, tactics: 0},
  withdraw: {attack: -2, defence: 4, tactics: 0},
});
