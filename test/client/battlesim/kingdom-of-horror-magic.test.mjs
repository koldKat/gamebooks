import test from 'node:test';
import assert from 'node:assert/strict';
import { createKingdomCharacter, startKingdomFight, kingdomPlayerAttack,
  kingdomEnemyAttack, rollKingdomRound }
  from '../../../public/js/battlesim/engines/grailquest/kingdom-of-horror.js';
import { kingdomCast, kingdomChargeResurrection, kingdomResurrect,
  kingdomBreakSanctuary, kingdomPrepareFriendship, kingdomUseLuckyRoll,
  kingdomSwitchWeapon, kingdomRemoveNeckBolt, kingdomSmarm }
  from '../../../public/js/battlesim/engines/grailquest/kingdom-of-horror-magic.js';

const rolls = (...values) => {
  let index = 0;
  return () => { assert.ok(index < values.length, 'Unexpected random roll'); return (values[index++] - 1) / 6; };
};
const character = extra => ({ ...createKingdomCharacter(), life: 48, maxLife: 48, ...extra });
const fight = (id, magic, options = {}, extra = {}) => startKingdomFight(character({ magic, ...extra }),
  id, options, rolls(6, 6, 1, 1));

test('Looted witch artifacts use their distinct printed rules and charges', () => {
  const thunder = fight(16, { thunderbolt: 1 });
  assert.equal(kingdomCast(thunder, 'thunderbolt', 0, {}, rolls(3, 3)).damage, 10);
  assert.equal(thunder.player.magic.thunderbolt, 0);
  const gel = fight(16, { kangling: 2 });
  kingdomCast(gel, 'kangling', 0, {}, rolls(3, 3));
  assert.equal(gel.foes[0].gelDamage, 10);
  for (let i = 0; i < 3; i++) kingdomEnemyAttack(gel, rolls(1, 1));
  assert.equal(gel.foes[0].life, 10);
  assert.equal(gel.player.magic.kangling, 1);
  const pills = fight(17, { dragonfirePills: 2 });
  assert.equal(kingdomCast(pills, 'dragonfirePills', 0, {}, rolls()).damage, 35);
  assert.equal(pills.player.magic.dragonfirePills, 1);
});

test('Sanctuary blocks Dragonfire too, not only weapon attacks', () => {
  const f = fight(78, { sanctuaryScroll: 1 });
  kingdomCast(f, 'sanctuaryScroll', 0, {}, rolls());
  kingdomEnemyAttack(f, rolls(1, 1));
  kingdomEnemyAttack(f, rolls(1, 1));
  assert.equal(kingdomEnemyAttack(f, rolls()).damage, 0);
  assert.equal(f.player.life, 48);
  assert.equal(f.foes[2].pills, 5);
});

test('Xerox prevents strikes on alternate complete rounds', () => {
  const f = fight(16, { xerox: 1 });
  kingdomCast(f, 'xerox', 0, {}, rolls());
  for (let i = 0; i < 3; i++) kingdomEnemyAttack(f, rolls(1, 1));
  const before = f.player.life;
  rollKingdomRound(f, 0, rolls(1, 1, 6, 6, 6, 6, 6, 6));
  assert.equal(f.player.life, before);
});

test('A final recorded or declined death cannot be reopened by resurrection', () => {
  for (const field of ['recorded', 'resurrectionDeclined']) {
    const f = fight(16, { resurrectionWand: 1 });
    kingdomChargeResurrection(f.player);
    f.player.life = 0; f.status = 'loss'; f[field] = true;
    assert.equal(kingdomResurrect(f, rolls()), null);
  }
});

test('Smarm Oil needs explicit opposite-sex humanoid confirmation and cannot fool brigands', () => {
  const f = fight(16, { smarmOil: 2 });
  assert.equal(kingdomSmarm(f, 0, false), false);
  assert.equal(kingdomSmarm(f, 0, true), true);
  assert.equal(f.player.magic.smarmOil, 1);
  const brigands = fight(41, { smarmOil: 2 });
  assert.equal(kingdomSmarm(brigands, 0, true), false);
  const dragon = fight(17, { smarmOil: 2 });
  assert.equal(kingdomSmarm(dragon, 0, true), false);
});

test('An unowned spell cannot begin a turn or consume dice', () => {
  const f = fight(16, {});
  assert.equal(kingdomCast(f, 'fireball', 0, {}, rolls()), null);
  assert.equal(f.rounds, 0);
});

test('Pointing bone costs five LIFE, one charge, and requires a humanoid not enjoying surprise', () => {
  const f = fight(16, { pointingBone: 2 });
  assert.equal(kingdomCast(f, 'pointingBone', 0, {}, rolls()).damage, 20);
  assert.equal(f.player.life, 43);
  assert.equal(f.player.magic.pointingBone, 1);
  const dragon = fight(17, { pointingBone: 1 });
  assert.equal(kingdomCast(dragon, 'pointingBone', 0, {}, rolls()), null);
});

