export const definition = Object.freeze({
  id: 710, title: 'Храмът на ужасите', family: 'fighting-fantasy', stateKey: 'sim710', i18nPrefix: 'battlesim710',
});

const enemy = (key, skill, stamina) => ({ key, skill, stamina });
const fight = (section, win, enemies, rules = {}) => ({ section, win, enemies, ...rules });

export const ENCOUNTERS = Object.freeze([
  fight(7, 33, [enemy('lizardMan', 9, 8)]),
  fight(13, 165, [enemy('tentacledCreature', 8, 10)], { drowning: true }),
  fight(28, 168, [enemy('needleFly1', 5, 6), enemy('needleFly2', 6, 7), enemy('needleFly3', 7, 6)]),
  fight(45, 166, [enemy('pirate', 9, 8)]),
  fight(75, 86, [enemy('harpy', 8, 5)]),
  fight(85, 390, [enemy('nightTerror', 10, 10)], { partialImmunity: true, fatalSkillZero: true }),
  fight(103, 400, [enemy('malbordus', 10, 18)], { paralysis: 3 }),
  fight(113, 285, [enemy('darkElf1', 5, 6), enemy('darkElf2', 6, 5)]),
  fight(119, 73, [enemy('servant', 8, 8)]),
  fight(128, 378, [enemy('killerDog', 9, 10)]),
  fight(188, 41, [enemy('darkDisciple1', 9, 5), enemy('darkDisciple2', 8, 6), enemy('darkDisciple3', 9, 5)]),
  fight(210, 42, [enemy('snakeGuard', 10, 10)]),
  fight(211, 53, [enemy('skeleton1', 9, 6), enemy('skeleton2', 9, 8)]),
  fight(216, 233, [enemy('demon', 6, 8)], { fireBreath: true }),
  fight(240, 270, [enemy('snake', 6, 6)], { fatalHit: true, loss: 373 }),
  fight(249, 5, [enemy('mutantOrc', 11, 11)], { daggerPenalty: true }),
  fight(262, 218, [enemy('ratMan1', 5, 4), enemy('ratMan2', 5, 5)]),
  fight(274, 310, [enemy('skeletonWarrior1', 7, 5), enemy('skeletonWarrior2', 6, 6)], { simultaneous: true }),
  fight(291, 172, [enemy('stoneGolem', 8, 12)]),
  fight(311, 242, [enemy('pterodactyl', 7, 9)], { ally: enemy('giantEagle', 6, 11), loss: 48 }),
  fight(328, 141, [enemy('torturer', 8, 8)]),
  fight(332, 89, [enemy('robber1', 8, 7), enemy('robber2', 7, 7)]),
  fight(339, 38, [enemy('firefly1', 5, 4), enemy('firefly2', 5, 5), enemy('firefly3', 4, 6)], { lightning: true }),
  fight(341, 191, [enemy('sword1', 6, 4), enemy('sword2', 6, 4), enemy('sword3', 6, 4), enemy('sword4', 6, 4)]),
  fight(346, 96, [enemy('skeleton1', 9, 6), enemy('skeleton2', 9, null)], { manualStamina: true }),
  fight(354, 235, [enemy('slaveGuard', 8, 8)]),
  fight(363, 242, [enemy('pterodactyl', 8, 9)], { ally: enemy('giantEagle', 6, 11), loss: 48 }),
  fight(365, 393, [enemy('giantCentipede', 9, 7)]),
  fight(377, 266, [enemy('tentacle1', 7, 7), enemy('tentacle2', 7, 7)], { fatalHit: true, loss: 149 }),
  fight(380, 400, [enemy('malbordus', 10, 18)]),
  fight(389, 18, [enemy('sandworm', 10, 20)]),
  fight(398, 305, [enemy('caveTroll', 8, 9)]),
]);

export const SPELLS = Object.freeze({
  door: [2], sleep: [1], arrow: [2], language: [1], symbols: [1],
  light: [2], fire: [1, 2], jump: [3], trap: [2], water: [0],
});
