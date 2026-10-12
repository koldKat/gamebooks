import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createTombCharacter, initialTombLife, tombStrike, tombVisit, tombSearch, tombHeal,
  tombTakeItem, tombCast, tombSleep, tombDream, tombBees, tombReincarnate,
  startTombFight, tombRound, tombTargets, tombInitiative,
  tombFightCast, tombUseStock, tombUseRing, tombUseRod, tombRecruitVampire,
  tombEquip, tombAssignEnemy, tombGrottCast, tombGrottStock, tombFriendlyReaction, tombTryFriendly,
} from '../../../public/js/battlesim/engines/grailquest/tomb-of-nightmares.js';
import {
  TOMB_ENCOUNTERS, TOMB_DREAMS, TOMB_EQUIPMENT, TOMB_SECRET_DOORS, TOMB_COMPANION,
} from '../../../public/js/battlesim/engines/grailquest/tomb-of-nightmares-roster.js';

const random = (...rolls) => {
  let index = 0;
  return () => {
    assert.ok(index < rolls.length, 'Unexpected extra die roll');
    return (rolls[index++] - 1) / 6;
  };
};
const character = (life = 40, maxLife = 40) => ({ ...createTombCharacter(), life, maxLife });

test('starting stock comes from this book, with no invented meals, potions or free jacket', () => {
  const value = createTombCharacter();
  assert.equal(value.armour, 0);
  assert.equal(value.potions, 0);
  assert.equal(value.salves, 0);
  assert.equal(value.meals, undefined);
  assert.deepEqual(value.equipment, TOMB_EQUIPMENT);
  assert.equal(value.equipment.length, 17);
});

test('initial LIFE takes the best of three 2d6 rolls and carries at most ten permanent points', () => {
  assert.deepEqual(initialTombLife(30, random(1, 2, 6, 6, 3, 4)),
    { life: 58, maxLife: 58, permanent: 10, rolls: [3, 12, 7] });
  assert.throws(() => initialTombLife(-1), RangeError);
});

test('standard damage is excess above threshold plus weapon bonus, reduced by armour', () => {
  assert.deepEqual(tombStrike(8, 4, 5, 2), { hit: true, damage: 7 });
  assert.deepEqual(tombStrike(3, 4, 5), { hit: false, damage: 0 });
  assert.deepEqual(tombStrike(6, 6), { hit: true, damage: 0 });
  assert.deepEqual(tombStrike(12, 2, 0, 3, 10), { hit: true, damage: 7 });
  assert.throws(() => tombStrike(13), RangeError);
});

test('search is limited to one attempt per real visit, including failed searches', () => {
  const value = character();
  assert.equal(tombSearch(value), null);
  assert.equal(tombVisit(value, 54), true);
  assert.equal(tombSearch(value, random(3)).success, false);
  assert.equal(tombSearch(value), null);
  assert.equal(tombVisit(value, 54), false);
  assert.equal(tombSearch(value), null);
  tombVisit(value, 23);
  tombVisit(value, 54);
  assert.deepEqual(tombSearch(value, random(4)).doors, [{ wall: 'north', destination: 59 }]);
});

test('NSD sections have no fabricated secret door after a successful roll', () => {
  const value = character();
  tombVisit(value, 1);
  assert.deepEqual(tombSearch(value, random(6)).doors, []);
  assert.equal(TOMB_SECRET_DOORS[73][0].oneWay, true);
  assert.deepEqual(TOMB_SECRET_DOORS[84].map(row => row.destination), [96, 127, 143]);
});

test('rot and dream illness only drain on real section transitions, not re-render', () => {
  const value = character();
  value.poison = { kind: 'rot', amount: 3 };
  value.dreamDisease = true;
  tombVisit(value, 34);
  assert.equal(value.life, 36);
  tombVisit(value, 34);
  assert.equal(value.life, 36);
  tombVisit(value, 29);
  assert.equal(value.life, 32);
  assert.equal(tombVisit(value, 225), false);
});

test('combat-only lizard poison does not drain during travel', () => {
  const value = character();
  value.poison = { kind: 'combat', amount: 3 };
  tombVisit(value, 47);
  assert.equal(value.life, 40);
});

test('one potion cures zombie rot and Dreamtime rope illness', () => {
  const value = character(20);
  value.potions = 1;
  value.poison = { kind: 'rot', amount: 3 };
  value.dreamDisease = true;
  assert.equal(tombHeal(value, 'potion', random(2, 3)).healing, 5);
  assert.equal(value.poison, null);
  assert.equal(value.dreamDisease, false);
  assert.equal(value.potions, 0);
});

