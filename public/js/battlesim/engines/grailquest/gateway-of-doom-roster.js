const foe = (name, life, hit = 6, bonus = 0, extra = {}) => ({ name, life, hit, bonus, armour: 0, ...extra });
const encounter = (section, name, foes, extra = {}) => ({ section, name, foes, ...extra });
const group = (name, life, hit, bonus, count, extra = {}) =>
  Array.from({ length: count }, () => foe(name, life, hit, bonus, extra));
const dwarves = section => encounter(section, 'Military Dwarves', group('Military Dwarf', 20, 5, 3, 7), { first: 'enemy' });
const ghouls = section => encounter(section, 'Giant Ghouls', group('Giant Ghoul', 30, 5, 4, 3));

export const GATEWAY_ENCOUNTERS = Object.freeze([
  encounter(13, 'Three Ghouls', group('Ghoul', 15, 6, 0, 3)),
  encounter(32, 'Brown Bear', [foe('Brown Bear', 50, 6, 2, { hugEvery: 3, hugBonus: 4 })]),
  encounter(71, 'Giant Spider', [foe('Giant Spider', 13, 6, 0, { unansweredHits: 3 })], { first: 'enemy', bribe: 1000 }),
  encounter(76, 'Manticore Family', [foe('Mum', 30, 6, 3), foe('Dad', 25, 6, 3),
    foe('Baby', 15, 6, 3, { baby: true })], { deathRequired: true, bribe: 500, bribeEach: true }),
  encounter(81, 'Winzing Guard', [foe('Winzing Guard', 15, 7, 1)]),
  encounter(85, 'Spider in the Web', [foe('Spider', 15, 5, 2)], { webCheck: true, swordPenalty: 1 }),
  encounter(90, 'Army of Ants', [], { ants: true, playerHit: 8, deathRequired: true }),
  encounter(100, 'Little Old Lady Monster', [foe('Little Old Lady Monster', 50, 6, 3, { firstRoundHit: 3 })]),
  encounter(101, 'Nerd and Djinn', [foe('Nerd', 20, 8, 5), foe('Djinn', 100, 5, 3)]),
  encounter(103, 'Old Man with a Pitchfork', [foe('Old Man', 7, 8)], { first: 'player' }),
  encounter(111, 'Poisonous Plants', [foe('Poisonous Pot Plant', 12, 5, 0, { vegetable: true, lethalHits: 3 }),
    ...group('Plant', 12, 5, 0, 3, { vegetable: true })]),
  encounter(113, 'Invisible Wizard', [foe('Invisible Wizard', 40, 6, 0, { wizard: true })], { specialBribe: true }),
  encounter(114, 'Ampitherian', [foe('Ampitherian', 50, 6, 3)]),
  encounter(120, 'Shark in the Freezing Water', [foe('Shark', 20, 5, 4)], { waterChecks: true }),
  encounter(124, 'Nerd with a Paralysing Dagger', [foe('Nerd', 20, 6, 0, { paralysis: 1 })], { bellCheck: true, first: 'player' }),
  encounter(126, 'Bota-Botas', group('Bota-Bota', 5, 6, 0, 5, { noAttack: true }),
    { first: 'player', deathRequired: true, moveLimit: 6 }),
  encounter(130, 'Distorted Pip', [], { mirror: true, bribe: 10000 }),
  encounter(133, 'Armoured Guards', group('Armoured Guard', 15, 6, 3, 2, { armour: 3 }), { bribe: 1000 }),
  encounter(137, 'Golls at the Infernal Machine', group('Goll', 10, 6, 1, 2), { freeOpeningBlows: 2 }),
  encounter(140, 'Magic Zapper', [foe('Magic Zapper', 6, 6, 0, { noAttack: true })], { first: 'player', oneBlow: true, deathRequired: true }),
  encounter(147, 'Two-Headed Gerofla', [foe('Gerofla', 40, 6, 0, { attacks: 2 })]),
  encounter(154, 'Djinn from the Urn', [], { djinn: true, bribe: 1000, bribeEach: true }),
  encounter(155, 'Guardian of the Darkness', [foe('Darkness Guardian', 40, 7, 3)], { first: 'enemy', playerHit: 7 }),
  encounter(156, 'Vampires in the Coffins', [], { vampires: true }),
  ghouls(166), dwarves(168), dwarves(171), dwarves(174),
  encounter(175, 'Visible Ghosts', group('Ghost', 10, 6, 1, 3)),
  ghouls(178),
  encounter(180, 'Invisible Ghosts', group('Invisible Ghost', 10, 6, 1, 3),
    { entryDamage: 5, playerHit: 8, missEvery: 3 }),
  dwarves(183), ghouls(188),
  encounter(200, 'The Black Knight and His Monsters', [], { finale: true, deathRequired: true }),
]);

