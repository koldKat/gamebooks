const foe = (section, name, life, hit = 6, bonus = 0, extra = {}) => ({ section, name, life, hit, bonus, armour: 0, count: 1, ...extra });

export const DEN_ENCOUNTERS = Object.freeze([
  foe(6, 'White Rabbit', 25, 5, 3, { playerRollModifier: -2, poisonHits: 3 }),
  foe(23, 'Stone Man', 28, 8, 4, { magicWeaponArmour: 4 }),
  foe(24, 'Phantom of the Village Church', 30, 5, 3),
  foe(41, 'Green Creature', 15),
  foe(50, 'Wolf', 31, 6, 3, { armour: 1, first: 'enemy' }),
  foe(57, 'Martial Monks', 25, 4, 3, { count: 4, first: 'enemy' }),
  foe(60, 'Water Weird', 10, 6, 0, { magicChallenge: true, magicOnly: true, first: 'player' }),
  foe(67, 'Stone Monster', 18, 7, 0, { armour: 1, playerHit: 8, first: 'player' }),
  foe(82, 'Whistling Wolf', 15, 6, 0, { friendly: true }),
  foe(98, 'Rock Trolls', 10, 6, 2, { armour: 1, count: 6, first: 'player' }),
  foe(102, 'Wraith', 25, 6, 3, { magicOnly: true, entryDamage: 10 }),
  foe(104, 'Irish Wolfrat', 25, 5, 2, { disease: true }),
  foe(120, 'Minotaur', null, 6, 0, { tokenLimit: 10, unarmed: true }),
  foe(123, 'Fish', 10, 6, 0, { unarmed: true, playerArmour: 0, roundLimit: 3 }),
  foe(131, 'Hunchbacked Dwarves', 10, 8, 3, { count: 12, openingTargets: true, fleeAfter: 10 }),
  foe(136, 'Medusa', 100, 8, 0, { petrifyHits: 2 }),
  foe(141, 'Darkness Monster', 80, 5, 2, { first: 'enemy' }),
  foe(153, 'Slither', 20, 8, 0, { lethalHit: true, openingEvasion: true }),
  foe(157, 'Shapes', 4, 6, 0, { count: 6, shapes: true, first: 'player' }),
  foe(168, 'Remaining Shapes', 4, 6, 0, { count: 5, shapes: true, entryDamage: 15, first: 'player' }),
  foe(172, 'Brass Dragon', 150, 5, 5, { fireEvery: 3, fireBonus: 10, invisibleHit: 8, dragon: true }),
]);

export const DEN_DREAM_FIGHTS = Object.freeze([
  foe('dream2', 'Brain Teaser', 15, 6, 0, { automaticDamage: 5, first: 'enemy', dream: true, unarmed: true }),
  foe('dream8', 'Black Knight', 25, 6, 10, { armour: 6, playerArmour: 5, playerBonus: 12, dream: true, dreamInitiative: true }),
  foe('dream10', 'Ogre', 40, 6, 15, { dream: true, unarmed: true, arrows: 7, first: 'player' }),
]);