test('crab and needle poison require three doses, not ordinary single-potion healing', () => {
  for (const kind of ['crab', 'needle']) {
    const value = character(20);
    value.poison = { kind, amount: kind === 'crab' ? 3 : 10 };
    value.potions = 3;
    tombHeal(value, 'potion', random(1, 1));
    assert.equal(value.poison.kind, kind);
    assert.equal(tombHeal(value, 'antidote'), null);
    value.potions = 3;
    assert.equal(tombHeal(value, 'antidote').cured, true);
    assert.equal(value.poison, null);
    assert.equal(value.potions, 0);
    assert.equal(value.life, 22);
  }
});

test('salve restores the printed five LIFE, with no combat drinking or resurrection', () => {
  const value = character(38);
  value.salves = 5;
  assert.equal(tombHeal(value, 'salve').healing, 2);
  assert.equal(value.salves, 4);
  assert.equal(tombHeal(value, 'salve', undefined, { inCombat: true }), null);
  value.life = 0;
  assert.equal(tombHeal(value, 'salve'), null);
  assert.equal(value.salves, 4);
});

test('gem clears existing poison and grants both printed immunities', () => {
  const value = character();
  value.poison = { kind: 'needle', amount: 10 };
  tombTakeItem(value, 'gem');
  assert.equal(value.poison, null);
  assert.equal(value.poisonImmune, true);
  assert.equal(value.fireballImmune, true);
});

test('pearl heals on acquisition and retains exactly two later full restorations', () => {
  const value = character(10);
  assert.equal(tombTakeItem(value, 'pearl').healing, 30);
  assert.equal(value.pearlUses, 2);
  value.life = 20;
  assert.equal(tombHeal(value, 'pearl').healing, 20);
  value.life = 15;
  assert.equal(tombHeal(value, 'pearl').healing, 25);
  assert.equal(tombHeal(value, 'pearl'), null);
});

test('gill transformation costs fifteen LIFE and cannot grant immunity after death', () => {
  const value = character(15);
  assert.equal(tombTakeItem(value, 'gills').dead, true);
  assert.equal(value.gills, false);
});

test('mould grants its immediate 2d6 healing rather than healing unrelated trap damage automatically', () => {
  const value = character(20);
  assert.equal(tombTakeItem(value, 'mould', random(3, 4)).healing, 7);
  assert.equal(value.mould, true);
  tombVisit(value, 5);
  assert.equal(value.life, 27);
});

test('failed spells cost three LIFE and consume one of three attempts', () => {
  const value = character();
  for (let index = 0; index < 3; index++) {
    assert.equal(tombCast(value, 'pin', random(1, 1)).success, false);
  }
  assert.equal(value.life, 31);
  assert.equal(tombCast(value, 'pin'), null);
});

test('Firefinger and Fireball create stock once, preserve unused charges and cannot be recast after success', () => {
  const value = character();
  assert.equal(tombCast(value, 'firefinger', random(3, 4)).success, true);
  assert.equal(value.bolts, 10);
  assert.equal(tombCast(value, 'firefinger'), null);
  assert.equal(tombCast(value, 'fireball', random(6, 6)).success, true);
  assert.equal(value.fireballs, 2);
  assert.equal(tombCast(value, 'fireball'), null);
});

test('invisibility is marked-section only, costs fifteen and is limited to one attempt', () => {
  const value = character();
  assert.equal(tombCast(value, 'invisibility'), null);
  assert.equal(value.life, 40);
  assert.equal(tombCast(value, 'invisibility', random(1, 1), { markedSection: true }).success, false);
  assert.equal(value.life, 25);
  assert.equal(tombCast(value, 'invisibility', undefined, { markedSection: true }), null);
});

test('PIP cannot cure an already-present poison', () => {
  const value = character();
  value.poison = { kind: 'crab', amount: 3 };
  assert.equal(tombCast(value, 'pip', random(6, 6)).success, true);
  assert.equal(value.poisonImmune, false);
  assert.equal(value.poison.kind, 'crab');
});

test('PLOP uses its printed six threshold and only picks one lock in each section', () => {
  const value = character();
  tombVisit(value, 193);
  assert.equal(tombCast(value, 'plop', random(3, 3)).success, true);
  assert.equal(tombCast(value, 'plop'), null);
  tombVisit(value, 123);
  assert.equal(tombCast(value, 'plop', random(3, 3)).success, true);
});

test('ordinary indoor levitation halves remaining LIFE but the explicit shaft exception does not', () => {
  const value = character();
  tombCast(value, 'pil', random(6, 6), { indoors: true });
  assert.equal(value.life, 18.5);
  const shaft = character();
  tombCast(shaft, 'pil', random(6, 6), { indoors: true, shaftException: true });
  assert.equal(shaft.life, 37);
});

