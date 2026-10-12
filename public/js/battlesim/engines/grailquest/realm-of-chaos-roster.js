const foe = (name, life, hit, bonus, extra = {}) =>
  Object.freeze({ name, life, hit, bonus, armour: 0, ...extra });
const encounter = (id, name, enemies, extra = {}) =>
  Object.freeze({ id, name, enemies: Object.freeze(enemies), ...extra });

export const REALM_ENCOUNTERS = Object.freeze([
  encounter(12, 'Alchemical Green Dragon', [foe('Green Dragon', 40, 6, 0,
    { fixedDamage: 10, fatalRolls: [12] })], { deathRequired: true }),
  encounter(16, 'Honest Albert', [foe('Honest Albert', null, null, null)],
    { manualStats: true, nonlethal: true, enemyStop: 15, playerStop: 15, playerStopStrict: true }),
  encounter(29, 'Poisonous Rat', [foe('Rat', 33, 6, 0, { poison: 5 })], { deathRequired: true }),
  encounter(31, 'Martial Monks', [foe('Monk', 20, 5, 3)],
    { count: 2, enemyStop: 5, enemyStopStrict: true, killingForbidden: true }),
  encounter(40, 'Duckpond Monster', [foe('Monster', 30, 6, 5)]),
  encounter(76, 'Weakened Guardian Wyrm', [foe('Guardian Wyrm', 40, 6, 2)],
    { openingPlayerLoss: 5 }),
  encounter(84, 'Fungoid Zombies', [foe('Fungoid Zombie', 22, 6, 3, { fatalRolls: [12] })], { count: 3 }),
  encounter(96, 'Boris the Torturer', [foe('Boris', 30, 5, 5)], { openingEnemyLoss: 7 }),
  encounter(100, 'Fungoid Guards', [foe('Fungoid Guard', 25, 5, 3)],
    { count: 3, deathRequired: true, bribe: 1000, bribeRetreat: 68 }),
  encounter(120, 'Crawman', [foe('Crawman', 40, 6, 0, { armour: 4 })],
    { astral: true, playerAttacks: 2, baselineAttack: true }),
  encounter(127, 'Squand', [foe('Squand', 80, 6, 0, { fixedDamage: 2, fatalRolls: [12] })],
    { astral: true, playerAttacks: 2 }),
  encounter(129, 'Hoopberk', [foe('Hoopberk', 35, 5, 3)], { astral: true, spawnAfterMisses: 3 }),
  encounter(132, 'Ratchbacked Mervillion', [foe('Mervillion', 40, 5, 3)],
    { astral: true, periodicLoss: 10, lossEvery: 3 }),
  encounter(133, 'Guardian Spooks', [foe('Guardian Spook', 30, 4, 3, { paralyseRoll: 12 })],
    { count: 3, spookBasher: true }),
  encounter(135, 'Karate Kat', [foe('Karate Kat', 50, 4, 3)], { openingPlayerLoss: 5 }),
  encounter(137, 'Ghast', [foe('Ghast', 33, 5, 5)], { astral: true, unarmed: true }),
  encounter(139, 'Hairy Cell Monster', [foe('Hairy Monster', 30, 5, 3)], { bribe: 1000 }),
  encounter(143, 'Giant Squackdiddle', [foe('Squackdiddle', 55, 8, 10)], { astral: true }),
  encounter(149, 'Vampire Butler', [foe('Vampire', 38, 3, null,
    { fatalRolls: [12], incarnationPenalty: 15 })], { manualBonus: true, deathRequired: true, stake: true }),
  encounter(155, 'Two-Headed Dog', [foe('Head Stanley', 25, 5, 3), foe('Head Charles', 25, 5, 3)]),
  encounter(156, 'Trombone Lady', [foe('Little Old Lady', 30, 6, 7)],
    { astral: true, playerFatalRolls: [5, 7] }),
  encounter(159, 'Bagpipe Man', [foe('Little Old Man', 30, 6, 7)],
    { astral: true, playerFatalRolls: [5, 7] }),
  encounter(178, 'Namwarc', [foe('Namwarc', 40, 6, 0, { armour: 4 })],
    { astral: true, playerAttacks: 2, baselineAttack: true }),
  encounter(193, 'Vorpal Bunny', [foe('Vorpal Bunny', 55, 5, 2, { fatalRolls: [6, 12] })]),
  encounter(201, 'Pondifilous Maximus', [foe('Pondifilous Maximus', 12, 5, 4)], { winByHealing: 30 }),
  encounter(210, 'Seven Sisters', [
    ...Array.from({ length: 6 }, (_, i) => foe(`Sister ${i + 1}`, 10, 5, 3)),
    foe('Seventh Sister', 20, 4, 5, { fatalRolls: [12] }),
  ]),
  encounter(218, 'Phantom Grunweazel: Bonkers Helm', [foe('Phantom Grunweazel', 55, 6, 0,
    { armour: 3, fixedDamage: 6 })], { bonkersHelm: true }),
  encounter(219, 'Phantom Grunweazel: Unprotected', [foe('Phantom Grunweazel', 55, 6, 0,
    { armour: 3, fixedDamage: 12 })], { playerHit: 6 }),
]);

export const REALM_DREAMS = Object.freeze([
  encounter('dream6', 'Dreamtime: Lizard Men', [foe('Lizard Man', 10, 6, 2)],
    { dream: true, countRoll: true, deathRequired: true, unarmed: true, recruitKilled: true }),
  encounter('dream12', 'Dreamtime: Warthog', [foe('Warthog', 22, 5, 3)],
    { dream: true, deathRequired: true, unarmed: true, cureDreamDisease: true }),
]);

export const REALM_COMPANION = foe('Mastiff', 25, 5, 4, { stopAt: 5, forbiddenOpponent: 'Acton' });
export const REALM_EQUIPMENT = Object.freeze([
  'axe', 'antFarm', 'boots', 'cobwebSpray', 'fishingRod', 'glitterPowder',
  'hammer', 'handkerchief', 'knife', 'mallet', 'rope', 'rations', 'razor',
  'salt', 'saw', 'slideTrombone', 'spikes', 'stake', 'talkingHead', 'toothbrush', 'twine',
]);

export const REALM_ASTRAL_KEY = Object.freeze({2:120,3:122,4:124,5:127,7:129,8:132,10:137,11:143});
