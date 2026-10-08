const keys = ['strength', 'speed', 'stamina', 'courage', 'skill', 'luck', 'charm', 'attraction', 'lifePoints'];
const profile = (name, values, weapon, armour = 'none') => Object.freeze({ name,
  ...Object.fromEntries(keys.map((key, i) => [key, values[i]])), maxLife: values[8], weapon, armour });

export const ANCIENT_EVIL_ROSTER = Object.freeze({
  largeMan: profile('Large Man', [50, 48, 48, 70, 61, 30, 25, 35, 367], null),
  slimefiend: profile('Slimefiend', [125, 75, 100, 120, 50, 70, 0, 0, 540], 10),
  nazar: profile('Lord Nazar', [60, 50, 48, 55, 16, 40, 20, 25, 314], 5),
  serpent: profile('Serpent', [75, 50, 55, 80, 25, 16, 2, 0, 303], 0),
  guardian: profile('Police Guardian', [60, 55, 50, 40, 40, 30, 8, 30, 313], 10, 'leather'),
  giant: profile('Giant', [100, 50, 90, 95, 75, 50, 40, 30, 530], 25),
  assassin: profile('Assassin', [60, 95, 65, 80, 70, 50, 25, 40, 485], 7),
  ferryman: profile('Ferryman', [55, 65, 35, 85, 20, 55, 55, 0, 370], 15),
  bandit: profile('Bandit', [50, 48, 48, 40, 20, 30, 16, 20, 272], 10),
  thug: profile('Young Thug', [60, 55, 65, 70, 20, 15, 10, 25, 320], 10),
  thief: profile('Thief', [48, 95, 60, 25, 60, 55, 50, 40, 433], 7, 'leather'),
  berserker: profile('Berserker', [90, 80, 95, 100, 50, 30, 30, 40, 515], 10),
  troll: profile('Troll', [96, 59, 80, 60, 45, 25, 10, 5, 380], 8),
  fieryDragon: profile('Fiery Dragon', [100, 100, 100, 100, 100, 100, 100, 100, 800], 10),
  freya: profile('Freya', [60, 80, 40, 70, 20, 20, 80, 99, 469], 3),
  demon: profile('Minor Demon', [150, 100, 100, 120, 70, 100, 0, 0, 640], 10),
  figure: profile('Animated Figure', [64, 48, 56, 56, 15, 48, 24, 0, 311], 15),
  sword: profile('Animated Sword', [48, 56, 56, 56, 25, 48, 48, 0, 337], 15),
  sorcerer: profile('Ancient Sorcerer', [99, 99, 99, 99, 99, 99, 99, 0, 693], 0),
  dragon: profile('Dragon', [150, 50, 100, 90, 60, 80, 90, 10, 630], 15),
  stalker: profile('Night Stalker', [50, 50, 50, 50, 50, 50, 50, 50, 400], 5),
  guard: profile("Freya's Guard", [58, 36, 90, 90, 44, 48, 40, 26, 432], 10, 'plate'),
});

const encounter = (section, enemies, options = {}) => Object.freeze({ section: String(section), enemies, ...options });
export const ANCIENT_EVIL_ENCOUNTERS = Object.freeze([
  encounter(7, ['largeMan'], { rule: 'plank', playerWeapon: null, noMagic: true }),
  encounter(10, ['slimefiend'], { rule: 'slime-poison' }),
  encounter(12, ['nazar'], { playerWeapon: 5 }),
  encounter(52, ['serpent'], { rule: 'serpent', openingCheck: true }),
  encounter(61, ['guardian', 'guardian', 'guardian']),
  encounter(70, ['giant'], { rule: 'club' }),
  encounter(95, ['guardian'], { enemyArmour: 'none' }),
  encounter(97, ['guardian', 'guardian', 'guardian']),
  encounter(100, ['assassin', 'assassin'], { rule: 'lethal', canAvoid: true }),
  encounter(102, ['ferryman']),
  encounter(119, ['bandit', 'bandit', 'bandit']),
  encounter(127, ['thug', 'thug']),
  encounter(137, ['thief']),
  encounter(140, ['berserker', 'berserker', 'berserker']),
  encounter(145, ['guardian', 'guardian', 'guardian']),
  encounter(159, ['troll', 'troll']),
  encounter(165, ['bandit', 'bandit'], { openingPlayerEach: true }),
  encounter(174, ['fieryDragon'], { rule: 'fiery-dragon', attackMagicImmune: true }),
  encounter(176, ['freya'], { rule: 'freya' }),
  encounter(179, ['bandit', 'bandit']),
  encounter(183, Array(6).fill('bandit')),
  encounter(188, ['demon'], { rule: 'demon', attackMagicImmune: true }),
  encounter(197, ['figure', 'sword'], { sequential: true }),
  encounter(208, Array(3).fill('sorcerer'), { rule: 'sorcerers', sequential: true, attackMagicImmune: true }),
  encounter(209, ['dragon'], { rule: 'dragon-fumes' }),
  encounter(215, ['stalker'], { rule: 'stalker' }),
  encounter(225, ['guard'], { rule: 'lethal' }),
  encounter(229, ['freya'], { rule: 'freya', passiveAttempts: 3 }),
  encounter(233, ['freya'], { rule: 'freya', passiveAttempts: 6 }),
  encounter(235, ['freya'], { rule: 'freya', passiveAttempts: 9 }),
  encounter(237, ['freya'], { rule: 'freya', passiveAttempts: 12 }),
  encounter(245, ['demon'], { rule: 'demon', attackMagicImmune: true }),
]);

export function prepareAncientEvilEncounter(section, player, options = {}) {
  const encounter = ANCIENT_EVIL_ENCOUNTERS.find(e => e.section === String(section));
  if (!encounter) throw new Error('Unknown Ancient Evil encounter');
  const preparedPlayer = structuredClone(player);
  if (Object.hasOwn(encounter, 'playerWeapon')) preparedPlayer.weapon = encounter.rule === 'plank' ? options.playerWeapon : encounter.playerWeapon;
  if (encounter.rule === 'plank' && !Number.isFinite(preparedPlayer.weapon)) throw new Error("Supply the staff's unprinted weapon modifier");
  if (encounter.rule !== 'freya') delete preparedPlayer.freyaPoison;
  if (preparedPlayer.magicSection !== String(section)) preparedPlayer.magicArmour = 0;
  preparedPlayer.magicSection = String(section);
  const enemies = encounter.enemies.map(key => structuredClone(ANCIENT_EVIL_ROSTER[key]));
  if (encounter.enemyArmour) enemies.forEach(e => { e.armour = encounter.enemyArmour; });
  if (encounter.rule === 'plank') enemies[0].weapon = options.staffWeapon;
  return { encounter: structuredClone(encounter), player: preparedPlayer, enemies };
}