test('sleep chooses Dreamtime or healing and is unavailable during a fight', () => {
  const value = character(20);
  assert.equal(tombSleep(value, random(4)).dream, true);
  assert.equal(tombSleep(value, random(5, 2, 3)).healing, 5);
  assert.equal(tombSleep(value, undefined, { inCombat: true }), null);
});

test('Dreamtime treasure awards gold only if the one-LIFE loss is survived', () => {
  const value = character(1);
  assert.equal(tombDream(value, 2).dead, true);
  assert.equal(value.gold, 0);
  const survivor = character();
  tombDream(survivor, 2);
  assert.equal(survivor.gold, 100);
});

test('Dreamtime fruit is kept until the player chooses to eat it', () => {
  const value = character(20);
  assert.equal(tombDream(value, 4, random(3)).fruit, 3);
  assert.equal(value.life, 20);
  assert.equal(tombHeal(value, 'fruit', random(2, 4)).healing, 6);
  assert.equal(value.fruit, 2);
});

test('Dreamtime covers molten death, unarmed cube, damage, gold and printed anomalous destination', () => {
  assert.equal(tombDream(character(), 3, random(4)).dead, true);
  assert.equal(tombDream(character(), 3, random(3)).dead, false);
  assert.equal(tombDream(character(), 5).encounter, 'dream5');
  const hurt = character();
  assert.equal(tombDream(hurt, 6, random(3, 4)).loss, 14);
  assert.equal(hurt.life, 26);
  const poor = character(); poor.gold = 101;
  tombDream(poor, 7);
  assert.equal(poor.gold, 50.5);
  const dead = character(3);
  const result = tombDream(dead, 8, random(2, 2));
  assert.equal(result.dead, true);
  assert.equal(result.printedDeathDestination, 143);
});

test('Dreamtime maze uses one explicit retry at a time, not an unbounded roll loop', () => {
  const value = character(10);
  assert.equal(tombDream(value, 11, random(1, 1)).retry, true);
  assert.equal(tombDream(value, 11, random(4, 5)).healing, 30);
  assert.equal(tombDream(character(), 11, random(3, 4)).dead, true);
  assert.equal(tombDream(character(), 12).redream, true);
});

test('crystal bees use the printed once-only automatic sting, or training-kit bypass', () => {
  const value = character();
  assert.deepEqual(tombBees(value, random(2, 3)), { bypassed: false, bees: 10, loss: 20, dead: false });
  const trained = character(); trained.beeTraining = true;
  assert.equal(tombBees(trained).bypassed, true);
  assert.equal(trained.life, 40);
});

test('reincarnation retains dead-enemy history but removes adventure items and poisons', () => {
  const value = character();
  value.killed[29] = true;
  value.experience = 10;
  value.permanent = 3;
  value.goldenGarlic = true;
  value.gold = 100;
  value.poison = { kind: 'rot', amount: 3 };
  tombReincarnate(value, random(1, 1, 2, 2, 3, 3));
  assert.equal(value.life, 27);
  assert.equal(value.gold, 0);
  assert.equal(value.poison, null);
  assert.equal(value.goldenGarlic, false);
  assert.equal(value.deaths, 1);
  assert.equal(value.experience, 10);
  assert.deepEqual(value.killed, { 29: true });
});

test('this book roster preserves group counts, restrictions, deaths and all three Grott stages', () => {
  assert.equal(new Set(TOMB_ENCOUNTERS.map(row => row.id)).size, TOMB_ENCOUNTERS.length);
  const get = id => TOMB_ENCOUNTERS.find(row => row.id === id);
  assert.equal(get(31).countExtra, 1);
  assert.equal(get(78).count, 4);
  assert.equal(get(150).countDice, 2);
  assert.equal(get(103).playerBonus, 1);
  assert.equal(get(130).playerBonus, 0);
  assert.equal(get(169).enemies[0].attacks, 2);
  assert.equal(get(172).enemies[0].fatalOnHit, true);
  assert.equal(get(204).nextStage, '204-grott');
  assert.equal(get('204-grott').nextStage, 222);
  assert.equal(get(222).nextStage, 209);
  assert.equal(get(209).enemyMagic, false);
  assert.equal(get(219).enemies[0].automatic, true);
  assert.deepEqual(TOMB_COMPANION.fatalRolls, [12]);
  assert.equal(TOMB_DREAMS[0].playerBonus, 0);
});

