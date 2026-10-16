export const definition = Object.freeze({
  id: 724, title: 'Кралската корона', family: 'fighting-fantasy',
  stateKey: 'sim724', i18nPrefix: 'battlesim724',
});

export const RULES_REVISION = 1;
export const DARTS_BOARD = '/api/books/724/reading-images/546273587eca60abe45196d707200147f7fec8ef8f650d870aaab530e8794c71.png';
export const CHARACTER_DEFAULTS = Object.freeze({
  goblinTeeth: 0, giantTeeth: 0, pebbles: 0, medicines: 0, fruits: 0, dartsGames: 0,
  armed: true, unarmedPenalty: 3, weaponPenalty: 0, chainmail: false, sharpened: false,
  nextFightSkillLoss: 0, nextFightDoubleDamage: false,
  insideFortress: false, horn: false, twoWeapons: false, forgottenMagic: false,
  reptileFear: false, disguised: false, nosePlugs: false, wax: false, skullcap: false,
  mirror: false, greenRing: false, pearlRing: false, sunJewel: false, goldJewel: false,
  firewater: false, holyWater: false, sand: false, rockDust: false, yellowPowder: false,
  oakStaff: false, boneBracelet: false, greenWig: false, pendulum: false, flute: false,
  amulet: false, glue: false, blackMask: false,
});
const enemy = (key, skill, stamina) => ({ key, skill, stamina });
const fight = (section, key, win, enemies, rules = {}) => ({ section, key, win, enemies, mode: 'sequential', ...rules });
const gateGuards = () => [enemy('guard1', 7, 7), enemy('guard2', 6, 7), enemy('guard3', 7, 8), enemy('guard4', 8, 7)];
const roomGuards = () => [enemy('guard1', 8, 6), enemy('guard2', 7, 7)];
const redEyes = () => [enemy('redEye1', 6, 3), enemy('redEye2', 5, 2), enemy('redEye3', 5, 3)];
const hydra = () => [enemy('hydra', 17, 24)];
const captain = () => [enemy('guard1', 8, 7), enemy('guard2', 7, 7), enemy('captain', 8, 9)];

