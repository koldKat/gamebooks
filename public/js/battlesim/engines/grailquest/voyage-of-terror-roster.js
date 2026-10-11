const foe = (name, life, hit = 6, bonus = 0, extra = {}) =>
  ({ name, life, hit, bonus, armour: 0, ...extra });
const group = (name, life, hit, bonus, count, extra = {}) =>
  Array.from({ length: count }, () => foe(name, life, hit, bonus, extra));
const encounter = (section, name, foes, extra = {}) => ({ section, name, foes, ...extra });
const baby = section => encounter(section, 'Babysaurus Rex',
  [foe('Babysaurus Rex', 50, 5, 4, { armour: 2 })], { friendly: false, bribe: false });
const harpy = section => encounter(section, 'Harpy', [foe('Harpy', 30, 5, 3)], { playerPenalty: 2 });

export const VOYAGE_ENCOUNTERS = Object.freeze([
  encounter(6, 'Savage Guards', group('Savage Guard', 20, 5, 2, 6, { armour: 3 }),
    { individualFriendly: true }),
  encounter(26, 'Cook with a Meat Cleaver', [foe('Cook', 30, 5, 3)]),
  encounter(33, 'Sea Serpent', [foe('Sea Serpent', 80, 6, 4, { serpent: true })],
    { friendly: false, bribe: false, victoryEquipmentLost: true, deathRequired: true }),
  encounter(47, 'Poisonous Spider', [foe('Poisonous Spider', 6, 5, 0, { lethalHit: true })],
    { first: 'player' }),
  encounter(57, 'Guardroom Guards', group('Guard', 15, 5, 2, 12, { armour: 2, gold: 10 }),
    { individualFriendly: true, bribe: 500, bribeEach: true, refusalDamage: 10 }),
  encounter(59, 'Giant Ram', [foe('Giant Ram', 30, 5, 4)], { jason: true, chaseLimit: 3, deathRequired: true }),
  encounter(65, 'Boar', [foe('Boar', 35, 5, 3)]),
  encounter(67, 'Guards at the Barred Doors', group('Guard', 25, 6, 2, 3, { armour: 2 }),
    { sequential: true, friendly: false, bribe: 500 }),
  encounter(77, 'Old Sea Dog', [foe('Old Sea Dog', 25, 6, 1)],
    { first: 'enemy', refusalDamage: 4 }),
  encounter(80, 'Amazon Guards', group('Amazon', 25, 5, 4, 2), { bribe: 1000, bribeEach: true }),
  encounter(84, 'Phantom Archer', [foe('Phantom Archer', 35, 8, 0, { halfCurrentLife: true })],
    { friendly: false, knockoutReturn: 39 }),
  encounter(87, 'Flying Harpies', group('Harpy', 25, 5, 3, 3),
    { playerHit: 8, first: 'enemy', bribe: 1000, bribeEach: true }),
  encounter(90, 'Old Sea Dog and the Wine', [foe('Old Sea Dog', 25, 6, 1)],
    { first: 'enemy', playerMissEvery: 2, refusalDamage: 4 }),
  encounter(101, 'Tyrannosaurus Rex', [foe('Tyrannosaurus Rex', 80, 4, 7, { armour: 5 })],
    { friendly: false, sleepingRoll: 9, equipmentBribe: true }),
  baby(108),
  encounter(109, 'Creeping Shadows', [], { shadows: true, friendly: false }),
  encounter(113, 'Pirates on the Upper Deck', group('Pirate', 25, 6, 3, 10),
    { argonautBattle: true, resurrectWithJason: true }),
  baby(121),
  encounter(133, 'Long John Silver and His Parrot', [
    foe('Long John Silver', 35, 5, 3, { pistol: true }), foe('Pollyrotten', 50, 4, 4),
  ], { alternating: true, deathRequired: true }),
  baby(134),
  encounter(140, 'The Chickens and the Witch', [
    ...group('Ferret', 4, 6, 1, 12, { phase: 0 }),
    foe('Rosy-Cheeked Witch', 20, 6, 0, { phase: 1, fullDice: true, evilEye: true }),
  ], { jason: true, splitFerrets: true, friendly: false, bribe: false, deathRequired: true }),
  encounter(144, 'Vulcan', [foe('Vulcan', 100000, 9, 50)],
    { unarmed: true, vulcanArmour: true, surrenderDamage: 18, weaponImmune: true }),
  encounter(151, 'Superlizard', [foe('Superlizard', 18, 9, 0, { multiplier: 6 })],
    { first: 'enemy' }),
  harpy(157),
  encounter(169, 'Rock Them', [foe('Rock Them', 15, 5, 5, { armour: 6 })],
    { playerAttacks: 2, roofChecks: true, deathRequired: true }),
  encounter(171, 'Hecate and the Pig', [foe('Hecate', 25, 4, 2)], { pig: true }),
  baby(175),
  encounter(179, 'Seven-Headed Hydra', group('Hydra Head', 10, 6, 1, 7, { serpent: true }),
    { simultaneous: true, deathRequired: true }),
  harpy(181), baby(188),
  encounter(189, 'Cyclops', [foe('Cyclops', 50, 5, 8)], { friendly: false, bribe: false }),
  encounter(200, 'Hecate', [foe('Hecate', 25, 4, 2)]),
  encounter(203, 'Mummy', [foe('Mummy', 33, 4, 0, { fullDice: true, mummyPoison: true })],
    { playerPenalty: 5, automaticMagicHit: 5, deathRequired: true }),
]);

export const VOYAGE_DREAMS = Object.freeze([
  encounter('dream3', 'Ragged Rogue', [foe('Ragged Rogue', 12, 6, 1)],
    { first: 'player', dream: true, unarmed: true, strikeLimit: 3, deathRequired: true }),
  encounter('dream4', 'Large Man with a Club', [foe('Large Man', 25, 6, 3, { attacks: 2 })],
    { first: 'enemy', dream: true, playerHit: 4, playerBonus: 5 }),
  encounter('dream7', 'Gnurlbash Monster', [foe('Gnurlbash Monster', 30, 6, 2)],
    { first: 'enemy', dream: true, unarmed: true, deathRequired: true }),
  encounter('dream8', 'Shark', [foe('Shark', 20, 6, 4)], { dream: true, unarmed: true }),
]);

export const VOYAGE_NAVIGATION = Object.freeze([
  encounter('navigation1', 'Greater Spotted Pondoozlewazzle Bird',
    [foe('Pondoozlewazzle Bird', 100, 12, 0, { lethalHit: true })],
    { first: 'player', entryDamage: 3, deathRequired: true }),
  encounter('navigation2', "Cannibal Chief's Daughter", [foe("Chief's Daughter", 35, 5, 3)],
    { knockoutCaptivity: true, escapeRoll: 5, deathRequired: true }),
  encounter('navigation6', 'Zebra-Striped Kimono Dragon', [foe('Kimono Dragon', 30, 4, 4)],
    { first: 'player', friendly: false, eggBribe: true }),
]);

export const VOYAGE_ARGONAUTS = Object.freeze([
  foe('Jason', 25, 5), foe('Hercules', 48, 6, 4), ...group('Argonaut', 20, 6, 0, 10),
  foe('Achilles', 30, 2, 1, { attackEvery: 2 }),
]);