const fight = (id, options = {}, life = 100) => {
  const value = character(life, life);
  const result = startTombFight(value, id, options, random(6, 6, 1, 1));
  return result;
};

test('a new fight copies the character and has explicit initiative ties, not silent retries', () => {
  const value = character();
  const result = startTombFight(value, 94, {}, random(3, 4, 3, 4));
  assert.equal(result.first, null);
  assert.equal(tombRound(result), null);
  assert.equal(tombInitiative(result, random(6, 6, 1, 1)).first, 'player');
  result.player.life = 20;
  assert.equal(value.life, 40);
});

test('repeat journeys halve each previously killed enemy once, without affecting its surviving partner', () => {
  const value = character();
  value.killed['29:0'] = true;
  const result = startTombFight(value, 29, {}, random(6, 6, 1, 1));
  assert.equal(result.foes[0].life, 12.5);
  assert.equal(result.foes[1].life, 25);
  assert.equal(result.foes[0].initialLife, 25);
});

test('random group counts enforce the source range including the original lizard man', () => {
  assert.equal(fight(31, { enemyCount: 2 }).foes.length, 2);
  assert.equal(fight(31, { enemyCount: 7 }).foes.length, 7);
  assert.throws(() => fight(31, { enemyCount: 1 }), RangeError);
  assert.throws(() => fight(144, { enemyCount: 7 }), RangeError);
  assert.equal(fight(150, { enemyCount: 12 }).foes.length, 12);
});

test('vampire bats with five LIFE require death, not automatic pre-fight knockout', () => {
  const result = fight(150, { enemyCount: 2 });
  assert.equal(result.status, 'fighting');
  assert.equal(tombTargets(result).length, 2);
});

test('golden garlic bypasses wandering vampires but not other creatures', () => {
  const value = character(); value.goldenGarlic = true;
  const bypassed = startTombFight(value, 144, { enemyCount: 2 });
  assert.equal(bypassed.status, 'bypassed');
  assert.equal(tombRound(bypassed), null);
  assert.equal(startTombFight(value, 94, {}, random(6, 6, 1, 1)).status, 'fighting');
});

test('a mummy scream and the troll dagger are fatal irrespective of armour', () => {
  const mummy = fight(49); mummy.first = 'enemy'; mummy.player.armour = 100;
  tombRound(mummy, 0, random(6, 6));
  assert.equal(mummy.status, 'loss');
  assert.equal(mummy.player.life, 0);
  const troll = fight(172); troll.first = 'enemy'; troll.player.armour = 100;
  tombRound(troll, 0, random(3, 3));
  assert.equal(troll.player.life, 0);
});

test('the protective gem prevents fatal spider poison but not a nonpoisonous vampire bite', () => {
  const spider = fight(103); spider.first = 'enemy'; spider.player.poisonImmune = true;
  tombRound(spider, 0, random(6, 6, 1, 1));
  assert.ok(spider.player.life > 0);
  const vampire = fight(218); vampire.first = 'enemy'; vampire.player.poisonImmune = true;
  tombRound(vampire, 0, random(6, 6));
  assert.equal(vampire.player.life, 0);
});

test('a giant lizard tongue can immobilize on a three even though the claws miss', () => {
  const result = fight(63); result.first = 'enemy';
  const events = tombRound(result, 0, random(1, 2));
  assert.equal(events[0].hit, false);
  assert.equal(events[1].skipped, 'paralysis');
  assert.equal(result.player.life, 100);
});

test('Fido gets two separate attacks for one player turn', () => {
  const result = fight(169); result.first = 'enemy';
  const events = tombRound(result, 0, random(2, 2, 2, 3, 1, 1));
  assert.equal(events.filter(row => row.kind === 'enemy').length, 2);
  assert.equal(events.filter(row => row.kind === 'player').length, 1);
  assert.equal(result.player.life, 97);
});

test('Fishface can drown only in the first three rounds, and gills prevent it', () => {
  const early = fight(118); early.first = 'enemy';
  tombRound(early, 0, random(4, 5));
  assert.equal(early.player.life, 0);
  const late = fight(118); late.first = 'enemy'; late.round = 3;
  tombRound(late, 0, random(4, 5, 1, 1));
  assert.equal(late.player.life, 96);
  const gills = fight(118); gills.first = 'enemy'; gills.player.gills = true;
  tombRound(gills, 0, random(4, 5, 1, 1));
  assert.equal(gills.player.life, 96);
});

test('Draculina drains every round after her first hit, including missed rounds', () => {
  const result = fight(148); result.first = 'enemy';
  tombRound(result, 0, random(2, 2, 1, 1));
  assert.equal(result.player.life, 97);
  tombRound(result, 0, random(1, 1, 1, 1));
  assert.equal(result.player.life, 94);
});