export const ENCOUNTERS = Object.freeze([
  fight(29, 'wolf', 209, [enemy('wolf', 7, 7)]),
  fight(40, 'gateGuards', 129, gateGuards(), { mode: 'group', activeLimit: 2 }),
  fight(65, 'hydra', null, hydra(), { mode: 'hydra', entryDamage: 1, playerHitDestination: 458, enemyHitDestination: 305 }),
  fight(94, 'jaguar', 146, [enemy('jaguar', 8, 7)], { mercy: { floor: 2, destination: 80 } }),
  fight(107, 'demon', 351, [enemy('demon', 7, 7)], { roundLimit: 5, timeoutDestination: 172, timeoutFatal: true }),
  fight(110, 'sightmasters', 340, [enemy('sightmaster1', 7, 4), enemy('sightmaster2', 6, 4), enemy('sightmaster3', 6, 5)], { mode: 'group' }),
  fight(133, 'gateGuards', 129, gateGuards()),
  fight(145, 'captain', 463, captain(), { mode: 'captain', captainCheckpoints: [6, 3], mercyDestinations: [347, 445] }),
  fight(159, 'redEyes', 425, redEyes(), { mode: 'red-eyes', gazeInstruction: 316 }),
  fight(225, 'redEyes', 425, redEyes().slice(0, 2), { mode: 'red-eyes', gazeInstruction: 34 }),
  fight(264, 'drunkenGuards', 387, [enemy('guard1', 7, 2)], { roundLimit: 2, winOutcome: 'continue', timeoutDestination: 487, handoff: true }),
  fight(270, 'torturer', 230, [enemy('torturer', 9, 11)], { mode: 'whip', whipPenalty: 3, whipDuration: 3 }),
  fight(281, 'cook', 448, [enemy('cook', 7, 7)], { enemyFloor: 3 }),
  fight(332, 'mutant', 497, [enemy('mutant', 8, 8)], { roundLimit: 6, timeoutDestination: 128, timeoutFatal: true }),
  fight(346, 'skunk', 558, [enemy('skunk', 7, 6)], { mode: 'skunk', requiresCarryFrom: [490], entrySkillModifier: -2, optionalEscape: 469 }),
  fight(387, 'secondGuard', 219, [enemy('guard2', 8, 6)], { requiresCarryFrom: [264], carryPlayerOnly: true }),
  fight(391, 'captain', 463, [enemy('captain', 8, 9)], { requiresCarryFrom: [145], carryEnemyIndices: [2], carriedStaminaMaximum: [6], mercy: { floor: 3, destination: 445 } }),
  fight(394, 'towerGuard', 495, [enemy('guard1', 8, 6)], { missionFailureAfterVictory: true, holySpearInstantKill: true }),
  fight(396, 'roomGuard', 563, [enemy('guard1', 8, 6)], { winOutcome: 'continue', handoff: true }),
  fight(398, 'hydra', null, hydra(), { mode: 'hydra', requiresCarryFrom: [458], entryDamage: 2, playerHitDestination: 84, enemyHitDestination: 305 }),
  fight(442, 'mucalytic', 163, [enemy('mucalytic', 8, 9)], { maximumEnemyWounds: 3, woundLimitDestination: 576 }),
  fight(449, 'courtyardGuards', 401, [enemy('guard1', 7, 8), enemy('guard2', 7, 7)], { winOutcome: 'continue', alarmAfterVictory: true }),
  fight(450, 'birdman', 543, [enemy('birdman', 9, 11)]),
  fight(453, 'roomGuards', 44, roomGuards(), { mode: 'group', surpriseChoice: true }),
  fight(458, 'hydra', null, hydra(), { mode: 'hydra', requiresCarryFrom: [65], entryDamage: 2, playerHitDestination: 398, enemyHitDestination: 305 }),
  fight(462, 'birdmen', 365, [enemy('birdman1', 8, 10), enemy('birdman2', 9, 8), enemy('birdman3', 8, 9)]),
  fight(475, 'mucalytic', 443, [enemy('mucalytic', 8, 9)], { maximumEnemyWounds: 3, woundLimitDestination: 576 }),
  fight(487, 'alarmedGuards', 577, [enemy('guard1', 7, 2), enemy('guard2', 8, 6)], { requiresCarryFrom: [264], carryEnemyIndices: [0], winOutcome: 'continue', alarmAfterVictory: true }),
  fight(490, 'skunk', 558, [enemy('skunk', 7, 6)], { mode: 'skunk', firstHitEscape: 469, secondHitDestination: 346, handoff: true }),
  fight(510, 'blackElves', 566, [enemy('blackElf1', 7, 6), enemy('blackElf2', 7, 7), enemy('blackElf3', 6, 6)]),
  fight(548, 'jaguar', 146, [enemy('jaguar', 8, 7)], { mercy: { floor: 2, destination: 205 } }),
  fight(563, 'secondRoomGuard', 44, [enemy('guard2', 7, 7)], { requiresCarryFrom: [396], carryPlayerOnly: true, alternateWin: 176 }),
]);

const spell = (section, base, entryCost, changes = {}) => ({ section, base, entryCost, ...changes });
const component = (name, success = {}, failure = { entryDamage: 2 }) => ({ component: name, success, failure });
const fatal = destination => ({ resolution: 'loss', destination, fatal: true });
const avoid = destination => ({ resolution: 'continue', destination });
const win = destination => ({ resolution: 'win', destination });