export const GATEWAY_WANDERING = Object.freeze([
  encounter('level1-8', 'Animated Skeleton', [foe('Animated Skeleton', 20, 6, 1, { gold: 10 })]),
  encounter('level1-9', 'Nerds', group('Nerd', 11, 7, 2, 2, { gold: 10 })),
  encounter('level1-10', 'Orcs', group('Orc', 12, 6, 2, 2, { gold: 15 })),
  encounter('level1-11', 'Kobolds', group('Kobold', 8, 7, 1, 4, { gold: 5 })),
  encounter('level1-12', 'Creeping Jello', [foe('Creeping Jello', 30, 5, 4, { gold: 30 })]),
  encounter('level2-7', 'Medusa', [foe('Medusa', 30, 7, 2, { gold: 15, paralysisTwelve: 4 })]),
  encounter('level2-8', 'Poison Dwarves', group('Poison Dwarf', 15, 6, 1, 2, { gold: 10 })),
  encounter('level2-9', 'Colls', group('Coll', 15, 5, 2, 2, { gold: 15 })),
  encounter('level2-10', 'Triffids', group('Triffid', 30, 8, 4, 2, { gold: 15, vegetable: true })),
  encounter('level2-11', 'Scrats', group('Scrat', 10, 7, 1, 5, { gold: 25 })),
  encounter('level2-12', 'Creeping Semolina', [foe('Creeping Semolina', 35, 6, 4, { gold: 80 })]),
  encounter('level3-7', 'Them', [foe('Them', 20, 5, 5, { gold: 150 })]),
  encounter('level3-8', 'Vampire Bats', group('Vampire Bat', 6, 3, 1, 5)),
  encounter('level3-10', 'Permans', group('Perman', 15, 5, 2, 3, { gold: 100 })),
  encounter('level3-11', 'Tubarinos', group('Tubarino', 30, 6, 1, 2, { gold: 150, vegetable: true })),
  encounter('level3-12', 'Creeping Sago', [foe('Creeping Sago', 70, 6, 2, { gold: 500 })]),
].map(spec => ({ ...spec, wandering: true, deathRequired: true })));

export const GATEWAY_DREAMS = Object.freeze([
  encounter('dream3', 'Ragged Rogue', [foe('Ragged Rogue', 12, 6, 1)],
    { first: 'player', dream: true, playerHit: 6, playerBonus: 0, strikeLimit: 3, deathRequired: true }),
  encounter('dream4', 'Large Man with a Club', [foe('Large Man', 25, 6, 3, { attacks: 2 })],
    { first: 'enemy', dream: true, playerHit: 4, playerBonus: 5 }),
  encounter('dream7', 'Gnurlbash Monster', [foe('Gnurlbash Monster', 30, 6, 2)],
    { first: 'enemy', dream: true, playerHit: 6, playerBonus: 0 }),
  encounter('dream8', 'Shark', [foe('Shark', 20, 6, 4)],
    { dream: true, playerHit: 6, playerBonus: 0 }),
]);
