export const definition = Object.freeze({
  id: 768, title: 'Пътят на дракона', family: 'dragon-road',
  stateKey: 'sim768', i18nPrefix: 'battlesim768',
});

// LIFE and combat mastery have no reliable starting formula in this source.
export const CHARACTER_FIELDS = Object.freeze([
  'attack', 'defence', 'shooting', 'life', 'mastery', 'speed',
  'magicStrength', 'magicEnergy', 'magicResistance',
]);

export const WARRIORS = Object.freeze([
  {displayName: 'Инцитат', attack: 20, defence: 16, shooting: 8, life: 24, speed: 4},
  {displayName: 'Страброн', attack: 28, defence: 12, shooting: 4, life: 36, speed: 2},
  {displayName: 'Войник', attack: 12, defence: 12, shooting: 6, life: 16, speed: 2},
  {displayName: 'Войник на Естравен', attack: 14, defence: 8, shooting: 4, life: 12, speed: 2},
  {displayName: 'Див орк', attack: 24, defence: 6, shooting: 2, life: 20, speed: 3},
  {displayName: 'Гоблин', attack: 16, defence: 6, shooting: 2, life: 32, speed: 2},
  {displayName: 'Прилеп-вампир', attack: 12, defence: 12, shooting: 6, life: 16, speed: 6},
  {displayName: 'Зомби', attack: 6, defence: 4, life: 120, speed: 1},
]);

export const NECROMOR = Object.freeze({
  displayName: 'Некромор', attack: 64, defence: 55, life: 120,
  magicStrength: 90, magicEnergy: 1000, schools: ['death', 'fire'],
});

export const IRON_DRAGON = Object.freeze({
  displayName: 'Железен дракон', attack: 50, defence: 24, life: 90,
  attacks: Object.freeze([
    Object.freeze({kind: 'fire', attack: 50}),
    Object.freeze({kind: 'claw', attack: 120}),
    Object.freeze({kind: 'tail', attack: 60}),
  ]),
  spellImmune: true, canEscape: false,
});

export const TABLE_IMAGES = Object.freeze({
  simple: '/api/books/768/reading-images/591e394ffd6ae08358f843178b3cd5c63d403f18298beaef6fa5946d67acf5b9.png',
  hits: '/api/books/768/reading-images/041240bf4cbf8bf7fe2f51cb082f25b6c852ad391b575ac140cc91ff5d69c366.png',
  damage: '/api/books/768/reading-images/b676a7e9a72973256e15d81f6a56ba10b0edbd930a36d4904bf020d4f88174d3.png',
});
