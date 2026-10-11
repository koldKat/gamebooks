const foe = (name, life, hit = 6, bonus = 0, extra = {}) =>
  Object.freeze({ name, life, hit, bonus, armour: 0, ...extra });
const encounter = (id, name, enemies, extra = {}) =>
  Object.freeze({ id, name, enemies: Object.freeze(enemies), ...extra });
const guards = foe('Dwarven Guard', 15, 5, 3);
const vron = foe('Hunting Vron', 20, 5, 3, { animal: true });
const berkwaddle = foe('Giant Berkwaddle', 100, 4, 5, { armour: 4, magicResistance: 7 });
const trial = foe('Alf', null, 6, 10, { humanoid: true });
const constable = foe('Dwarven Constable', 15, 5, 2, { humanoid: true });

export const KINGDOM_ENCOUNTERS = Object.freeze([
  encounter(16, 'Black Druids', [foe('Black Druid', 20, 5, 3, { humanoid: true })],
    { count: 3, friendly: true, bribe: 500 }),
  encounter(17, 'Sand Dragon', [foe('Sand Dragon', 55, 7, 5, { armour: 4, animal: true })],
    { friendly: true, running: true }),
  encounter(19, 'Mounted Barbarians', [foe('Barbarian', 12, 5, 3, { humanoid: true })],
    { count: 3, friendly: true, bribe: 300, bribeRations: true, surrender: true, running: true }),
  encounter(32, 'Wolf in the Shrub', [foe('Wolf', 25, 5, 2, { animal: true, attacks: 2 })],
    { friendly: true }),
  encounter(36, 'Borfax and Ben', [foe('Borfax', 70, 5, 4, { animal: true, alternatingHitBonus: [4, 5] }),
    foe('Ben the Warrior Dwarf', 30, 5, 3, { humanoid: true, phase: 1 })], { captureBorfax: true }),
  encounter(41, 'Roadside Brigands', [foe('Brigand', 15, 5, 2, { humanoid: true })],
    { count: 3, deathRequired: true, friendlyForbidden: true, foolingForbidden: true, freeRetreat: true }),
  encounter(46, 'Peasant with a Club', [foe('Peasant', 15, 6, 3, { humanoid: true })],
    { first: 'player', unarmed: true, fullDice: true }),
  encounter(47, 'Hunting Vron', [vron], { countRoll: 'pack', vronTooth: true }),
  encounter(54, 'Bridge Men at Arms', [foe('Dwarven Man at Arms', 25, 5, 3, { armour: 2, humanoid: true })],
    { count: 2, toll: 500 }),
  encounter(56, 'Guardian of the Gateway', [foe('Gateway Giant', 499, 3, 15, { humanoid: true })],
    { immortal: true, cherryBlossom: true }),
  encounter(66, 'Peasant Outside Merlin\'s House', [foe('Peasant', 26, 6, 4, { humanoid: true })],
    { first: 'enemy', surprised: true }),
  encounter(70, 'Rebellious Peasants', [foe('Peasant', 30, 6, 2, { humanoid: true })],
    { count: 25, passageToken: true }),
  encounter(73, 'Scorpion', [foe('Scorpion', 8, 6, 0, { fixedDamage: 3, sectionPoison: 2, animal: true })],
    { first: 'enemy', surprised: true, deathRequired: true }),
  encounter(75, 'Bare-Handed Peasant', [foe('Peasant', 15, 6, 0, { fullDice: true, humanoid: true })],
    { first: 'player', unarmed: true, fullDice: true, nonlethal: true, knockoutReturn: 3 }),
  encounter(78, 'Witches of Witchwood', [foe('Minnie', 20, 6, 0, { humanoid: true, magic: 'thunderbolt' }),
    foe('Aggie', 20, 6, 0, { humanoid: true, magic: 'kangling' }),
    foe('Scrog', 20, 6, 0, { humanoid: true, magic: 'dragonfire', pills: 6 })],
    { friendly: true, friendlyLimit: 1 }),
  encounter(82, 'Invisible Bear', [foe('Invisible Bear', 45, 5, 6, { animal: true })],
    { first: 'enemy', surprised: true, bearGrip: true, playerMissEvery: 2 }),
  encounter(83, 'Merlin\'s Kidnappers', [foe('Peasant Kidnapper', 20, 6, 3, { humanoid: true })], { count: 3 }),
  encounter(86, 'Imprisoned Demonspawn', [foe('Demonspawn', 80, 3, 2)], { bribe: 20000000 }),
  encounter(92, 'Hunting Vron', [vron], { countRoll: 'pack', vronTooth: true }),
  encounter(110, 'Priests of Dackworth', [foe('Dwarven Priest', 25, 4, 3, { humanoid: true })], { count: 2 }),
  encounter(116, 'Hunting Vron', [vron], { countRoll: 'pack', vronTooth: true }),
  encounter(119, 'Blagwort\'s Guards', [guards], { countRoll: 'guards', first: 'enemy', surprised: true }),
  encounter(126, 'Blogwort\'s Guards', [guards], { countRoll: 'guards', first: 'enemy', surprised: true }),
  encounter(129, 'Slippery Sam', [foe('Slippery Sam', 25, 5, 2, { humanoid: true })]),
  encounter(131, 'Alf\'s Applicant Trial', [trial], { trial: true, unarmed: true, fullDice: true, nonlethal: true }),
  encounter(135, 'Ghastly Guardian Ghoul', [foe('Ghastly Guardian Ghoul', null, 4, 5, { combatPoison: 3 })],
    { matchPlayerLife: true, deathRequired: true }),
  encounter(146, 'Comrade Alf\'s Loyalty Trial', [trial], { trial: true, unarmed: true, fullDice: true, nonlethal: true }),
  encounter(154, 'Dwarven Constabulary', [constable], { reinforcements: true }),
  encounter(172, 'Giant Berkwaddle: Tom', [berkwaddle], { deathRequired: true, playerMissEvery: 3, ebonyRod: true }),
  encounter(176, 'Giant Berkwaddle: Dick', [berkwaddle], { deathRequired: true, playerMissEvery: 3, ebonyRod: true }),
  encounter(178, 'Giant Berkwaddle: Harry', [berkwaddle], { deathRequired: true, ebonyRod: true }),
  encounter(181, 'Giant Berkwaddle: Reverend O\'Rourke', [berkwaddle],
    { deathRequired: true, playerMissEvery: 3, ebonyRod: true }),
]);

