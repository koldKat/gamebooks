export const definition = Object.freeze({
  id: 718, title: 'Демони от дълбините', family: 'fighting-fantasy', stateKey: 'sim718', i18nPrefix: 'battlesim718',
});

export const RULES_REVISION = 1;
export const SWIFTSTINGER_DAMAGE = 10;
const enemy = (key, skill, stamina, extra = {}) => ({ key, skill, stamina, ...extra });
const escape = (destination, damage = 2, extra = {}) => ({ destination, damage, ...extra });
const fight = (section, win, enemies, rules = {}) => ({ section, win, enemies, ...rules });

export const ENCOUNTERS = Object.freeze([
  fight(13, 390, Array.from({ length: 4 }, () => enemy('batFish', 6, 4)), { remainingBatFish: true }),
  fight(22, 176, [enemy('cyrano', 11, 10)], { practiceHits: 3, loss: 46, training: true }),
  fight(25, 181, [enemy('sawfish', 8, 10), enemy('merman', 10, 5)], { escape: escape(150) }),
  fight(28, 86, [enemy('seaDragon', 10, 24)]),
  fight(36, 277, [enemy('seaDragon', 10, 24)]),
  fight(51, 189, [enemy('bloodaxe', 11, 12)]),
  fight(69, 326, [enemy('merman', 9, 10)], { escape: escape(152) }),
  fight(73, 102, [enemy('lionfish', 9, 12)]),
  fight(75, 328, [enemy('skeleton1', 8, 5), enemy('skeleton2', 7, 6)], { escape: escape(295) }),
  fight(79, 158, [enemy('swordfish', 11, 10)]),
  fight(97, 371, [enemy('seaSpider', 7, 10)], { preWound: 2, escape: escape(222) }),
  fight(98, 131, [enemy('morayEel', 7, 12)]),
  fight(109, 163, [enemy('seaOgre', 7, 18)], { injuredOgre: true }),
  fight(119, 340, [enemy('grouper', 8, 12)], { victoryHits: 2 }),
  fight(122, 206, [enemy('seaSnakes', 9, 7)], { incomingDamage: 3, luckyIncomingModifier: -2, escape: escape(3, 3) }),
  fight(123, 268, [enemy('seaSpider', 7, 10)], { preWound: 1, trapped: true, escape: escape(222) }),
  fight(133, 370, [enemy('shark', 8, 15)], { noPrecombatRecovery: true }),
  fight(137, 176, [enemy('cyrano', 11, 10)], { practiceHits: 3, loss: 46, training: true }),
  fight(168, 54, [enemy('swordArm', 9, 6), enemy('spearArm', 7, 6), enemy('axeArm', 4, 8, { damageMultiplier: 2 })], { mode: 'simultaneous' }),
  fight(208, 70, [enemy('shakspyr', 9, 12)], { enemyFloor: 2, playerFloor: 2, loss: 185, escape: escape(185, 0) }),
  fight(210, 386, [enemy('waterElemental', 9, 11)], { mercyAt: 2, mercyDestination: 15, escape: escape(58) }),
  fight(218, 332, [enemy('shark', 8, 15)], { ally: enemy('dolphin', 10, 9), escape: escape(72) }),
  fight(219, 92, [enemy('giantCrab1', 7, 11), enemy('giantCrab2', 8, 10)], { escape: escape(32) }),
  fight(224, 347, [enemy('deepOne1', 6, 8), enemy('deepOne2', 7, 6), enemy('deepOne3', 6, 7), enemy('deepOne4', 5, 8)]),
  fight(232, 257, [enemy('statue', 6, 16)], { playerFloor: 2, loss: 126, escape: escape(39) }),
  fight(253, 125, [enemy('kraken', 10, 30)], { krakenInjuries: true, escape: escape(309, 0, { fatal: true }) }),
  fight(254, 56, [enemy('seaWitch', 8, 8)], { curse: true, escape: escape(368) }),
  fight(272, 170, [enemy('bloodworms', 6, 6)]),
  fight(273, 370, [enemy('shark', 8, 15)], { noPrecombatRecovery: true }),
  fight(274, 189, [enemy('pirate1', 7, 13), enemy('pirate2', 9, 9), enemy('pirate3', 8, 14), enemy('pirate4', 9, 12), enemy('bloodaxe', 11, 12)], { mode: 'rolling-pair' }),
  fight(294, 235, [enemy('devilfish', 8, 13)], { escape: escape(117) }),
  fight(306, 188, [enemy('pirate1', 5, 10), enemy('pirate2', 6, 11)], { alternateWins: [47] }),
  fight(311, 33, [enemy('bloodworms', 6, 13)], { escape: escape(272) }),
  fight(314, 195, [enemy('anemones', 7, 14)], { anemoneRing: true, escape: escape(237, 0) }),
  fight(329, 88, [enemy('sawfish', 8, 10)], { escape: escape(150) }),
  fight(333, 136, [enemy('deepOne1', 8, 10), enemy('deepOne2', 7, 12)], { escape: escape(347) }),
  fight(346, 366, [enemy('slimeDemon', 8, 8)], { attackModifier: -3, escape: escape(41) }),
  fight(383, 163, [enemy('seaOgre', 7, 18)], { playerFloor: 2, loss: 256, rememberOgre: true }),
  fight(387, 133, [enemy('dolphin', 10, 9)], { escape: escape(273, 0) }),
  fight(398, 16, [enemy('barracuda1', 6, 4), enemy('barracuda2', 6, 6), enemy('barracuda3', 5, 6)], { alternateWins: [233] }),
]);