test('The brigands cannot be fooled by a death mask', () => {
  const f = fight(41, { deathMask: 1 });
  assert.equal(kingdomCast(f, 'deathMask', 0, {}, rolls()), null);
  assert.equal(f.player.magic.deathMask, 1);
});

test('Death mask consumes one LIFE and allows escape without inventing enemy deaths', () => {
  const f = fight(16, { deathMask: 1 });
  kingdomCast(f, 'deathMask', 0, {}, rolls());
  assert.equal(f.status, 'win');
  assert.equal(f.player.life, 47);
  assert.ok(f.foes.every(foe => foe.life === 20 && foe.bypassed));
});

test('Fireball consumes its sole charge even when it misses', () => {
  const f = fight(16, { fireball: 1 });
  const event = kingdomCast(f, 'fireball', 0, {}, rolls(1, 1));
  assert.equal(event.damage, 0);
  assert.equal(f.player.magic.fireball, 0);
  assert.equal(f.active, 'enemy');
});

test('Lightning wand automatically deals two dice damage without weapon-armour subtraction', () => {
  const f = fight(17, { lightningWand: 8 });
  assert.equal(kingdomCast(f, 'lightningWand', 0, {}, rolls(6, 6)).damage, 12);
  assert.equal(f.player.magic.lightningWand, 7);
  assert.equal(f.foes[0].life, 43);
});

test('Berkwaddle resists magic below seven and still consumes that attempt', () => {
  const f = fight(178, { lightningWand: 8 });
  const event = kingdomCast(f, 'lightningWand', 0, {}, rolls(3, 3));
  assert.equal(event.resisted, true);
  assert.equal(f.foes[0].life, 100);
  assert.equal(f.player.magic.lightningWand, 7);
});

test('Wrong-answer every-third-attack handicap includes magic attacks', () => {
  const f = fight(172, { lightningWand: 8 });
  f.playerStrikes = 2;
  const event = kingdomCast(f, 'lightningWand', 0, {}, rolls(6, 6));
  assert.equal(event.forcedMiss, true);
  assert.equal(event.damage, 0);
  assert.equal(f.player.magic.lightningWand, 7);
});

test('Ebony rod requires both artifacts and only applies once before combat', () => {
  const f = fight(178, {}, { ebonyRod: true }, { ebonyRod: true, ruby: true });
  assert.equal(f.foes[0].life, 50);
  assert.equal(f.player.ebonyRodUsed, true);
  const reused = fight(178, {}, { ebonyRod: true }, { ebonyRod: true, ruby: true, ebonyRodUsed: true });
  assert.equal(reused.foes[0].life, 100);
});

test('Eye of Horus permits six consecutive hacks without an intervening enemy turn', () => {
  const f = fight(16, { eyeOfHorus: 3 });
  kingdomCast(f, 'eyeOfHorus', 0, {}, rolls());
  assert.equal(f.player.life, 38);
  for (let i = 0; i < 6; i++) {
    assert.equal(f.active, 'player');
    assert.equal(kingdomEnemyAttack(f, rolls()), null);
    kingdomPlayerAttack(f, 0, rolls(1, 1));
  }
  assert.equal(f.active, 'enemy');
});

test('Laughing globe assigns three free hacks to each of up to three distinct enemies', () => {
  const f = fight(16, { laughingGlobe: 1 });
  kingdomCast(f, 'laughingGlobe', 0, { targets: [0, 1, 2] }, rolls());
  for (const index of [0, 1, 2]) for (let i = 0; i < 3; i++) kingdomPlayerAttack(f, index, rolls(1, 1));
  assert.equal(f.active, 'enemy');
  assert.equal(f.attacksLeft, 0);
});

test('Sleep globe conserves its twelve enemy-rounds and rejects invalid allocations', () => {
  const f = fight(16, { sleepGlobe: 1 });
  assert.equal(kingdomCast(f, 'sleepGlobe', 0, { targets: [0, 0] }, rolls()), null);
  kingdomCast(f, 'sleepGlobe', 0, { targets: [0, 1, 2] }, rolls());
  assert.deepEqual(f.foes.map(foe => foe.sleepRounds), [4, 4, 4]);
  for (let i = 0; i < 3; i++) assert.equal(kingdomEnemyAttack(f, rolls()).kind, 'sleeping');
  assert.deepEqual(f.foes.map(foe => foe.sleepRounds), [3, 3, 3]);
});