export const SPELL_ENCOUNTERS = Object.freeze([
  spell(582, 107, 4, win(351)),
  spell(584, 225, 1, component('greenRing', avoid(12), fatal(769))),
  spell(588, 110, 1, component('skullcap', { mindRead: true })),
  spell(590, 225, 1, component('pebbles', fatal(769))),
  spell(592, 270, 1, component('skullcap', avoid(569))),
  spell(593, 145, 1, component('greenRing', avoid(463))),
  spell(598, 450, 4, win(543)),
  spell(599, 40, 1, component('skullcap')),
  spell(602, 281, 1, component('medicine', { healing: 2, consumeMedicine: 1, enemyStaminaModifier: 4 })),
  spell(605, 462, 1, component('sand', { ...fatal(605), consume: 'sand' })),
  spell(606, 442, 1, component('firewater', { consume: 'firewater', descriptiveStrengthOnly: true }, avoid(516))),
  spell(609, 475, 2, { entryDamage: 1, ...fatal(386) }),
  spell(611, 490, 1, component('mirror', { entryDamage: 4, ...avoid(469) })),
  spell(613, 449, 2, { entryDamage: 2 }),
  spell(614, 510, 2),
  spell(619, 270, 1, component('greenRing')),
  spell(622, 332, 1, component('yellowPowder', { consume: 'yellowPowder' }, {})),
  spell(623, 65, 4, avoid(305)),
  spell(627, 110, 1, component('yellowPowder', { consume: 'yellowPowder', playerAttackModifier: 3, optionalEscape: 135 })),
  spell(628, 107, 1, component('holyWater', { consume: 'holyWater', ...fatal(172) }, fatal(172))),
  spell(636, 40, 1, component('coin', { consumeCoin: true, enemyAttackModifier: -2 })),
  spell(638, 490, 2, { enemySkillModifier: -3, optionalEscape: 469 }),
  spell(639, 159, 1, component('skullcap', win(425), { entryDamage: 2, ...fatal(769) })),
  spell(641, 453, 1, { entryDamage: 3 }),
  spell(642, 145, 1, component('flute', { destroy: 'flute' })),
  spell(646, 394, 0, component('goblinTeeth', { summon: 'goblin', summonCostPer: 1 })),
  spell(647, 462, 1, component('pendulum', {}, avoid(74))),
  spell(651, 270, 1, component('pebbles', { volley: { dice: 1, damage: 1, missLimit: 2 } }, avoid(452))),
  spell(655, 394, 1, component('oakStaff', win(495))),
  spell(656, 40, 2, { excludeEnemy: true, scheduledDamage: { round: 4, damage: 2 } }),
  spell(657, 110, 2, { entryDamage: 2 }),
  spell(660, 225, 4, avoid(425)),
  spell(661, 450, 1, component('greenWig', {}, { entryDamage: 3 })),
  spell(664, 159, 1, component('pearlRing', {}, { entryDamage: 2, ...fatal(769) })),
  spell(665, 475, 1, { ...win(443), smellDamage: 3 }),
  spell(668, 281, 1, component('boneBracelet', avoid(448))),
  spell(670, 449, 1, component('skullcap')),
  spell(671, 510, 1, { smellDamage: 3, nosePlugsEscape: 566 }),
  spell(675, 442, 1, component('rockDust', { consume: 'rockDust', ...win(51), alternateWin: 96 }, {})),
  spell(676, 270, 1, component('pebbles', { volley: { dice: 1, damage: 1, missLimit: 2 } }, avoid(557))),
  spell(677, 332, 2, avoid(426)),
  spell(679, 145, 2, { disableEnemy: true }),
  spell(683, 107, 4, win(351)),
  spell(686, 490, 1, component('amulet', { entryDamage: 2, ...avoid(469) }, { entryDamage: 3 })),
  spell(688, 453, 1, component('pearlRing', avoid(176))),
  spell(689, 65, 2, { playerAttackModifier: 4 }),
  spell(690, 281, 2),
  spell(691, 270, 1, component('sunJewel', avoid(452))),
  spell(695, 225, 4, fatal(769)),
  spell(698, 332, 1),
  spell(699, 110, 2, { entryDamage: 2 }),
  spell(701, 450, 1, component('oakStaff')),
  spell(707, 462, 1, component('goldJewel', avoid(479), { entryDamage: 3 })),
  spell(708, 159, 1, fatal(769)),
  spell(709, 270, 1, { smellDamage: 3, ...avoid(230) }),
  spell(711, 449, 2),
  spell(712, 394, 2),
  spell(715, 475, 2, { enemySkillModifier: -4 }),
  spell(716, 450, 2, avoid(441)),
  spell(717, 107, 1, fatal(172)),
  spell(718, 40, 4, { excludeEnemy: true }),
  spell(720, 159, 2, fatal(720)),
  spell(721, 394, 1, component('pearlRing', win(495))),
  spell(722, 145, 1),
  spell(726, 281, 2, { consumeItem: true }),
  spell(727, 510, 1, { entryDamage: 2 }),
  spell(732, 449, 1, component('wax', { doubleWeaponDamage: true })),
  spell(738, 453, 1, component('greenWig', { optionalEscape: 176 })),
  spell(739, 110, 2, { entryDamage: 2 }),
  spell(740, 442, 1, component('sunJewel', avoid(559), {})),
  spell(744, 475, 1, component('mirror', { destroy: 'mirror' }, { entryDamage: 2, ...avoid(515) })),
  spell(745, 225, 1, component('sunJewel', {}, fatal(769))),
  spell(747, 145, 1, component('goldJewel', avoid(301), {})),
  spell(748, 159, 1, component('mirror', { mirrorCopies: true }, fatal(769))),
  spell(752, 270, 1, component('sunJewel', avoid(251))),
  spell(755, 281, 1, component('mirror', fatal(629))),
  spell(756, 453, 1, component('glue', { consume: 'glue' })),
  spell(757, 490, 1, component('greenWig', { optionalEscape: 469 })),
  spell(758, 462, 1, component('pearlRing', { entryLuckEscape: 479 })),
  spell(762, 442, 2),
  spell(765, 453, 1, component('wax', { doubleWeaponDamage: true })),
  spell(766, 40, 2, { entryDamage: 2 }),
  spell(770, 270, 1, component('sunJewel', avoid(557))),
  spell(775, 510, 1, component('pebbles', { volley: { dice: 2, damage: 3 } })),
  spell(778, 450, 1, component('amulet')),
  spell(780, 475, 1, component('greenWig', fatal(386), { entryDamage: 2, ...avoid(515) })),
  spell(784, 449, 1, component('pebbles', { volley: { dice: 2, frightens: true } }, {})),
  spell(787, 110, 1, component('skullcap', { mindRead: true })),
  spell(788, 490, 2, { consumeItem: true, entryDamage: 1, optionalEscape: 469 }),
  spell(789, 394, 1, component('giantTooth', { summon: 'giant', consume: 'giantTooth' })),
  spell(790, 462, 4, { excludeFirst: true }),
  spell(793, 510, 2),
  spell(794, 270, 1, component('pebbles', { volley: { dice: 1, damage: 1, missLimit: 2 } }, avoid(251))),
  spell(798, 107, 1, component('amulet', fatal(540), fatal(172))),
]);