test('attached vampire bats keep draining without rerolling to hit', () => {
  const result = fight(150, { enemyCount: 2 }); result.first = 'enemy';
  tombRound(result, 0, random(2, 2, 1, 1, 1, 1));
  assert.equal(result.player.life, 97);
  const events = tombRound(result, 0, random(1, 1, 1, 1));
  assert.equal(events[0].attached, true);
  assert.equal(result.player.life, 94);
});

test('silver sword bypasses werewolf armour but not granite armour', () => {
  const werewolf = fight(141); werewolf.player.silverSword = true; tombEquip(werewolf.player, 'silver');
  tombRound(werewolf, 0, random(6, 6, 1, 1));
  assert.equal(werewolf.foes[0].life, 19);
  const demon = fight(94); demon.player.silverSword = true; tombEquip(demon.player, 'silver');
  tombRound(demon, 0, random(6, 6, 1, 1));
  assert.equal(demon.foes[0].life, 32);
});

test('POW and POPS act on raw attack damage before armour and consume their throws', () => {
  const result = fight(94); result.pow = true; result.pops = 2;
  tombRound(result, 0, random(2, 2, 1, 1));
  assert.equal(result.foes[0].life, 8);
  assert.equal(result.pow, false);
  assert.equal(result.pops, 1);
  tombRound(result, 0, random(1, 1, 1, 1));
  assert.equal(result.foes[0].life, 8);
  assert.equal(result.pops, 0);
});

test('a crystal knife shatters after one successful kill, not after a missed throw', () => {
  const result = fight(94); result.player.crystalDagger = true; result.player.weapon = 'crystal';
  tombRound(result, 0, random(1, 1, 1, 1));
  assert.equal(result.player.crystalDagger, true);
  tombRound(result, 0, random(3, 3));
  assert.equal(result.status, 'win');
  assert.equal(result.player.crystalDagger, false);
  assert.equal(result.player.weapon, 'ej');
});

test('a Golden Vampire encounter grants the printed first strike without initiative dice', () => {
  assert.equal(startTombFight(character(), 218).first, 'player');
});

test('skull Firefingers always hit for ten rather than ordinary excess dice damage', () => {
  const result = fight(219); result.first = 'enemy';
  const events = tombRound(result, 0, random(1, 1));
  assert.equal(events[0].damage, 10);
  assert.equal(result.player.life, 90);
});

test('ongoing combat poison takes priority over victory and cannot award EXP after knockout', () => {
  const result = fight(94, { killEnemies: true }, 6);
  result.foes[0].life = 1;
  result.player.poison = { kind: 'crab', amount: 3 };
  tombRound(result, 0, random(6, 6));
  assert.equal(result.status, 'loss');
  assert.equal(result.player.life, 3);
  assert.equal(result.player.experience, 0);
});

test('victory grants one EXP once and mould heals once after combat, never on repaint', () => {
  const result = fight(94, { killEnemies: true });
  result.player.life = 40;
  result.player.mould = true;
  result.foes[0].life = 1;
  tombRound(result, 0, random(6, 6, 2, 3));
  assert.equal(result.status, 'win');
  assert.equal(result.player.life, 45);
  assert.equal(result.player.experience, 1);
  assert.equal(result.mouldHealing, 5);
  assert.equal(tombRound(result), null);
  assert.equal(result.player.life, 45);
});

test('three-fight nausea stock and next-fight hologram are copied and consumed only in the new fight', () => {
  const value = character(); value.nauseaFights = 3; value.hologram = true;
  const result = startTombFight(value, 94, {}, random(6, 6, 1, 1));
  assert.equal(result.nausea, 3);
  assert.equal(result.player.nauseaFights, 2);
  assert.equal(value.nauseaFights, 3);
  assert.equal(result.hologram, true);
  assert.equal(result.player.hologram, false);
  assert.equal(value.hologram, true);
});

test('Grott without an Ode subtracts three player damage; his final resurrection has no spell power', () => {
  const noOde = fight('204-grott');
  tombRound(noOde, 0, random(2, 2, 1, 1));
  assert.equal(noOde.foes[0].life, 23);
  const ode = fight('204-grott'); ode.player.deathOde = true;
  tombRound(ode, 0, random(2, 2, 1, 1));
  assert.equal(ode.foes[0].life, 20);
  assert.equal(fight(209).spec.enemyMagic, false);
});