test('Psionic helm halves one enemy damage for exactly seven combat rounds', () => {
  const f = fight(16, { psionicHelm: 1 });
  kingdomCast(f, 'psionicHelm', 0, {}, rolls());
  assert.equal(kingdomEnemyAttack(f, rolls(3, 3)).damage, 2);
  assert.equal(f.foes[0].psionicThroughRound, 7);
  assert.equal(f.foes[1].psionicThroughRound, undefined);
});

test('Sanctuary prevents ordinary damage but must be broken before a fifth round', () => {
  const f = fight(16, { sanctuaryScroll: 3 });
  kingdomCast(f, 'sanctuaryScroll', 0, {}, rolls());
  for (let i = 0; i < 3; i++) assert.equal(kingdomEnemyAttack(f, rolls(6, 6)).damage, 0);
  for (let round = 0; round < 3; round++) rollKingdomRound(f, 0, rolls(1, 1, 6, 6, 6, 6, 6, 6));
  assert.equal(f.player.life, 48);
  assert.equal(kingdomPlayerAttack(f, 0, rolls()), null);
  assert.equal(f.player.life, 0);
  assert.equal(f.status, 'loss');
});

test('Breaking sanctuary explicitly avoids suffocation and permits damage again', () => {
  const f = fight(16, { sanctuaryScroll: 1 });
  kingdomCast(f, 'sanctuaryScroll', 0, {}, rolls());
  assert.equal(kingdomBreakSanctuary(f), true);
  assert.equal(kingdomEnemyAttack(f, rolls(3, 3)).damage, 4);
});

test('Lightning rod consumes a charge only for a successful thunderbolt', () => {
  const f = fight(78, { lightningRod: 2 });
  kingdomPlayerAttack(f, 0, rolls(1, 1));
  const hit = kingdomEnemyAttack(f, rolls(6, 6));
  assert.equal(hit.damage, 0);
  assert.equal(hit.absorbed, true);
  assert.equal(f.player.magic.lightningRod, 1);
});

test('Destruction orb may kill Pip as well as the enemies and death takes priority', () => {
  const f = fight(16, { destructionOrb: 1 });
  kingdomCast(f, 'destructionOrb', 0, {}, rolls(3));
  assert.equal(f.status, 'loss');
  assert.equal(f.player.life, 0);
  assert.ok(f.foes.every(foe => foe.life === 0));
});

test('Fred can join either side and is never silently granted', () => {
  const hostile = fight(16, { deathbell: 1 });
  kingdomCast(hostile, 'deathbell', 0, {}, rolls(2));
  assert.equal(hostile.foes.at(-1).name, 'Fred');
  assert.equal(hostile.foes.at(-1).life, 66);
  const friendly = fight(16, { deathbell: 1 });
  kingdomCast(friendly, 'deathbell', 0, {}, rolls(3, 1, 1));
  assert.equal(friendly.ally.name, 'Fred');
  assert.equal(friendly.events.at(-1).kind, 'allyAttack');
});

test('Resurrection requires a paid precharge, a remaining use and nine or better', () => {
  const f = fight(16, { resurrectionWand: 2 });
  assert.equal(kingdomChargeResurrection(f.player), true);
  assert.equal(f.player.life, 33);
  assert.equal(kingdomChargeResurrection(f.player), false);
  f.player.life = 0; f.status = 'loss';
  assert.equal(kingdomResurrect(f, rolls(5, 4)).success, true);
  assert.equal(f.player.life, 48);
  assert.equal(f.player.magic.resurrectionWand, 1);
  assert.equal(f.player.resurrectionCharged, false);
});

test('Friendship mask must be charged before entry and cannot be repeatedly charged', () => {
  const p = character({ magic: { friendshipMask: 7 } });
  assert.equal(kingdomPrepareFriendship(p), true);
  assert.equal(p.magic.friendshipMask, 6);
  assert.equal(kingdomPrepareFriendship(p), false);
});

test('Lucky roll use is bounded and consumes one of the six bonuses', () => {
  const p = character({ luckyRolls: 1 });
  assert.equal(kingdomUseLuckyRoll(p, 12), 14);
  assert.equal(kingdomUseLuckyRoll(p, 12), null);
});

test('Vorpal weapon must be owned and removing the neck bolt is permanent', () => {
  const p = character();
  assert.equal(kingdomSwitchWeapon(p, 'vorpalSword'), false);
  p.magic.vorpalSword = 1;
  assert.equal(kingdomSwitchWeapon(p, 'vorpalSword'), true);
  assert.deepEqual([p.hit, p.bonus], [6, 0]);
  assert.equal(kingdomRemoveNeckBolt(p), true);
  assert.equal(kingdomRemoveNeckBolt(p), false);
  const f = startKingdomFight(p, 16, { neckArmed: true }, rolls(6, 6, 1, 1));
  assert.equal(f.neckArmed, false);
});
