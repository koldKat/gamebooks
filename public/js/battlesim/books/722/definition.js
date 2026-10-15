export const definition = Object.freeze({
  id: 722, title: 'Пристанището на клопките', family: 'fighting-fantasy', stateKey: 'sim722', i18nPrefix: 'battlesim722',
});

export const RULES_REVISION = 1;
export const INITIAL_GOLD = 20;
export const INITIAL_PROVISIONS = 2;
export const ARROW_LIMIT = 10;

// Original English edition, PDF pages: Bulgarian prize footers are illegible.
export const WHEEL_PAGE_COUNT = 212;
export const WHEEL_PRIZES = Object.freeze({
  39: 5, 47: 10, 57: 5, 67: 20, 87: 5, 95: 5, 101: 20, 119: 5,
  129: 10, 145: 20, 153: 5, 173: 5, 181: 20, 187: 10, 199: 5,
});

const enemy = (key, skill, stamina) => ({ key, skill, stamina });
const fight = (section, win, enemies, rules = {}) => ({ section, win, enemies, ...rules });
const slime = (section, rules = {}) => fight(section, 196, [enemy('slimeEater', 7, 11)], rules);
const beast = (section, rules = {}) => fight(section, 14, [enemy('bristleBeast', 5, 7)], rules);
const chain = (section, rules = {}) => fight(section, 195, [enemy('chainMaker', 8, 7)], { lowStaminaTies: 5, ...rules });
const double = (section, rules = {}) => fight(section, 137, [], { mode: 'double', ...rules });
const limbs = (section, rules = {}) => fight(section, 276, [
  enemy('head', 3, 1), enemy('torso', 2, 1), enemy('leftArm', 3, 1),
  enemy('rightArm', 3, 1), enemy('leftLeg', 2, 1), enemy('rightLeg', 2, 1),
], { mode: 'limbs', ...rules });
const harpies = (section, rules = {}) => fight(section, 74, [enemy('harpy1', 7, 6), enemy('harpy2', 6, 6)], {
  mode: 'harpies', ally: enemy('beggar', 2, 8), ...rules,
});
const contestants = () => [enemy('barbarian', 7, 8), enemy('ogre', 9, 12)];
const spectator = (section, rules = {}) => fight(section, 136, contestants(), { mode: 'spectator', ...rules });
const champion = (section, rules = {}) => fight(section, 263, contestants(), { mode: 'champion', prize: 15, ...rules });
const deathwraith = (section, rules = {}) => fight(section, 54, [enemy('deathwraith', 9, 8)], rules);

export const ENCOUNTERS = Object.freeze([
  limbs(11),
  fight(13, 105, [enemy('assassin', 7, 8)], { openingArrow: true }),
  fight(44, 137, [enemy('paintbrush', 8, 5)], { harmlessEnemy: true, roundLimit: 5, timeoutDestination: 67 }),
  fight(55, 117, [enemy('mantis', 6, 5)], { fatalGrab: true }),
  fight(58, 251, [enemy('blackElf1', 6, 5), enemy('blackElf2', 7, 4), enemy('blackElf3', 5, 5)], { intoxicatedEnemies: true }),
  double(67),
  fight(76, 117, [enemy('mantis', 6, 5)], { fatalGrab: true }),
  slime(77),
  beast(95),
  harpies(118),
  chain(119),
  deathwraith(147, { mode: 'silver-arrows', openingSilverArrow: true, arrowLimit: ARROW_LIMIT }),
  deathwraith(151, { immune: true, firstPlayerHitDestination: 189 }),
  deathwraith(189, { immune: true, winningRoundLuckDestination: 38 }),
  spectator(234),
  fight(243, 29, [enemy('flayer', 6, 7)], { incomingDamage: 3, firstEnemyHitDestination: 114 }),
  fight(256, 11, [enemy('corpse', 6, 6)], { firstPlayerHitDestination: 11 }),
  fight(299, 326, [enemy('bronzeStatue', 10, 15)], { entryDamage: 3, immune: true, firstPlayerHitDestination: 326 }),
  fight(311, 153, [enemy('sprite', 5, 6), enemy('pixie', 5, 5)], { mode: 'separate-attacks', enemyFloor: 2 }),
  fight(321, null, [enemy('sprite', 5, 6), enemy('pixie', 5, 5)], {
    mode: 'street-alliance', reinforcement: enemy('dwarf', 6, 6), reinforcementAfter: 2,
    allyDestinations: { sprite: 293, pixie: 335 },
  }),
  champion(323),
  double(339, { entryCost: 1, wax: true, missingItemDamage: 2 }),
  double(356, { entryCost: 2 }),
  double(364, { entryCost: 5 }),
  harpies(365, { summonGoblins: true, summonCost: 1, goblin: enemy('goblin', 5, 5), missingItemCost: 1 }),
  chain(370, { entryCost: 1, wax: true, missingItemDamage: 2 }),
  double(385, { entryCost: 2, enemySkillModifier: -3 }),
  harpies(389, { entryCost: 1, shield: true, missingItemDestination: 310 }),
  slime(393, { entryCost: 2, temporaryEnemySkill: { skill: 4, rounds: 4 } }),
  fight(411, null, [enemy('bronzeStatue', 10, 15)], {
    mode: 'giant-statue', entryCost: 1, summonGiant: true, ally: enemy('giant', 8, 9),
    missingItemDamage: 1, missingItemDestination: 299, alternateWins: [104, 56],
    firstPlayerHitDestination: 326,
  }),
  spectator(416, { entryCost: 1, sunJewel: true, protectionRounds: 3, protectedDamage: 1 }),
  limbs(435, { entryCost: 2, headIllusions: true }),
  limbs(441, { entryCost: 1, explosivePebbles: true, missingItemDamage: 2 }),
  fight(443, 14, [enemy('bristleBeast', 4, 7)], { entryCost: 2, entryDamage: 1, otherSpell: true }),
  limbs(450, { entryCost: 1, shield: true, missingItemDamage: 2 }),
  champion(451, { entryCost: 1, summonGiant: true, ally: enemy('giant', 8, 9), missingItemDestination: 323 }),
  beast(459, { entryCost: 1, entryDamage: 3 }),
  spectator(469, { entryCost: 1, boneBracelet: true, illusionDamage: 2 }),
  harpies(473, { entryCost: 2, confuseHarpy: true }),
  slime(479, { entryCost: 1 }),
  harpies(480, { entryCost: 1, entryDamage: 2 }),
  slime(488, { entryCost: 1 }),
  fight(502, 195, [enemy('chainMaker', 5, 7)], { entryCost: 2, lowStaminaTies: 5 }),
  slime(505),
  spectator(507, { entryCost: 4, clumsyRounds: 6 }),
  double(508, { entryCost: 1, entryDamage: 2 }),
]);
