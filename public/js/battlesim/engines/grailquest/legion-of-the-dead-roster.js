const foe = (name, life, hit = 6, bonus = 0, extra = {}) =>
  Object.freeze({ name, life, hit, bonus, armour: 0, ...extra });
const encounter = (id, name, enemy, extra = {}) =>
  Object.freeze({ id, name, enemies: Object.freeze([enemy]), ...extra });

export const LEGION_ENCOUNTERS = Object.freeze([
  encounter(4, 'The Thing Outside Merlin\'s Door', foe('Thing', 20, 6, 3)),
  encounter(9, 'The Beautiful Young Woman', foe('Leathery Demon', 25, 6, 0, { doubleFrom: 11 })),
  encounter(13, 'The Rock Dwarf', foe('Rock Dwarf', 30, 5, 2, { armour: 2, thirdTurnHit: 8 }), { playerFirst: true }),
  encounter(19, 'Chasm Kraken', foe('Chasm Kraken', 25, 6, 0, { fatalFrom: 11 })),
  encounter(24, 'Contorted Rock Shapes', foe('Rock Shape', 10, 6, 0, { fatalFrom: 11 }), { count: 'shapes' }),
  encounter(31, 'The Drawn Dragon', foe('Drawn Dragon', 25, 6, 3)),
  encounter(32, 'Rock Shapes at the Exit', foe('Rock Shape', 10, 6, 0, { fatalFrom: 11 }), { count: 'shapes' }),
  encounter(49, 'Wolves at the Pool', foe('Wolf', 20, 6, 2), { count: 'twoDice' }),
  encounter(53, 'Wildcat in the Crawlspace', foe('Wildcat', 20, 6, 1), { unarmed: true }),
  encounter(66, 'Wrestling the MacHoot', foe('MacHoot', 35, 5), { unarmed: true, contest: 'wrestle', playerPin: 12 }),
  encounter(71, 'Roman Skeleton Guards', foe('Skeleton Guard', 30, 6, 2), { count: 2 }),
  encounter(81, 'Knar and His Amulet', foe('Knar', 50, 5, 4), { unarmed: true }),
  encounter(109, 'The Loch Ness Monster', foe('Nessie', 50, 4, 3), { playerFirst: true }),
  encounter(110, 'Jade Cannibal Vampire', foe('Jade Vampire', 30, 5, 1, { consecutiveDrain: 3 }), { jadeGarlic: true }),
  encounter(122, 'Ghosts of the Torture Chamber', foe('Ghost', 10, 6, 0, { fixedDamage: 0, fatalFrom: 11 }), { count: 'twoDice' }),
  encounter('144-vine', 'Strangler Vine', foe('Strangler Vine', 25, 2, 0, { fixedDamage: 5, fatalFrom: 12 }), { section: 144 }),
  encounter('144-creeper', 'Crawling Creeper', foe('Crawling Creeper', 20, 2, 0, { fixedDamage: 0 }), { section: 144, creeper: true }),
  encounter(146, 'Smith the Smith: Test of Strength', foe('Smith', 45), { unarmed: true, contest: 'pseudo', openingLoss: 5 }),
  encounter(150, 'The Castle Sergeants-at-Arms', foe('Sergeant-at-Arms', 20, 5, 3, { armour: 2 }), { count: 2, contest: 'half' }),
  encounter(154, 'The Palace Nerd', foe('Nerd', 25, 5, 0, { blindRoll: 7, blindTurns: 3 }), { noFriendly: true }),
  encounter(166, 'The Orang-utiger', foe('Orang-utiger', 30, 4, 3, { evade: 1 })),
  encounter(169, 'Widow Wobbly', foe('Widow Wobbly', 25, 4, 2)),
  encounter(182, 'The Vampire Verger', foe('Vampire Verger', 20, 6, 0, { consecutiveFatal: 3, excludeSurprise: true }), { enemyFirst: true }),
  encounter(204, 'Vampires in the Dark Tower', foe('Vampire', 25, 6, 0, { fatalFrom: 12 }), { count: 'vampires' }),
  encounter(208, 'The Escaped Haggis', foe('Haggis', 40, 5, 6, { fatalFrom: 12 }), { playerAttacks: 2 }),
  encounter(213, 'The Welsh Haggis Farmer', foe('Haggis Farmer', null, 9, 0, { tripleDice: true, stunTurns: 2 }), { manualLife: true }),
  encounter(225, 'The Distillery Watchman', foe('Watchman', 25, 6, 2), { drunk: true }),
]);

export const LEGION_DREAMS = Object.freeze([
  encounter('dream7', 'Dreamtime: Astral Ninjas', foe('Astral Ninja', 15, 4, 3), { count: 'oneDie', dream: true, healPerFoe: 5 }),
]);

export const LEGION_COMPANIONS = Object.freeze({
  skeleton: foe('Rescued Skeleton', 30, 5, 2),
  orangutiger: foe('Orang-utiger', 30, 4, 3, { evade: 1, voluntary: true }),
  dragon: foe('Golden-eyed Baby Dragon', 7000, 6, 0, { remainingFights: 7 }),
});

export const LEGION_EQUIPMENT = Object.freeze([
  'Artificial Aardvark', 'Axe', 'Apple pie', 'Book', 'Bolas', 'Cup (tin, painted white)',
  'Crown (tin, painted gold)', 'Draughtboard', 'Erector set', 'Easel', 'Fingerstall',
  'Glass rod', 'Hacksaw', 'Iron bar', 'Jumping bean (Mexican)', 'Jellybaby (British)',
  'Koala bear (stuffed)', 'Leather gauntlets', 'Miniature mounted portrait of King Arthur',
  'Nails (1 lb bag)', 'Orange paint (1 tin)', 'Pear-shaped paperweight', 'Quantum caterpillar',
  'Rope (50 foot coil)', 'Saw', 'Tripwire (almost invisible)', 'Vorpal safety pin',
  'Waterskin (full)', 'Wineskin (full)', 'Whiskeyskin (full)', 'Xylophone', 'Zip fastener (primitive)',
]);