test('Grott blocks player casting and spell stock until the Death Ode is recited', () => {
  const result = fight('204-grott'); result.player.bolts = 2;
  assert.equal(tombFightCast(result, 'pad'), null);
  assert.equal(tombUseStock(result, 'firefinger'), null);
  assert.equal(result.player.bolts, 2);
  assert.equal(result.player.life, 100);
  result.player.deathOde = true;
  assert.equal(tombFightCast(result, 'pad', 0, random(3, 4)).success, true);
  assert.equal(result.foes[0].life, 15);
});

test('PANIC stacks with real armour, not as a free starting item', () => {
  const result = fight(94); result.player.armour = 4;
  tombFightCast(result, 'panic', 0, random(3, 4));
  result.first = 'enemy';
  tombRound(result, 0, random(3, 3, 1, 1));
  assert.equal(result.panic, 4);
  assert.equal(result.player.armour, 4);
  assert.equal(result.player.life, 97);
});

test('PILL makes only the chosen enemy miss three turns, not its companions', () => {
  const result = fight(41);
  tombFightCast(result, 'pill', 1, random(3, 4));
  result.first = 'enemy';
  const events = tombRound(result, 0, random(3, 3, 1, 1));
  assert.equal(events[0].index, 0);
  assert.equal(events[0].hit, true);
  assert.equal(events[1].index, 1);
  assert.equal(events[1].skipped, 'laughter');
  assert.equal(result.foes[1].laughter, 2);
});

test('Firefinger stock does ten fixed damage, consumes one bolt and never rerolls casting', () => {
  const result = fight(94); result.player.bolts = 2;
  assert.equal(tombUseStock(result, 'firefinger').damage, 10);
  assert.equal(result.foes[0].life, 25);
  assert.equal(result.player.bolts, 1);
});

test('the ring costs a turn and replaces EJ with the printed bat attack and defence', () => {
  const result = fight(94); result.player.vampireRing = true;
  assert.equal(tombUseRing(result), true);
  assert.equal(tombUseRing(result), false);
  const events = tombRound(result, 0, random(3, 3));
  assert.equal(events[0].skipped, 'paralysis');
  assert.equal(events[1].hit, false);
  tombRound(result, 0, random(2, 2, 1, 1));
  assert.equal(result.foes[0].life, 34);
});

test('the black rod only drowns human or humanoid enemies within its first three rounds', () => {
  const demon = fight(94); demon.player.blackRod = true;
  assert.equal(tombUseRod(demon, 0, random(6, 6)).success, false);
  const troll = fight(172); troll.player.blackRod = true;
  assert.equal(tombUseRod(troll, 0, random(4, 5)).success, true);
  assert.equal(troll.status, 'win');
  const late = fight(172); late.player.blackRod = true; late.round = 3;
  assert.equal(tombUseRod(late), null);
});

test('recruiting the Golden Vampire requires golden garlic and retains printed companion stats', () => {
  const value = character();
  assert.equal(tombRecruitVampire(value), false);
  value.goldenGarlic = true;
  assert.equal(tombRecruitVampire(value), true);
  assert.equal(value.companion.life, 50);
  assert.equal(value.companion.hit, 4);
  assert.equal(value.companion.bonus, 3);
  assert.deepEqual(value.companion.fatalRolls, [12]);
});

test('ordinary silver sword does not inherit EJ magic and requires actual acquisition', () => {
  const value = character();
  assert.equal(tombEquip(value, 'silver'), false);
  tombTakeItem(value, 'silverSword');
  assert.equal(tombEquip(value, 'silver'), true);
  assert.equal(value.hit, 6);
  assert.equal(value.bonus, 0);
  assert.equal(tombEquip(value, 'ej'), true);
  assert.equal(value.hit, 4);
  assert.equal(value.bonus, 5);
});

test('bat form cannot use a held crystal knife or EJ-only POPS', () => {
  const result = fight(94);
  result.player.crystalDagger = result.player.vampireRing = true;
  tombEquip(result.player, 'crystal');
  result.bat = true;
  result.pops = 2;
  tombRound(result, 0, random(3, 3, 1, 1));
  assert.equal(result.foes[0].life, 32);
  assert.equal(result.player.crystalDagger, true);
  assert.equal(result.pops, 2);
});

const accompanied = (id, options = {}) => {
  const value = character(100, 100);
  value.companion = structuredClone(TOMB_COMPANION);
  const result = startTombFight(value, id, { useCompanion: true, ...options }, random(6, 6, 1, 1));
  result.first = 'enemy';
  return result;
};