export function encounterFor(section) {
  const variant = SPELL_ENCOUNTERS.find(value => value.section === section);
  const original = ENCOUNTERS.find(value => value.section === (variant?.base ?? section));
  if (!original) throw new RangeError('Unknown Crown of Kings encounter');
  return structuredClone(variant ? { ...original, ...variant, spell: true, sourceSection: original.section } : original);
}

const spellGroups = {
  fireball: [582, 598, 623], teleport: [584, 593, 619], mindRead: [588, 592, 599, 639, 670, 787],
  pebbles: [590, 651, 676, 775, 784, 794], healing: [602], quicksand: [605], strength: [606],
  confuse: [609, 656, 679], mirror: [611, 744, 748, 755], darkness: [613, 677, 739, 766],
  escape: [614, 711], speed: [622, 627], resurrect: [628, 641, 708], shield: [636], slow: [638, 715, 720],
  dance: [642], goblins: [646], sleep: [647, 727], freeze: [655, 701], copies: [657], forcefield: [660],
  beastTalk: [661, 757], invisible: [664, 688, 721, 758], stench: [665, 671, 709], illusion: [668, 698],
  petrify: [675], bolt: [683, 695], levitate: [686, 778, 798], grow: [689], antiMagic: [690, 699, 793],
  light: [691, 740, 745, 752, 770], friend: [707, 747], fall: [712], sap: [716, 762], fear: [717],
  clumsy: [718, 790], farsight: [722], treasure: [726, 788], wax: [732, 765], talk: [738, 780], glue: [756], giant: [789],
};
export const SPELL_LABELS = Object.freeze(Object.fromEntries(Object.entries(spellGroups).flatMap(([key, sections]) => sections.map(section => [section, key]))));
