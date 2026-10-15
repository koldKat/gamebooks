export const definition = Object.freeze({
  id: 723, title: 'Седемте дракона', family: 'fighting-fantasy',
  stateKey: 'sim723', i18nPrefix: 'battlesim723',
});

export const RULES_REVISION = 1;
export const INITIAL_GOLD = 20;
export const INITIAL_PROVISIONS = 2;
export const MEAL_HEALING = Object.freeze({ first: 2, later: 1 });

const enemy = (key, skill, stamina) => ({ key, skill, stamina });
const fight = (section, win, enemies, rules = {}) => ({ section, win, enemies, ...rules });
const ghost = () => enemy('deathwraith', 9, 9);
const fire = () => enemy('fireSerpent', 13, 12);
const water = () => enemy('waterSerpent', 10, 11);
const cats = (section, win, rules) => fight(section, win, [enemy('snattacat', 7, 9)], {
  mode: 'snattacats', invisibleAttackPenalty: 2, ...rules,
});

export const ENCOUNTERS = Object.freeze([
  fight(27, 106, [enemy('stranglebush', 5, 8)], { harmlessEnemy: true, roundLimit: 5, timeoutDestination: 305 }),
  fight(32, 205, [ghost()], { enemyFloor: 3 }),
  fight(42, 306, [fire()], { entrySkillLoss: 2, entryDamage: 6 }),
  fight(45, 62, [enemy('moonSerpent', 13, 10)]),
  fight(49, 110, [enemy('ferryman', 7, 8)], { enemyFloor: 4 }),
  fight(52, 309, [enemy('goldenSnake', 6, 6)], { enemyDamageDie: 6 }),
  fight(54, 220, [enemy('earthSerpent', 12, 14)]),
  fight(59, 4, [enemy('timeSerpent', 3, 14)]),
  fight(67, 75, [water()]),
  fight(70, 154, [enemy('centaur1', 8, 7), enemy('centaur2', 7, 6), enemy('centaur3', 7, 8)], {
    mode: 'centaurs', chooseOrder: true,
    arrows: { count: 3, hitMaximum: 2, damage: 2, skillPenaltyAfterHits: 2, skillPenalty: 2 },
    surrender: { enemiesDefeated: 2, lastEnemyWounds: 2, destination: 35 },
  }),
  cats(74, 160, { rollCount: true }),
  fight(84, 205, [ghost()], { enemyFloor: 3 }),
  cats(99, 160, { count: 4 }),
  fight(139, 20, [enemy('wildBear', 8, 8)]),
  fight(148, 306, [enemy('weakenedFireSerpent', 5, 6)]),
  fight(155, 62, [enemy('weakenedMoonSerpent', 7, 6)]),
  fight(172, 75, [water()]),
  fight(188, 251, [enemy('klattaman1', 8, 7), enemy('klattaman2', 8, 6), enemy('klattaman3', 7, 7)], {
    mode: 'separate-attacks', chooseTarget: true,
  }),
  fight(194, 277, [enemy('marshGoblin1', 7, 6), enemy('marshGoblin2', 6, 5), enemy('marshGoblin3', 6, 6), enemy('marshGoblin4', 5, 6)], { fleeDestination: 168 }),
  fight(202, 260, [enemy('snake1', 7, 3), enemy('snake2', 6, 1), enemy('snake3', 6, 4),
    enemy('snake4', 5, 2), enemy('snake5', 6, 2), enemy('snake6', 7, 1), enemy('snakeCharmer', 6, 7)], {
    mode: 'snake-charmer', charmerRoundLimit: 5, timeoutDestination: 312,
    snakeBiteDoublesSubsequentStaminaLoss: true,
  }),
  cats(246, 41, { count: 1, entryDamage: 2, startsVisible: true, roundLimit: 6, timeoutDestination: 99 }),
  fight(256, 95, [enemy('fireFox', 7, 6)], { mode: 'fire-fox', fireDamage: 5, fireSkillCost: 1, fireStaminaCost: 1 }),
  fight(258, null, [enemy('nightHawk1', 7, 5), enemy('nightHawk2', 6, 5), enemy('nightHawk3', 7, 5), enemy('nightHawk4', 7, 4)], {
    mode: 'night-hawks', playerAttackDice: 1, roundLimit: 3, timeoutDestination: 314, chooseTarget: true,
  }),
  fight(261, 213, [enemy('airSerpent', 11, 14)], { mode: 'air-serpent', playerConsecutiveWins: 2, playerPairDamage: 3, enemyStreakDamage: [1, 2, 4, 8] }),
  fight(266, 306, [fire()]),
  fight(268, 222, [enemy('rockDemon', 10, 12)], { mode: 'rock-demon', trappedAttackPenalty: 2, escapeAttemptDamage: 2, strictSkillEscape: true }),
  fight(280, 240, [enemy('klattamanChampion', 9, 8)]),
  fight(286, 24, [enemy('baduBeetle', 7, 9)], { mode: 'acid-beetle', firstWoundDestination: 216 }),
  fight(291, 75, [enemy('flyingFish', 8, 8)], { mode: 'flying-fish', requireManualCount: true }),
  fight(319, 306, [fire()]),
  fight(422, 154, [enemy('confusedCentaur', 1, 7), enemy('centaur2', 7, 6), enemy('centaur3', 7, 8)], {
    spell: true, entryCost: 2, reverseOrder: true, surrender: { enemiesDefeated: 2, destination: 35 },
  }),
  fight(452, 143, [enemy('baldMan', 6, 9)], { spell: true, entryCost: 2, mercyDestination: 72 }),
  fight(487, 326, [enemy('confusedDeathwraith', 5, 9)], {
    spell: true, entryCost: 2, mode: 'confused-ghost', normalSkill: 9, recoveryRollMinimum: 5,
    recoveryDamageRoll: 6, recoveryDamage: 2, mercyFloor: 3, mercyDestination: 205,
  }),
]);

