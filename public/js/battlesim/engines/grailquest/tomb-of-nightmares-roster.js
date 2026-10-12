const foe = (name, life, hit, bonus, extra = {}) =>
  Object.freeze({ name, life, hit, bonus, armour: 0, ...extra });
const encounter = (id, name, enemies, extra = {}) =>
  Object.freeze({ id, name, enemies: Object.freeze(enemies), ...extra });

export const TOMB_ENCOUNTERS = Object.freeze([
  encounter(29, 'Rotting Zombie Guards', [foe('Zombie', 25, 6, 2,
    { poisonRoll: 12, poison: 3, poisonKind: 'rot' })], { count: 2 }),
  encounter(31, 'Lizard Men in Doomglug Swamp', [foe('Lizard Man', 15, 6, 3,
    { poisonRoll: 12, poison: 3, poisonKind: 'combat' })], { countDice: 1, countExtra: 1 }),
  encounter(41, 'Saturnine Vampires', [foe('Vampire', 22, 5, 3,
    { selfBiteRoll: 12, selfBiteDamage: 5 })], { count: 2 }),
  encounter(49, 'Screaming Green Mummies', [foe('Green Mummy', 25, 5, 0,
    { fatalRolls: [12] })], { count: 2 }),
  encounter(55, 'Treasure-Room Dragon', [foe('Dragon', 45, 4, 3,
    { fireFrom: 10, fireBonus: 10 })]),
  encounter(63, 'Giant Corridor Lizard', [foe('Giant Lizard', 35, 6, 2,
    { paralyseRolls: [3, 6, 9, 12], paralyseRounds: 1 })]),
  encounter(78, 'Four Giant Lizards', [foe('Giant Lizard', 35, 6, 2,
    { paralyseRolls: [3, 6, 9, 12], paralyseRounds: 1 })], { count: 4 }),
  encounter(94, 'Animated Granite Demon', [foe('Granite Demon', 35, 4, 4,
    { armour: 3 })]),
  encounter(103, 'Spider: Trapped in the Web', [foe('Giant Spider', 55, 5, 3,
    { fatalRolls: [12], poisonFatal: true })], { playerHit: 6, playerBonus: 1 }),
  encounter(111, 'Poisonous Treasure Crab', [foe('Crab', 33, 5, 1,
    { armour: 4, poisonFrom: 10, poison: 3, poisonKind: 'crab' })]),
  encounter(118, 'Fin Squandrago, God of Cod', [foe('Fishface', 50, 5, 0,
    { drowningFrom: 9, drowningRounds: 3 })]),
  encounter(130, 'Spider: EJ Stuck in the Web', [foe('Giant Spider', 55, 5, 3,
    { fatalRolls: [12], poisonFatal: true })], { playerHit: 6, playerBonus: 0 }),
  encounter(141, 'Werewolf in the Garlic Store', [foe('Werewolf', 25, 6, 3,
    { armour: 2, silverVulnerable: true })]),
  encounter(144, 'Wandering Vampires', [foe('Vampire', 20, 5, 2,
    { paralyseRolls: [12], paralyseRounds: 3 })], { countDice: 1, garlicBypass: true }),
  encounter(148, 'Draculina', [foe('Draculina', 40, 4, 0,
    { persistentDrain: 3 })]),
  encounter(150, 'Vampire Bats', [foe('Vampire Bat', 5, 4, 0,
    { fixedDamage: 3, attachedDrain: 3 })], { countDice: 2, deathRequired: true }),
  encounter(151, 'Werewolf: Human Form', [foe('Hairy Thug', 25, 6, 3,
    { armour: 2, silverVulnerable: true })]),
  encounter(168, 'Lava-Pit Demon', [foe('Demon', 30, 5, 3,
    { armour: 2 })]),
  encounter(169, 'Fido, the Hairy Octopus', [foe('Fido', 30, 4, 1,
    { attacks: 2 })]),
  encounter(172, 'Troll with a Crystal Dagger', [foe('Troll', 12, 6, 0,
    { fatalOnHit: true })]),
  encounter(189, 'The Lounge Lizard', [foe('Lounge Lizard', 40, 4, 3)]),
  encounter(204, "Grott's Flying Wyrms", [foe('Flying Wyrm', 15, 6, 2)],
    { count: 2, playerHit: 7, nextStage: '204-grott' }),
  encounter('204-grott', 'Grott the Hoddle', [foe('Grott', 25, 5, 3)],
    { section: 204, grott: true, enemyMagic: true, nextStage: 222, deathRequired: true }),
  encounter(209, 'Grott: Final Resurrection', [foe('Grott', 25, 5, 3)],
    { grott: true, enemyMagic: false, deathRequired: true }),
  encounter(218, 'Golden Vampire', [foe('Golden Vampire', 50, 4, 3,
    { fatalRolls: [12] })], { playerFirst: true }),
  encounter(219, 'Firefinger Skull', [foe('Ghastly Skull', 18, 2, 0,
    { fixedDamage: 10, automatic: true })]),
  encounter(222, 'Grott: First Resurrection', [foe('Grott', 25, 5, 3)],
    { grott: true, enemyMagic: true, nextStage: 209, deathRequired: true }),
]);

export const TOMB_DREAMS = Object.freeze([
  encounter('dream5', 'Dreamtime: Enraged Rubic Cube', [foe('Rubic Cube', 25, 5, 2)],
    { dream: true, playerHit: 6, playerBonus: 0 }),
]);

export const TOMB_COMPANION = foe('Golden Vampire', 50, 4, 3, { fatalRolls: [12] });
export const TOMB_EQUIPMENT = Object.freeze([
  'axe', 'knife', 'blanket', 'lantern', 'bandages', 'rope', 'cookingUtensils',
  'sacks', 'oil', 'saw', 'spikes', 'tent', 'clothes', 'tinderbox', 'boots', 'waterbag', 'rations',
]);

export const TOMB_SECRET_DOORS = Object.freeze({
  54: Object.freeze([{ wall: 'north', destination: 59 }]),
  73: Object.freeze([{ wall: 'west', destination: 122, oneWay: true }]),
  84: Object.freeze([{ wall: 'north', destination: 96 },
    { wall: 'south', destination: 127 }, { wall: 'east', destination: 143 }]),
  88: Object.freeze([{ wall: 'west', destination: 93 }]),
  89: Object.freeze([{ wall: 'east', destination: 94 }]),
  96: Object.freeze([{ wall: 'north', destination: 87 }]),
  195: Object.freeze([{ wall: 'west', destination: 211 }]),
});