test('companion is optional, isolated from saved character and excluded from dreams', () => {
  const value = character(); value.companion = structuredClone(TOMB_COMPANION);
  const ordinary = startTombFight(value, 94, {}, random(6, 6, 1, 1));
  assert.equal(ordinary.ally, null);
  const result = startTombFight(value, 94, { useCompanion: true }, random(6, 6, 1, 1));
  result.ally.life = 12;
  assert.equal(value.companion.life, 50);
  assert.equal(startTombFight(value, 'dream5', { useCompanion: true }, random(6, 6, 1, 1)).ally, null);
});

test('enemy fatal attacks kill their assigned companion, not Pip', () => {
  const result = accompanied(172);
  assert.equal(tombAssignEnemy(result, 0, 'ally'), true);
  const events = tombRound(result, 0, random(3, 3, 1, 1));
  assert.equal(events[0].target, 'ally');
  assert.equal(result.ally.life, 0);
  assert.equal(result.player.companion.life, 0);
  assert.equal(result.player.life, 100);
  assert.equal(result.status, 'fighting');
});

test('companion poison is independent of Pip immunity and persists in companion state', () => {
  const result = accompanied(111); result.player.poisonImmune = true;
  tombAssignEnemy(result, 0, 'ally');
  tombRound(result, 0, random(5, 5, 1, 1, 1, 1));
  assert.equal(result.player.life, 100);
  assert.equal(result.player.poison, null);
  assert.deepEqual(result.ally.poison, { kind: 'crab', amount: 3 });
  assert.equal(result.ally.life, 41);
  assert.equal(result.player.companion.life, 41);
});

test('companion paralysis skips only the vampire turn', () => {
  const result = accompanied(63);
  tombAssignEnemy(result, 0, 'ally');
  const events = tombRound(result, 0, random(1, 2, 1, 1));
  assert.ok(events.some(event => event.kind === 'ally' && event.skipped === 'paralysis'));
  assert.ok(events.some(event => event.kind === 'player' && event.roll === 2));
  assert.equal(result.paralysis, 0);
});

test('Golden Vampire rolls twelve to kill instantly and surviving LIFE carries forward', () => {
  const result = accompanied(94);
  tombAssignEnemy(result, 0, 'ally');
  const events = tombRound(result, 0, random(3, 3, 1, 1, 6, 6));
  assert.equal(events.at(-1).fatal, true);
  assert.equal(result.foes[0].life, 0);
  assert.equal(result.status, 'win');
  assert.equal(result.player.companion.life, 44);
  assert.equal(result.player.life, 100);
});

test('dead companion cannot be assigned and attached bats cannot be moved to another victim', () => {
  const result = accompanied(150, { enemyCount: 2 });
  tombAssignEnemy(result, 0, 'ally');
  tombRound(result, 0, random(2, 2, 1, 1, 1, 1, 1, 1));
  assert.equal(tombAssignEnemy(result, 0, 'player'), false);
  assert.equal(result.foes[0].attachedTarget, 'ally');
  result.ally.life = 0;
  assert.equal(tombAssignEnemy(result, 1, 'ally'), false);
  assert.equal(tombAssignEnemy(result, 1, 'invalid'), false);
});

test('partial kills survive a later loss and return at half original LIFE', () => {
  const result = fight(29); result.first = 'player';
  result.player.life = 6; result.foes[0].life = 6;
  tombRound(result, 0, random(6, 6, 6, 6));
  assert.equal(result.status, 'loss');
  assert.equal(result.player.killed['29:0'], true);
  assert.equal(result.player.killed['29:1'], undefined);
  const value = structuredClone(result.player); value.life = value.maxLife = 100;
  const next = startTombFight(value, 29, {}, random(6, 6, 1, 1));
  assert.deepEqual(next.foes.map(foe => foe.life), [12.5, 25]);
});

test('garlic bypass does not consume next-fight hologram or nausea', () => {
  const value = character(); value.goldenGarlic = true; value.hologram = true; value.nauseaFights = 3;
  const result = startTombFight(value, 144, { enemyCount: 1 });
  assert.equal(result.status, 'bypassed');
  assert.equal(result.player.hologram, true);
  assert.equal(result.player.nauseaFights, 3);
});

test('black rod cannot be retried indefinitely before advancing a round', () => {
  const result = fight(172); result.player.blackRod = true;
  assert.equal(tombUseRod(result, 0, random(1, 1)).success, false);
  assert.equal(tombUseRod(result, 0), null);
  result.round++;
  assert.equal(tombUseRod(result, 0, random(4, 5)).success, true);
});