export function encounterFor(section) {
  const variant = SPELL_ENCOUNTERS.find(value => value.section === section);
  const encounter = ENCOUNTERS.find(value => value.section === (variant?.base ?? section));
  if (!encounter) throw new RangeError('Unknown Seven Serpents encounter');
  return structuredClone(variant ? { ...encounter, ...variant, spell: true, sourceSection: variant.base } : encounter);
}

const spell = (section, base, entryCost, changes = {}) => ({ section, base, entryCost, ...changes });
export const SPELL_ENCOUNTERS = Object.freeze([
  spell(336, 42, 2, { entryDamage: 0, entrySkillLoss: 0 }),
  spell(340, 280, 2, { enemySkillModifier: -3 }),
  spell(343, 99, 0, { wastedTeeth: 2, failureDamage: 3 }),
  spell(352, 268, 1, { entryDamage: 2 }),
  spell(358, 74, 0, { wastedTeeth: 2, failureDamage: 3 }),
  spell(360, 291, 1, { component: 'wax', success: { playerDamage: 4 }, failure: { entryDamage: 2 } }),
  spell(364, 45, 2, { entryDamage: 2 }),
  spell(367, 54, 2),
  spell(372, 268, 1, { component: 'wax', success: { playerDamage: 4 }, failure: { entrySkillLoss: 1 } }),
  spell(373, 291, 1, { component: 'oakStaff', success: { enemySkillModifier: -1 }, failure: { entryDamage: 2 } }),
  spell(376, 99, 1, { component: 'glue', success: { testEntryLuck: true, luckyCount: 3 }, failure: { entryDamage: 3 } }),
  spell(382, 268, 1, { component: 'goldMirror', success: { mirrorAlly: true }, failure: { entryDamage: 3 } }),
  spell(391, 70, 2, { excludeEnemy: true }),
  spell(392, 45, 1, { entryDamage: 2 }),
  spell(398, 74, 1, { component: 'pearlRing', success: { avoidDestination: 271 }, failure: { playerSkillModifier: -2 } }),
  spell(402, 280, 1, { entryDamage: 3 }),
  spell(403, 291, 1, { smellDamage: 3 }),
  spell(405, 45, 1, { entryDamage: 2 }),
  spell(413, 45, 2, { entryDamage: 2 }),
  spell(414, 172, 1, { component: 'wax', success: { playerDamage: 3 }, failure: { entryDamage: 3 } }),
  spell(415, 139, 2),
  spell(416, 256, 1, { component: 'greenWig', failure: { entryDamage: 2 } }),
  spell(420, 280, 1, { component: 'blackMask', success: { avoidDestination: 173 }, failure: { entryDamage: 2 } }),
  spell(423, 74, 1, { component: 'crystalOrb', success: { avoidDestination: 271 }, failure: { entryDamage: 3 } }),
  spell(424, 32, 2),
  spell(431, 99, 1, { component: 'rockDust', success: { testEntryLuck: true, luckyCount: 1, unluckyCount: 3 }, failure: { entryDamage: 3 } }),
  spell(433, 32, 1, { entryDamage: 2 }),
  spell(436, 172, 1, { component: 'coin', success: { enemyAttackModifier: -2 } }),
  spell(439, 188, 1, { component: 'boneBracelet', success: { avoidDestination: 251 }, failure: { entryDamage: 2 } }),
  spell(440, 286, 2, { playerSkillMultiplier: 2 }),
  spell(443, 54, 1, { component: 'brassPendulum', failure: { entryDamage: 3 } }),
  spell(445, 70, 2, { extraArrow: true }),
  spell(449, 291, 1, { component: 'fireWater', failure: { entryDamage: 2 } }),
  spell(451, 74, 1, { component: 'glue', success: { optionalEntryLuck: true, luckyCountReduction: 1 }, failure: { entryDamage: 3 } }),
  spell(456, 188, 1, { component: 'blackMask', success: { enemyAttackModifier: -2 }, failure: { entryDamage: 2 } }),
  spell(459, 194, 0, { summonedGoblins: true }),
  spell(467, 99, 1, { component: 'crystalOrb', success: { avoidDestination: 41 }, failure: { entryDamage: 3 } }),
  spell(473, 172, 1, { component: 'sand', failure: { entryDamage: 3 } }),
  spell(474, 42, 1, { component: 'galehorn', success: { entryDamage: 0, entrySkillLoss: 0, playerSkillModifier: 2 } }),
  spell(475, 188, 1, { component: 'giantTooth', success: { usedGiantTooth: true }, failure: { entryDamage: 2 } }),
  spell(476, 70, 2, { extraArrow: true }),
  spell(488, 286, 4, { firstRoundEnemyAttackModifier: 4 }),
  spell(494, 280, 2, { entryDamage: 2 }),
  spell(495, 70, 1, { extraArrow: true }),
]);