export const KINGDOM_DREAMS = Object.freeze([
  encounter('dream3', 'Dreamtime: Ragged Rogue', [foe('Ragged Rogue', 12, 6, 1, { humanoid: true })],
    { dream: true, first: 'player', unarmed: true, deathRequired: true, strikeLimit: 3 }),
  encounter('dream4', 'Dreamtime: Drunken Brawl', [foe('Large Man', 25, 6, 3, { humanoid: true, attacks: 2 })],
    { dream: true, first: 'enemy', dreamEJ: true, deathRequired: true }),
  encounter('dream7', 'Dreamtime: Gnurlbash', [foe('Gnurlbash Monster', 30, 6, 2)],
    { dream: true, first: 'enemy', unarmed: true, deathRequired: true }),
  encounter('dream8', 'Dreamtime: Shark', [foe('Shark', 20, 6, 4, { animal: true })],
    { dream: true, unarmed: true, deathRequired: true }),
]);

export const KINGDOM_MAGIC_STOCK = Object.freeze([
  ['pointingBone', 1], ['neckInstructions', 1], ['speedBoots', 2], ['brokenBall', 1],
  ['deathbell', 1], ['deathMask', 1], ['eyeOfHorus', 1], ['ropeInstructions', 1],
  ['laughingGlobe', 2], ['levitationTablet', 1], ['lightningRod', 1], ['lightningWand', 1],
  ['luckyCoin', 1], ['fireball', 2], ['friendshipMask', 1], ['destructionOrb', 1],
  ['decoder', 1], ['psionicHelm', 1], ['bubblePipe', 1], ['resurrectionWand', 1],
  ['sanctuaryScroll', 1], ['seekerNeedle', 1], ['sleepGlobe', 3], ['smarmOil', 2],
  ['vorpalSword', 1], ['xerox', 1],
].map(([id, stock], index) => Object.freeze({ id, stock, number: index + 1 })));

export const KINGDOM_EQUIPMENT = Object.freeze([
  'axe', 'bandages', 'boots', 'breastplate', 'falseBeard', 'hammer', 'harp',
  'healingPotion', 'healingSalve', 'knife', 'lantern', 'lute', 'lyre', 'mallet',
  'fairyMap', 'nails', 'parchment', 'panPipes', 'powderedInk', 'pumpkin', 'quartz',
  'quill', 'rations', 'rope', 'grain', 'sandals', 'saw', 'sheepskin', 'spikes',
  'string', 'tinderbox', 'waterbag', 'plank',
]);

export const KINGDOM_STORY_MAGIC = Object.freeze(['thunderbolt', 'kangling', 'dragonfirePills']);