test('Grott spell attempts cost his own LIFE and his final incarnation has no magic', () => {
  const result = fight('204-grott');
  assert.equal(tombGrottCast(result, 'pad', random(1, 1)).success, false);
  assert.equal(result.foes[0].life, 22);
  assert.equal(tombGrottCast(result, 'pad', random(3, 4)).success, true);
  assert.equal(result.foes[0].life, 19);
  assert.equal(result.player.life, 90);
  const final = fight(209);
  assert.equal(tombGrottCast(final, 'pad'), null);
  assert.equal(final.foes[0].life, 25);
});

test('Grott Fireball stock is generated once and the protective gem blocks its damage', () => {
  const result = fight(222);
  assert.equal(tombGrottCast(result, 'fireball', random(3, 4)).success, true);
  assert.equal(result.foes[0].fireballs, 2);
  assert.equal(tombGrottCast(result, 'fireball'), null);
  result.player.fireballImmune = true;
  assert.equal(tombGrottStock(result, 'fireball').damage, 0);
  assert.equal(result.foes[0].fireballs, 1);
  result.player.fireballImmune = false;
  assert.equal(tombGrottStock(result, 'fireball').damage, 75);
  assert.equal(result.player.life, 25);
  assert.equal(tombGrottStock(result, 'fireball'), null);
});

test('Grott damage and laughter target a companion without touching Pip', () => {
  const result = accompanied(222);
  tombGrottCast(result, 'pill', random(3, 4), 'ally');
  assert.equal(result.ally.paralysis, 3);
  assert.equal(result.paralysis, 0);
  tombGrottCast(result, 'pad', random(3, 4), 'ally');
  assert.equal(result.player.companion.life, 40);
  assert.equal(result.player.life, 100);
});

test('Grott PANIC, POW and repeater affect future strikes with armour applied last', () => {
  const result = fight(222);
  tombGrottCast(result, 'panic', random(3, 4));
  tombGrottCast(result, 'pow', random(3, 4));
  tombGrottCast(result, 'repeater', random(3, 4));
  assert.equal(result.foes[0].armour, 4);
  result.first = 'enemy'; result.player.armour = 20;
  const events = tombRound(result, 0, random(3, 3, 3, 3, 1, 1));
  assert.equal(events.filter(event => event.kind === 'enemy').length, 2);
  assert.equal(events[0].damage, 0);
  assert.equal(result.player.life, 100);
  assert.equal(result.foes[0].pow, false);
});

test('friendly reaction uses the three player dice total and is limited to one pre-combat attempt per foe', () => {
  assert.deepEqual(tombFriendlyReaction(random(6, 1, 1, 1)), { enemy: 6, rolls: [1, 1, 1], player: 3, success: true });
  assert.equal(tombFriendlyReaction(random(4, 1, 2, 3)).success, false);
  const result = fight(29);
  assert.equal(tombTryFriendly(result, 0, random(6, 1, 1, 1)).success, true);
  assert.deepEqual(tombTargets(result).map(row => row.index), [1]);
  assert.equal(tombTryFriendly(result, 0), null);
  assert.equal(tombTryFriendly(result, 1, random(6, 1, 1, 1)).success, true);
  assert.equal(result.status, 'win');
  assert.equal(result.player.experience, 1);
  assert.deepEqual(result.player.killed, {});
});

test('needle poison drains ten per new section, never each combat round', () => {
  const result = fight(94);
  result.player.poison = { kind: 'needle', amount: 10 };
  const events = tombRound(result, 0, random(1, 1, 1, 1));
  assert.equal(result.player.life, 100);
  assert.equal(events.some(event => event.kind === 'ongoing'), false);
  tombVisit(result.player, 116);
  assert.equal(result.player.life, 90);
  tombVisit(result.player, 116);
  assert.equal(result.player.life, 90);
});

test('two vampire triggers cause one five-LIFE self-bite turn, not a doubled contortion', () => {
  const result = fight(41); result.first = 'enemy';
  tombRound(result, 0, random(6, 6, 6, 6));
  assert.equal(result.player.life, 75);
  assert.equal(result.selfBite, 0);
  assert.equal(result.logs[0].events.at(-1).loss, 5);
});

test('mould heals once after a survived knockout too, but cannot heal the dead', () => {
  const result = fight(94); result.player.life = 6; result.player.mould = true; result.first = 'enemy';
  tombRound(result, 0, random(2, 2, 3, 3));
  assert.equal(result.status, 'loss');
  assert.equal(result.mouldHealing, 6);
  assert.equal(result.player.life, 8);
  assert.equal(tombRound(result), null);
  const fatal = fight(172); fatal.player.mould = true; fatal.first = 'enemy';
  tombRound(fatal, 0, random(3, 3));
  assert.equal(fatal.player.life, 0);
  assert.equal(fatal.mouldHealing, undefined);
});
