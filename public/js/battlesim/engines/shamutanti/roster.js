const enemy = (name, skill, stamina) => ({ name, skill, stamina });
const encounter = (section, enemies, win, extra = {}) => ({ section, enemies, win, ...extra });
const giant = () => enemy('mountainGiant', 9, 11);
const manticore = () => enemy('manticore', 12, 18);
const goblins = () => [enemy('goblin', 5, 4), enemy('goblin', 6, 4), enemy('goblin', 5, 5)];

export const SHAMUTANTI_FIGHTS = [
  encounter(2, [enemy('snake', 7, 8)], 105, { entryCost: 1 }),
  encounter(20, [enemy('skunk', 7, 5)], 193, { playerAttack: -2 }),
  encounter(47, [enemy('goblin', 7, 6)], 186),
  encounter(74, [enemy('wolfhound', 7, 6)], 50),
  encounter(87, [enemy('woodMonster', 8, 6)], 169),
  encounter(99, [enemy('troll', 8, 7)], 177),
  encounter(104, [enemy('bandit', 7, 6), enemy('bandit', 7, 6)], 56),
  encounter(117, [enemy('flanker', 8, 6)], 153, { mercy: { enemyMaximum: 3, playerMinimum: 6, section: 187 } }),
  encounter(123, [], null, { night: true }),
  encounter(162, [giant()], 265),
  encounter(203, [enemy('elvin', 6, 4)], 121, { entryCost: 1, enemyAttack: 2 }),
  encounter(207, [giant()], 265),
  encounter(217, goblins(), 155),
  encounter(227, [manticore()], 456, { sting: true }),
  encounter(285, [enemy('ogre', 8, 7)], 15),
  encounter(317, [enemy('troll', 4, 7)], 177, { entryCost: 4, spell: true, recoveringWeapon: true }),
  encounter(325, [manticore()], 456, { entryCost: 2, spell: true, sting: true, temporaryEnemySkill: { skill: 6, rounds: 4 } }),
  encounter(328, [enemy('goblin', 7, 6)], 186, { entryCost: 1, spell: true, wax: true }),
  encounter(338, [enemy('mountainGiant', 6, 11)], 265, { entryCost: 4, spell: true }),
  encounter(356, [enemy('elvin', 6, 4)], 121, { entryCost: 2, spell: true, playerSkillMultiplier: 2, enemyAttack: 2 }),
  encounter(361, [giant()], 265, { entryCost: 1, spell: true, summon: { name: 'magicGiant', skill: 8, stamina: 9 } }),
  encounter(369, [manticore()], 456, { spell: true, sting: true, goblinStingFatal: true,
    summon: { name: 'goblin', skill: 5, stamina: 5, multiple: true }, otherSpell: 420 }),
  encounter(375, [enemy('ogre', 4, 7)], 15, { entryCost: 2, spell: true }),
  encounter(383, [enemy('woodMonster', 8, 6)], 169, { entryCost: 2, spell: true, temporaryEnemySkill: { skill: 4, rounds: 4 } }),
  encounter(386, [enemy('troll', 8, 7)], 177, { entryCost: 1, spell: true, shield: true }),
  encounter(388, [manticore()], 456, { entryCost: 1, spell: true, sting: true,
    summon: { name: 'magicGiant', skill: 8, stamina: 9 }, otherSpell: 420 }),
  encounter(400, [enemy('ogre', 8, 7)], 15, { entryCost: 5, spell: true, shield: true }),
  encounter(407, goblins().slice(1), 155, { entryCost: 4, spell: true, morale: true, allFled: 202 }),
  encounter(411, [giant()], 265, { entryCost: 2, spell: true, playerSkillMultiplier: 2 }),
  encounter(425, [enemy('wolfhound', 7, 6)], 50, { spell: true,
    summon: { name: 'goblin', skill: 5, stamina: 5, multiple: true }, missingSummonCost: 5 }),
  encounter(441, [enemy('elvin', 6, 4)], 121, { entryCost: 1, spell: true, shield: true, enemyAttack: 2 }),
  encounter(442, goblins(), 155, { entryCost: 1, spell: true, wax: true }),
];

export const SHAMUTANTI_NIGHT_ENEMIES = [
  enemy('giantBat', 5, 5), enemy('giantBat', 5, 5),
  enemy('wolfhound', 7, 6), enemy('vampireWolf', 8, 9), null, null,
];
